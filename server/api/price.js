const express = require('express');
const { normalizeTimeframe, SUPPORTED_TIMEFRAMES } = require('../utils/timeframes');
const { createMemoryCache } = require('../utils/cache');

const RESPONSE_CACHE = createMemoryCache({ ttlMs: 2 * 60 * 60 * 1000, maxEntries: 128 });

module.exports = function createPriceRouter({ cvdEngine, priceModel }) {
  const router = express.Router();

  cvdEngine.on('minute', () => {
    RESPONSE_CACHE.clear();
  });

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || cvdEngine.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = normalizeTimeframe(req.query.tf, '1m');
    const limit = Math.min(5000, Math.max(10, Number.parseInt(req.query.limit, 10) || 1440));

    if (symbol !== cvdEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    const cacheKey = [symbol, timeframe, limit];

    try {
      const payload = await RESPONSE_CACHE.wrap(cacheKey, async () => {
        let docs = [];
        if (priceModel) {
          docs = await priceModel
            .find({ symbol, tf: timeframe, close: { $ne: null } })
            .sort({ t: -1 })
            .limit(limit)
            .select({ t: 1, close: 1 })
            .lean();
        }

        let rows = [];
        if (docs.length) {
          rows = docs
            .slice()
            .reverse()
            .map((doc) => ({
              timestamp: doc.t,
              price: doc.close,
            }));
        } else {
          rows = await cvdEngine.getPriceHistory({ limit, timeframe });
        }

        const prices = rows
          .map((row) => {
            const ts = Number(row.timestamp);
            const priceValue = row.price == null ? null : Number(row.price);
            return [ts, priceValue];
          })
          .filter(([ts, priceValue]) => Number.isFinite(ts) && Number.isFinite(priceValue));

        return {
          symbol,
          timeframe,
          prices,
          meta: {
            lastPrice: rows.length ? rows[rows.length - 1].price : null,
            timeframes: SUPPORTED_TIMEFRAMES,
          },
        };
      });

      return res.json(payload);
    } catch (error) {
      console.error('[API/PRICE] Failed to load prices:', error.message);
      return res.status(500).json({ error: 'Failed to load price history.' });
    }
  });

  return router;
};
