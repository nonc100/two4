const express = require('express');
const { normalizeTimeframe, SUPPORTED_TIMEFRAMES } = require('../utils/timeframes');

module.exports = function createPriceRouter({ cvdEngine }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || cvdEngine.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = normalizeTimeframe(req.query.tf, '1m');
    const limit = Math.min(10_000, Math.max(10, Number.parseInt(req.query.limit, 10) || 1440));

    if (symbol !== cvdEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    try {
      const rows = await cvdEngine.getPriceHistory({ limit, timeframe });
      const prices = rows.map((row) => ({
        t: row.timestamp,
        close: row.price,
      }));

      return res.json({
        symbol,
        timeframe,
        prices,
        meta: {
          lastPrice: rows.length ? rows[rows.length - 1].price : null,
          timeframes: SUPPORTED_TIMEFRAMES,
        },
      });
    } catch (error) {
      console.error('[API/PRICE] Failed to load prices:', error.message);
      return res.status(500).json({ error: 'Failed to load price history.' });
    }
  });

  return router;
};
