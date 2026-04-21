const redis = require('../lib/redis');
const { shortId, getFingerprint, hashIp, getCountry } = require('../lib/helpers');
const containsRestrictedWord = require('../lib/profanity');
const { TTL, LIMITS } = require('../lib/constants');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return await listPosts(req, res);
    if (req.method === 'POST') return await createPost(req, res);
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0, 3) });
  }
};


async function listPosts(req, res) {
  const fingerprint = getFingerprint(req);

  // Mark this visitor as online (5 min TTL)
  await redis.set('online:' + fingerprint, 1, { ex: TTL.ONLINE });

  const onlineKeys = await redis.keys('online:*');
  const online = onlineKeys.length;

  const ids = await redis.zrange('posts:timeline', 0, LIMITS.MAX_POSTS - 1, { rev: true });
  if (!ids.length) return res.json({ posts: [], online });

  const pipeline = redis.pipeline();
  ids.forEach(id => pipeline.hgetall('post:' + id));
  const results = await pipeline.exec();

  const posts = results
    .filter(p => p && Object.keys(p).length > 0)
    .map(p => {
      const extends_ = typeof p.extends === 'string' ? JSON.parse(p.extends || '[]') : (p.extends || []);
      const reports  = typeof p.reports === 'string' ? JSON.parse(p.reports || '[]') : (p.reports || []);
      return {
        id:            p.id,
        name:          p.name,
        message:       p.message,
        timestamp:     parseInt(p.timestamp),
        country:       p.country || null,
        reply_to:      p.reply_to || null,
        reply_name:    p.reply_name || null,
        extendedCount: extends_.length,
        isExtended:    extends_.includes(fingerprint),
        reportCount:   reports.length,
        isReported:    reports.includes(fingerprint),
      };
    });

  res.json({ posts, online });
}


async function createPost(req, res) {
  const name    = (req.body.name || 'anon').trim().slice(0, LIMITS.MAX_NAME_LENGTH) || 'anon';
  const message = (req.body.message || '').trim().slice(0, LIMITS.MAX_MSG_LENGTH);
  if (!message) return res.status(400).json({ error: 'message required' });

  const fingerprint = getFingerprint(req);
  const ip          = hashIp(req);
  const country     = getCountry(req);

  if (containsRestrictedWord(message)) return res.status(400).json({ error: 'message contains restricted content.' });
  if (containsRestrictedWord(name))    return res.status(400).json({ error: 'name contains restricted content.' });

  // Flood protection
  const floodKey = 'flood:' + fingerprint;
  const floodCount = await redis.incr(floodKey);
  if (floodCount === 1) await redis.expire(floodKey, TTL.FLOOD_WINDOW);
  if (floodCount > LIMITS.FLOOD_MAX) return res.status(429).json({ error: 'too many posts. take a break.' });

  // Rate limit — 5s between posts
  const lastKey = 'lastpost:' + fingerprint;
  const lastTs = await redis.get(lastKey);
  if (lastTs && Date.now() - parseInt(lastTs) < 5000) {
    return res.status(429).json({ error: 'wait a few seconds' });
  }

  // Name locking — one name per person, one person per name
  if (name.toLowerCase() !== 'anon') {
    const nameOwner = await redis.get('name:' + name.toLowerCase());
    if (nameOwner && nameOwner !== fingerprint) {
      return res.status(400).json({ error: 'that name is taken. try another.' });
    }
    const currentName = await redis.get('user:' + fingerprint);
    if (currentName && currentName.toLowerCase() !== name.toLowerCase()) {
      return res.status(400).json({ error: `you're already posting as ${currentName}.` });
    }
    await redis.set('name:' + name.toLowerCase(), fingerprint, { ex: TTL.POST });
    await redis.set('user:' + fingerprint, name, { ex: TTL.POST });
  }

  const id  = shortId();
  const now = Date.now();

  const pipeline = redis.pipeline();
  pipeline.hset('post:' + id, {
    id, name, message,
    timestamp:  now,
    country:    country || '',
    ip,
    fingerprint,
    reply_to:   req.body.replyTo   || '',
    reply_name: req.body.replyName || '',
    extends:    '[]',
    reports:    '[]',
  });
  pipeline.expire('post:' + id, TTL.POST);
  pipeline.zadd('posts:timeline', { score: now, member: id });
  pipeline.set(lastKey, now, { ex: TTL.RATE_LIMIT });
  pipeline.incr('stats:all_time_posts');
  await pipeline.exec();

  res.json({
    id, name, message,
    timestamp:     now,
    country:       country || null,
    reply_to:      req.body.replyTo   || null,
    reply_name:    req.body.replyName || null,
    extendedCount: 0,
    isExtended:    false,
  });
}
