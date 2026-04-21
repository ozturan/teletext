const redis = require('../../../lib/redis');
const { getFingerprint } = require('../../../lib/helpers');
const { TTL } = require('../../../lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const id = req.query.id;
  const fingerprint = getFingerprint(req);

  const post = await redis.hgetall('post:' + id);
  if (!post || Object.keys(post).length === 0) return res.status(404).json({ error: 'not found' });
  if (post.fingerprint === fingerprint) return res.status(400).json({ error: "can't vote own post" });

  const extends_ = typeof post.extends === 'string' ? JSON.parse(post.extends || '[]') : (post.extends || []);
  const idx = extends_.indexOf(fingerprint);

  if (idx !== -1) extends_.splice(idx, 1);
  else extends_.push(fingerprint);

  const bonusDays = Math.floor(extends_.length / 5);
  const ttl = TTL.POST * (1 + bonusDays);

  const pipeline = redis.pipeline();
  pipeline.hset('post:' + id, { extends: JSON.stringify(extends_) });
  pipeline.expire('post:' + id, ttl);
  await pipeline.exec();

  res.json({ extendedCount: extends_.length, bonusDays });
};
