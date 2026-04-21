# teletext

Teletext-style news, markets, and weather dashboard. Live at https://ttxt.org.

## Stack

- Python fetcher (`fetch.py`) that pulls RSS, generates summaries, and writes
  `public/data.json` + `public/finance.json`
- Node/Vercel API endpoints in `api/`
- Static frontend in `public/`
- GitHub Actions for scheduled fetches

## Running locally

    node dev.js
