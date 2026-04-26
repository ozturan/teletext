#!/usr/bin/env python3
"""Fetch news and finance data, summarize, save to public/."""

import json, os, re, ssl, time, unicodedata, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree

# ─── Config ──────────────────────────────────────────
ROOT       = Path(__file__).parent
PUBLIC     = ROOT / 'public'
OUTPUT     = PUBLIC / 'data.json'
OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')
SSL_CTX    = ssl.create_default_context()

BATCH_SIZE     = 10
MAX_PER_FEED   = 2
MAX_OG_SCRAPES = 50
STORY_MAX_AGE  = timedelta(hours=24)

FEEDS       = json.loads((ROOT / 'feeds.json').read_text())
TICKERS     = json.loads((ROOT / 'tickers.json').read_text())

SKIP_TITLES = {'puzzle', 'crossword', 'wordle', 'sudoku', 'quiz', 'horoscope',
               'connections', 'spelling bee', 'strands', 'mini crossword', 'tips for'}

MEDIA_NS = {
    'media':   'http://search.yahoo.com/mrss/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'dc':      'http://purl.org/dc/elements/1.1/',
    'atom':    'http://www.w3.org/2005/Atom',
}

CATEGORIES = 'Politics, World, Business, Tech, Science, Sports, Health, Culture, Environment'

# Non-English detection: if title has too many non-Latin characters, skip
def is_english(text):
    latin = sum(1 for c in text if unicodedata.category(c).startswith('L') and ord(c) < 0x250)
    total = sum(1 for c in text if unicodedata.category(c).startswith('L'))
    return total == 0 or (latin / total) > 0.7

# Headline clustering: group similar titles, keep the best per cluster
def normalize_title(title):
    return re.sub(r'[^a-z0-9 ]', '', title.lower()).strip()

def word_set(title):
    return set(normalize_title(title).split())

def cluster_stories(stories):
    """Group stories covering the same event, keep the best from each cluster."""
    clusters = []
    used = [False] * len(stories)

    for i, s in enumerate(stories):
        if used[i]:
            continue
        cluster = [i]
        ws_i = word_set(s['title'])
        if len(ws_i) < 3:
            clusters.append(cluster)
            used[i] = True
            continue

        for j in range(i + 1, len(stories)):
            if used[j]:
                continue
            ws_j = word_set(stories[j]['title'])
            if len(ws_j) < 3:
                continue
            overlap = len(ws_i & ws_j) / min(len(ws_i), len(ws_j))
            if overlap > 0.6:
                cluster.append(j)
                used[j] = True
        used[i] = True
        clusters.append(cluster)

    # Pick the best story from each cluster: prefer image, longer desc
    result = []
    for cluster in clusters:
        candidates = [stories[i] for i in cluster]
        candidates.sort(key=lambda s: (bool(s.get('image')), len(s.get('desc', ''))), reverse=True)
        result.append(candidates[0])

    return result

# Load existing stories from previous runs
def load_existing_stories():
    try:
        data = json.loads(OUTPUT.read_text())
        return data.get('stories', [])
    except Exception:
        return []


# ─── HTTP ────────────────────────────────────────────
def fetch_url(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; teletext/1.0)'})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
        return r.read().decode('utf-8', errors='replace')


def fetch_og_image(url):
    try:
        html = fetch_url(url, timeout=8)[:20000]
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if not m:
            m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.I)
        return m.group(1) if m else ''
    except Exception:
        return ''


# ─── RSS parsing ─────────────────────────────────────
def extract_image(item, desc_html):
    # Collect all media:content candidates; pick the largest by width
    best_url, best_w = '', 0
    for tag in ['media:content', 'media:thumbnail']:
        for el in item.findall(tag, MEDIA_NS):
            url = el.get('url', '')
            if not url:
                continue
            w = int(el.get('width', '0') or '0')
            if w > best_w or (not best_url and url):
                best_url, best_w = url, w
    if best_url and best_w >= 300:
        return best_url
    enc = item.find('enclosure')
    if enc is not None and 'image' in enc.get('type', '') and enc.get('url'):
        return enc.get('url')
    if best_url:
        return best_url
    if desc_html:
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_html)
        if m: return m.group(1)
    return ''


def text_of(item, *tags):
    for tag in tags:
        found = item.find(tag)
        if found is None:
            atom_tag = tag.split('}')[-1] if '}' in tag else tag
            found = item.find(f'{{http://www.w3.org/2005/Atom}}{atom_tag}')
        if found is not None and found.text:
            return found.text.strip()
    return ''


def fetch_all_news():
    stories = []

    for feed in FEEDS:
        try:
            root = ElementTree.fromstring(fetch_url(feed['url']))
            items = root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry')

            count = 0
            for item in items:
                if count >= MAX_PER_FEED:
                    break

                title = text_of(item, 'title', '{http://www.w3.org/2005/Atom}title')
                if not title or len(title) < 15:
                    continue
                if any(w in title.lower() for w in SKIP_TITLES):
                    continue

                # Link
                link = ''
                guid = item.find('guid')
                if guid is not None and guid.text and guid.text.startswith('http'):
                    link = guid.text.strip()
                if not link:
                    link_el = item.find('link')
                    if link_el is not None:
                        link = (link_el.text or '').strip() or link_el.get('href', '')
                if not link:
                    atom_link = item.find('{http://www.w3.org/2005/Atom}link')
                    if atom_link is not None:
                        link = atom_link.get('href', '')

                desc_html = text_of(item, 'description', '{http://www.w3.org/2005/Atom}summary', '{http://www.w3.org/2005/Atom}content')
                pubdate   = text_of(item, 'pubDate', '{http://www.w3.org/2005/Atom}published', '{http://www.w3.org/2005/Atom}updated')
                image     = extract_image(item, desc_html)
                desc_text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', desc_html)).strip()[:600]

                stories.append({
                    'title': title, 'source': feed['source'], 'sourceUrl': feed['url'],
                    'link': link, 'desc': desc_text, 'pubDate': pubdate, 'image': image,
                })
                count += 1

            print(f'  {feed["source"]:<20} {count} stories')
        except Exception as e:
            print(f'  {feed["source"]:<20} FAIL: {e}')

    # Deduplicate
    seen = set()
    unique = []
    for s in stories:
        key = re.sub(r'[^a-z0-9]', '', s['title'].lower())[:50]
        if key not in seen:
            seen.add(key)
            unique.append(s)

    # Filter old stories — require a parseable pubDate within window
    cutoff = datetime.now(timezone.utc) - STORY_MAX_AGE
    recent = []
    for s in unique:
        if not s.get('pubDate'):
            continue
        try:
            if parsedate_to_datetime(s['pubDate']) < cutoff:
                continue
        except Exception:
            continue
        recent.append(s)

    # Cap per source to ensure diversity
    MAX_PER_SOURCE = 2
    source_counts = {}
    diverse = []
    for s in recent:
        src = s['source']
        source_counts[src] = source_counts.get(src, 0) + 1
        if source_counts[src] <= MAX_PER_SOURCE:
            diverse.append(s)

    # Filter non-English titles
    english = [s for s in diverse if is_english(s['title'])]

    # Filter imageless stories (will be filtered on frontend anyway)
    with_img = [s for s in english if s.get('image')]
    no_img = [s for s in english if not s.get('image')]

    # Cluster similar headlines, keep best per event
    clustered = cluster_stories(with_img)
    # Add back some imageless stories (they may get og:image later)
    clustered += no_img[:20]

    print(f'\n  {len(stories)} raw → {len(unique)} deduped → {len(recent)} recent → {len(diverse)} after source cap')
    print(f'  → {len(english)} english → {len(with_img)} with image → {len(clustered)} after clustering')
    print(f'  {len(set(s["source"] for s in clustered))} unique sources')
    return clustered


# ─── LLM summarization ──────────────────────────────
def summarize_batch(batch):
    today = datetime.now(timezone.utc).strftime('%B %d, %Y')
    stories_text = '\n\n'.join(
        f'[STORY {i+1}]\nHeadline: {s["title"]}\nSource: {s["source"]}'
        + (f'\nPublished: {s["pubDate"]}' if s.get('pubDate') else '')
        + (f'\nText: {s["desc"]}' if s['desc'] else '')
        for i, s in enumerate(batch)
    )

    prompt = (
        f'You have {len(batch)} news stories below. '
        'For EACH story, write exactly 3 bullet points AND a category label. '
        'The reader will ONLY see the headline and your bullets — nothing else. '
        'Your bullets must tell the COMPLETE story so the reader never needs to click the article. '
        'Bullet 1: What happened — who did what, where, when. Name names, give numbers. '
        'Bullet 2: Key details — dollar amounts, percentages, vote counts, casualties, quotes. '
        'Bullet 3: What comes next or why it matters — consequences, context, deadlines. '
        'Each bullet: 15-25 words. Pack every bullet with SPECIFIC facts: names, numbers, dates, places, dollar figures, percentages. '
        'BAD: "Company announced major layoffs" GOOD: "Meta cutting 4,000 jobs across Reality Labs and Instagram, saving $3B annually" '
        'Never say "experts say", "some people", "significant", "major" — replace vague words with actual data. '
        'NEVER repeat the headline. Every bullet must add NEW information. '
        'NEVER invent or guess dates. Only use dates that appear in the headline or article text. '
        'If the article does not state a specific date, do NOT include any date. '
        f'Today is {today}. The article was published recently — do not reference past years unless the article explicitly does. '
        f'Category MUST be EXACTLY one of: {CATEGORIES}. Do NOT invent new categories. '
        'Category guide: Politics=government,elections,policy,diplomacy. World=international affairs,conflicts,regional news. '
        'Business=companies,markets,economy,trade. Tech=software,hardware,AI,internet,gadgets. '
        'Science=research,space,physics,biology,discoveries. Sports=games,athletes,leagues,tournaments. '
        'Health=medicine,disease,public health,mental health. Culture=arts,music,film,food,lifestyle,entertainment. '
        'Environment=climate,conservation,pollution,energy,wildlife. '
        'Use Culture ONLY for arts/entertainment — do NOT dump unrelated stories there. '
        'ALL bullets must be in English, even if the headline is in another language. '
        f'Return ONLY a JSON array of {len(batch)} objects: '
        '[{"bullets":["b1","b2","b3"],"category":"..."},...]'
        f'\n\n{stories_text}'
    )

    payload = json.dumps({
        'model': 'gpt-4o-mini',
        'messages': [
            {'role': 'system', 'content': f'You are a news summarizer. Today is {today}. Always write in English. NEVER invent dates — only use dates explicitly stated in the source text.'},
            {'role': 'user', 'content': prompt},
        ],
        'temperature': 0.2,
        'max_tokens': len(batch) * 200,
    }).encode()

    req = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=payload, headers={
        'Content-Type': 'application/json', 'Authorization': f'Bearer {OPENAI_KEY}',
    })

    with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
        text = json.loads(r.read())['choices'][0]['message']['content']

    text = text.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    text = text.replace('```json', '').replace('```', '').strip()
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return json.loads(text)


VALID_CATEGORIES = set(c.strip() for c in CATEGORIES.split(','))

CATEGORY_REMAP = {
    'crime': 'World', 'opinion': 'Culture', 'music': 'Culture',
    'entertainment': 'Culture', 'food': 'Culture', 'education': 'Science',
    'energy': 'Environment', 'climate': 'Environment', 'space': 'Science',
    'lifestyle': 'Culture', 'media': 'Culture', 'law': 'Politics',
}

def fix_category(cat):
    if cat in VALID_CATEGORIES:
        return cat
    return CATEGORY_REMAP.get(cat.lower(), 'World')

def apply_result(story, result):
    if isinstance(result, dict) and 'bullets' in result:
        story['bullets']  = result['bullets'][:3]
        story['category'] = fix_category(result.get('category', ''))
    else:
        story['bullets']  = ['Summary unavailable']
        story['category'] = 'World'


def summarize_all(stories):
    total = (len(stories) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(stories), BATCH_SIZE):
        batch = stories[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1

        for attempt in range(2):
            try:
                results = summarize_batch(batch)
                for j, s in enumerate(batch):
                    apply_result(s, results[j] if j < len(results) else None)
                print(f'  Batch {batch_num}/{total} OK ({len(batch)} stories)')
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode('utf-8', errors='replace')[:200] if e.fp else ''
                print(f'  Batch {batch_num} HTTP {e.code}: {body}')
                if e.code == 429 and attempt == 0:
                    print('  Rate limited, retrying in 20s...')
                    time.sleep(20)
                else:
                    for s in batch: apply_result(s, None)
            except Exception as e:
                print(f'  Batch {batch_num} error: {e}')
                for s in batch: apply_result(s, None)
                break

        time.sleep(1)


# ─── Finance ─────────────────────────────────────────
def fetch_finance():
    results = {}
    for t in TICKERS:
        try:
            url = f'https://query1.finance.yahoo.com/v8/finance/chart/{t["symbol"]}?range=1d&interval=1d'
            meta = json.loads(fetch_url(url))['chart']['result'][0]['meta']
            price = meta['regularMarketPrice']
            prev  = meta.get('chartPreviousClose') or meta.get('previousClose')
            change = round((price - prev) / prev * 100, 2) if prev and prev > 0 else None
            results[t['label']] = {'price': float(price), 'change': change}
            print(f'  {t["label"]:<10} ${price:.2f}')
            time.sleep(0.5)
        except Exception as e:
            print(f'  {t["label"]:<10} error: {e}')
    return results


# ─── Save ────────────────────────────────────────────
def save(stories, finance):
    output = {
        'updated': time.strftime('%Y-%m-%d %H:%M:%S'),
        'stories': [{k: s.get(k, '') for k in ('title', 'source', 'sourceUrl', 'link', 'category', 'bullets', 'pubDate', 'image')} for s in stories],
        'finance': finance,
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    (PUBLIC / 'finance.json').write_text(json.dumps(finance, ensure_ascii=False, indent=2))
    print(f'  Saved {len(stories)} stories + {len(finance)} tickers')


# ─── Main ────────────────────────────────────────────
if __name__ == '__main__':
    print(f'=== teletext fetch — {time.strftime("%Y-%m-%d %H:%M:%S")} ===\n')

    print('1. Load existing')
    existing = load_existing_stories()
    print(f'  {len(existing)} existing stories')

    print('\n2. Fetch fresh')
    fresh = fetch_all_news()

    print('\n3. Merge + filter')
    # Append fresh to existing — existing first, fresh overwrites duplicates
    by_key = {}
    for s in existing + fresh:
        key = re.sub(r'[^a-z0-9]', '', s.get('title', '').lower())[:50]
        if not key: continue
        by_key[key] = s
    merged = list(by_key.values())

    # Filter to last 24h — require a parseable pubDate within window
    cutoff = datetime.now(timezone.utc) - STORY_MAX_AGE
    recent = []
    for s in merged:
        if not s.get('pubDate'):
            continue
        try:
            if parsedate_to_datetime(s['pubDate']) < cutoff:
                continue
        except Exception:
            continue
        recent.append(s)

    # Sort newest first
    def sort_key(s):
        try: return -parsedate_to_datetime(s['pubDate']).timestamp()
        except: return 0
    recent.sort(key=sort_key)
    stories = recent
    print(f'  {len(existing)} existing + {len(fresh)} fresh → {len(merged)} merged → {len(stories)} in 24h')

    # Split: those with valid summaries vs needing one
    needs_summary = [s for s in stories if not (s.get('bullets') and s['bullets'] != ['Summary unavailable'])]
    print(f'  {len(stories) - len(needs_summary)} reused summaries, {len(needs_summary)} new to summarize')

    print('\n4. Summarize')
    summarize_all(needs_summary)

    print('\n5. Images')
    missing = [s for s in stories if not s.get('image') and s.get('link')][:MAX_OG_SCRAPES]
    found = 0
    for s in missing:
        img = fetch_og_image(s['link'])
        if img: s['image'] = img; found += 1
        time.sleep(0.2)
    total_imgs = sum(1 for s in stories if s.get('image'))
    print(f'  {found} og:images found, {total_imgs}/{len(stories)} total with images')

    print('\n6. Finance')
    finance = fetch_finance()

    print('\n7. Save')
    save(stories, finance)
    print('\nDone.')
