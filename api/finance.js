const redis = require('../lib/redis');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Try Redis first (populated by cron on Pro plan)
  const cached = await redis.get('finance:latest').catch(() => null);
  if (cached) return res.json(cached);

  // Fall back to static file (populated by fetch.py via GitHub Actions)
  try {
    const file = path.join(__dirname, '..', 'public', 'finance.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json(data);
  } catch {}

  res.json({});
};
