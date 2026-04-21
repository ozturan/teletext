const redis = require('../lib/redis');
const { TTL } = require('../lib/constants');

module.exports = async (req, res) => {
  const symbol = (req.query.symbol || '').trim().toUpperCase();
  if (!symbol || symbol.length > 20) return res.status(400).json({ error: 'invalid symbol' });

  const cached = await redis.get('quote:' + symbol);
  if (cached) return res.json(cached);

  let yahooSymbol = symbol.includes('/') ? symbol.replace('/', '') + '=X' : symbol;

  // Try to resolve the symbol via Yahoo Finance search if direct lookup might fail
  async function resolveSymbol(sym) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=1&newsCount=0`;
      const data = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) })).json();
      return data.quotes?.[0]?.symbol || null;
    } catch { return null; }
  }

  async function fetchQuote(sym) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const change = (prev > 0) ? Math.round((price - prev) / prev * 10000) / 100 : null;
    return { price, change };
  }

  try {
    // Try direct symbol first
    const result = await fetchQuote(yahooSymbol);
    await redis.set('quote:' + symbol, result, { ex: TTL.QUOTE_CACHE });
    return res.json(result);
  } catch {}

  // If direct fails, search Yahoo for the right symbol and retry
  try {
    const resolved = await resolveSymbol(symbol);
    if (resolved) {
      const result = await fetchQuote(resolved);
      await redis.set('quote:' + symbol, result, { ex: TTL.QUOTE_CACHE });
      return res.json(result);
    }
  } catch {}

  res.status(404).json({ error: 'symbol not found' });
};
