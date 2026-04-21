#!/usr/bin/env node
/**
 * Local dev server — serves public/ and handles API routes without Redis.
 * Finance/news come from static files. Image proxy works. Wall is stubbed.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function proxyUrl(targetUrl, res) {
  const client = targetUrl.startsWith('https') ? https : http;
  client.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, proxyRes => {
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      proxyUrl(proxyRes.headers.location, res);
      return;
    }
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res);
  }).on('error', () => { res.writeHead(502); res.end(); });
}

function jsonResponse(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // API: image proxy
  if (pathname === '/img') {
    const target = url.searchParams.get('url');
    if (!target) { res.writeHead(400); res.end('Missing url'); return; }
    proxyUrl(target, res);
    return;
  }

  // API: generic proxy (for Polymarket etc)
  if (pathname === '/api/proxy') {
    const target = url.searchParams.get('url');
    if (!target) { jsonResponse(res, { error: 'Missing url' }); return; }
    const client = target.startsWith('https') ? https : http;
    client.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, proxyRes => {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      });
    }).on('error', () => { jsonResponse(res, { error: 'fetch failed' }); });
    return;
  }

  // API: finance — serve from static file
  if (pathname === '/api/finance') {
    serveFile(res, path.join(PUBLIC, 'finance.json'));
    return;
  }

  // API: geo — return defaults for local dev
  if (pathname === '/api/geo') {
    jsonResponse(res, { country: 'CA', countryName: '', city: 'Vancouver', lat: 49.28, lon: -123.12, tz: 'America/Vancouver' });
    return;
  }

  // API: country-news — stub
  if (pathname === '/api/country-news') {
    jsonResponse(res, { stories: [] });
    return;
  }

  // API: wall — stubs
  if (pathname === '/api/posts') {
    jsonResponse(res, { posts: [] });
    return;
  }
  if (pathname === '/api/stats') {
    jsonResponse(res, { posts: 0, people: 0, countries: 0, countryCodes: [], online: 1 });
    return;
  }

  // API: config — stubs
  if (pathname.startsWith('/api/config')) {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => jsonResponse(res, { code: 'dev000' }));
    } else {
      jsonResponse(res, {});
    }
    return;
  }

  // API: quote — pass through to Yahoo
  if (pathname === '/api/quote') {
    const symbol = url.searchParams.get('symbol');
    const yahooSym = symbol.includes('/') ? symbol.replace('/', '') + '=X' : symbol;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?range=1d&interval=1d`;
    https.get(yahooUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, proxyRes => {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        try {
          const meta = JSON.parse(data).chart.result[0].meta;
          const price = meta.regularMarketPrice;
          const prev = meta.chartPreviousClose || meta.previousClose;
          const change = prev > 0 ? Math.round((price - prev) / prev * 10000) / 100 : null;
          jsonResponse(res, { price, change });
        } catch { res.writeHead(404); res.end('{}'); }
      });
    }).on('error', () => { res.writeHead(502); res.end('{}'); });
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);

  // Short code routing — serve index.html for 6-char alphanumeric paths
  if (/^\/[a-z0-9]{6}$/.test(pathname)) {
    filePath = path.join(PUBLIC, 'index.html');
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n  teletext dev → http://localhost:${PORT}\n`);
});
