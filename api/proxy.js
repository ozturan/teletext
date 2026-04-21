const isUrlSafe = require('../lib/url-safety');

module.exports = async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!isUrlSafe(url)) return res.status(403).json({ error: 'Blocked url' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const text = await response.text();

    res.setHeader('Cache-Control', 'public, max-age=300');
    try { res.json(JSON.parse(text)); }
    catch { res.setHeader('Content-Type', 'text/plain'); res.send(text); }
  } catch (e) {
    res.status(502).json({ error: 'Fetch failed: ' + e.message });
  }
};
