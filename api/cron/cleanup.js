const redis = require('../../lib/redis');

module.exports = async (req, res) => {
  const ids = await redis.zrange('posts:timeline', 0, -1);
  let removed = 0;

  if (ids.length) {
    const pipeline = redis.pipeline();
    ids.forEach(id => pipeline.exists('post:' + id));
    const results = await pipeline.exec();

    const stale = ids.filter((_, i) => !results[i]);
    if (stale.length) {
      await redis.zrem('posts:timeline', ...stale);
      removed = stale.length;
    }
  }

  res.json({ ok: true, removed });
};
