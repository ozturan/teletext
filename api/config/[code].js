const redis = require('../../lib/redis');
const { TTL } = require('../../lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const code = req.query.code;
  const data = await redis.get('config:' + code);
  if (!data) return res.status(404).json({ error: 'not found' });

  await redis.expire('config:' + code, TTL.CONFIG);

  // Upstash returns objects directly — no parsing needed
  res.json(data);
};
