const redis = require('../../lib/redis');
const { TICKERS, TTL } = require('../../lib/constants');

module.exports = async (req, res) => {
  const results = {};

  for (const ticker of TICKERS) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.symbol}?range=1d&interval=1d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      const meta = data.chart.result[0].meta;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose || meta.previousClose;

      results[ticker.label] = {
        price,
        change: (prev > 0) ? Math.round((price - prev) / prev * 10000) / 100 : null,
      };
    } catch {}
  }

  if (Object.keys(results).length) {
    await redis.set('finance:latest', results, { ex: TTL.FINANCE_CACHE });
  }

  res.json({ ok: true, tickers: Object.keys(results).length });
};
