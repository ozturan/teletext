const crypto = require('crypto');

function shortId(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';
}

function getFingerprint(req) {
  const raw = getIp(req) + (req.headers['user-agent'] || '');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function hashIp(req) {
  return crypto.createHash('sha256').update(getIp(req)).digest('hex').slice(0, 16);
}

function getCountry(req) {
  return req.headers['x-vercel-ip-country'] || null;
}

module.exports = { shortId, getIp, getFingerprint, hashIp, getCountry };
