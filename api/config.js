const redis = require('../lib/redis');
const { shortId } = require('../lib/helpers');
const { TTL, LIMITS } = require('../lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid' });

  const json = JSON.stringify(data);
  if (json.length > LIMITS.MAX_CONFIG_SIZE) return res.status(400).json({ error: 'too large' });

  // If client sends its existing code, update in place
  const existingCode = data._code;
  if (existingCode && await redis.exists('config:' + existingCode)) {
    const toSave = { ...data };
    delete toSave._code;
    await redis.set('config:' + existingCode, toSave, { ex: TTL.CONFIG });
    return res.json({ code: existingCode });
  }

  // New user — create a fresh code
  let code, attempts = 0;
  do { code = shortId(4); attempts++; }
  while (await redis.exists('config:' + code) && attempts < 20);

  const toSave = { ...data };
  delete toSave._code;
  await redis.set('config:' + code, toSave, { ex: TTL.CONFIG });
  res.json({ code });
};
