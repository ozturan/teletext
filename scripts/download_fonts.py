#!/usr/bin/env python3
"""Download Google Fonts as woff2 files and emit a self-hosted CSS file."""

import os
import re
import urllib.request

GOOGLE_FONTS_URL = (
    "https://fonts.googleapis.com/css2?"
    "family=Open+Sans:wght@300;400;500;600&"
    "family=Source+Code+Pro:wght@300;400;500&"
    "family=Source+Serif+4:wght@400;600;700&"
    "family=Inter:wght@300;400;500;700;800&"
    "family=JetBrains+Mono:wght@300;400;500;800&"
    "family=DM+Sans:wght@300;400;500&"
    "family=DM+Mono:wght@300;400;500&"
    "family=Outfit:wght@300;400;500&"
    "family=IBM+Plex+Mono:wght@300;400;500&"
    "display=swap"
)

UA_CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "public", "fonts")
CSS_OUT = os.path.join(ROOT, "public", "fonts.css")


def fetch(url, ua=UA_CHROME):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    return urllib.request.urlopen(req).read()


def main():
    os.makedirs(FONT_DIR, exist_ok=True)
    print("Fetching Google Fonts CSS...")
    css = fetch(GOOGLE_FONTS_URL).decode()

    # Keep only @font-face blocks whose unicode-range covers basic latin (U+0000..U+00FF)
    # These are: latin (default), latin-ext. Drop cyrillic, greek, vietnamese, etc.
    keep_blocks = []
    for block in re.findall(r"/\*[^*]*\*/\s*@font-face\s*\{[^}]*\}", css, re.DOTALL):
        comment = re.match(r"/\*\s*([^*]+?)\s*\*/", block).group(1).strip()
        if comment in ("latin", "latin-ext"):
            keep_blocks.append(block)

    css_filtered = "\n".join(keep_blocks)
    urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", css_filtered)
    print(f"Found {len(urls)} latin font files to download.")

    new_css = css_filtered
    for url in urls:
        fname = url.split("/")[-1]
        local = os.path.join(FONT_DIR, fname)
        if not os.path.exists(local):
            print(f"  downloading {fname}")
            data = fetch(url)
            with open(local, "wb") as f:
                f.write(data)
        new_css = new_css.replace(url, f"/fonts/{fname}")

    with open(CSS_OUT, "w") as f:
        f.write(new_css)
    print(f"Wrote {CSS_OUT} ({len(keep_blocks)} @font-face blocks).")


if __name__ == "__main__":
    main()
