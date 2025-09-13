const { proxyFetch } = require('../_shared/fetcher');
const { hit, keep } = require('../_shared/cache');

module.exports = async function current(req, res) {
  const lat = req.query.lat || '37.56';
  const lon = req.query.lon || '126.97';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const key = `WEATHER:${lat},${lon}`;
  const cached = hit(key);
  if (cached) return res.type(cached.ct).status(cached.status).send(cached.body);
  const payload = await proxyFetch(url);
  res.type(payload.ct).status(payload.status).send(payload.body);
  keep(key, payload);
};
