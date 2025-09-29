const express = require('express');

module.exports = function createPriceRouter({ cvdEngine }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || cvdEngine.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = String(req.query.tf || '1m');
    const limit = Math.min(10_000, Math.max(10, Number.parseInt(req.query.limit, 10) || 1440));

    if (timeframe !== '1m') {
      return res.status(400).json({ error: 'Only 1m timeframe is supported for now.' });
    }

    if (symbol !== cvdEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    try {
      const rows = await cvdEngine.getPriceHistory({ limit });
      const points = rows.map((row) => ({
        timestamp: row.minute,
        price: row.price,
      }));

      return res.json({
        symbol,
        timeframe,
        points,
        meta: {
          lastPrice: rows.length ? rows[rows.length - 1].price : null,
        },
      });
    } catch (error) {
      console.error('[API/PRICE] Failed to load prices:', error.message);
      return res.status(500).json({ error: 'Failed to load price history.' });
    }
  });

  return router;
};
