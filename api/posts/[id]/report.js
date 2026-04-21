const redis = require('../../../lib/redis');
const { getFingerprint } = require('../../../lib/helpers');
const { TTL, LIMITS } = require('../../../lib/constants');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const id = req.query.id;
  const fingerprint = getFingerprint(req);

  const post = await redis.hgetall('post:' + id);
  if (!post || Object.keys(post).length === 0) return res.status(404).json({ error: 'not found' });
  if (post.fingerprint === fingerprint) return res.status(400).json({ error: "can't report own post" });

  // Cooldown
  const cooldownKey = 'report_cooldown:' + fingerprint;
  if (await redis.get(cooldownKey)) return res.status(429).json({ error: 'wait before reporting again' });

  const reports = typeof post.reports === 'string' ? JSON.parse(post.reports || '[]') : (post.reports || []);
  if (reports.includes(fingerprint)) return res.status(400).json({ error: 'already reported' });

  reports.push(fingerprint);
  await redis.set(cooldownKey, 1, { ex: TTL.REPORT_COOLDOWN });

  if (reports.length >= LIMITS.REPORTS_TO_DELETE) {
    const pipeline = redis.pipeline();
    pipeline.del('post:' + id);
    pipeline.zrem('posts:timeline', id);
    await pipeline.exec();
    return res.json({ deleted: true, reportCount: reports.length });
  }

  await redis.hset('post:' + id, { reports: JSON.stringify(reports) });
  res.json({ reportCount: reports.length, isReported: true });
};
