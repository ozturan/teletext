module.exports = (req, res) => {
  res.json({
    country:     req.headers['x-vercel-ip-country']   || '',
    countryName: '',
    city:        req.headers['x-vercel-ip-city']      || '',
    lat:         parseFloat(req.headers['x-vercel-ip-latitude'])  || 0,
    lon:         parseFloat(req.headers['x-vercel-ip-longitude']) || 0,
    tz:          req.headers['x-vercel-ip-timezone']   || '',
  });
};
