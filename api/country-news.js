const redis = require('../lib/redis');
const { COUNTRY_FEEDS, TTL } = require('../lib/constants');

function parseRss(xml, source) {
  return xml.split(/<item[ >]/i).slice(1, 11).reduce((stories, item) => {
    let title = (item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    if (!title) return stories;

    let link = (item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '';
    link = link.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

    let pubDate = (item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    pubDate = pubDate.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

    if (pubDate && !isNaN(new Date(pubDate)) && Date.now() - new Date(pubDate).getTime() > 48 * 3600000) {
      return stories;
    }

    stories.push({ title, source, link, pubDate: pubDate || new Date().toISOString(), local: true });
    return stories;
  }, []);
}

module.exports = async (req, res) => {
  const cc = (req.query.cc || '').toUpperCase();
  if (!cc || !COUNTRY_FEEDS[cc]) return res.json({ stories: [] });

  const cached = await redis.get('news:' + cc);
  if (cached) return res.json({ stories: cached });

  const feeds = COUNTRY_FEEDS[cc];
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      return parseRss(await response.text(), feed.label);
    })
  );

  const stories = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  await redis.set('news:' + cc, stories, { ex: TTL.NEWS_CACHE });
  res.json({ stories });
};
