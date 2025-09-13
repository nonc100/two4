const { proxyFetch } = require('../_shared/fetcher');

module.exports = async function ohlc(req, res) {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=1`;
  const payload = await proxyFetch(url);
  if (payload.ok) {
    try {
      const data = JSON.parse(payload.body)[0];
      const body = {
        symbol,
        open: Number(data[1]),
        high: Number(data[2]),
        low: Number(data[3]),
        close: Number(data[4])
      };
      return res.json(body);
    } catch (e) {}
  }
  res.type(payload.ct).status(payload.status).send(payload.body);
};
