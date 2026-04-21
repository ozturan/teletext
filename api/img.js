const isUrlSafe = require('../lib/url-safety');

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');
  if (!isUrlSafe(url)) return res.status(403).send('Blocked url');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return res.status(502).send('');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch {
    res.status(502).send('');
  }
};
