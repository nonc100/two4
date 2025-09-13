const { proxyFetch } = require('../_shared/fetcher');
const { hit, keep } = require('../_shared/cache');

module.exports = async function price(req, res) {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
  const key = `PRICE:${symbol}`;
  const cached = hit(key);
  if (cached) return res.type(cached.ct).status(cached.status).send(cached.body);

  const payload = await proxyFetch(url);
  keep(key, payload);
  res.type(payload.ct).status(payload.status).send(payload.body);
};
