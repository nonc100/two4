const express = require('express');
const { BUCKETS } = require('../engines/cvdEngine');

function formatBuckets() {
  return [
    { key: 'all', label: 'All Orders' },
    ...BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      range: [bucket.min, Number.isFinite(bucket.max) ? bucket.max : null],
    })),
  ];
}

module.exports = function createCvdRouter({ cvdEngine }) {
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
      const rows = await cvdEngine.getHistory({ limit });
      const buckets = formatBuckets();
      const payload = rows.map((row) => ({
        timestamp: row.minute,
        values: {
          all: row.total,
          bucket0: row.bucket0,
          bucket1: row.bucket1,
          bucket2: row.bucket2,
          bucket3: row.bucket3,
          bucket4: row.bucket4,
        },
        price: row.price,
      }));

      return res.json({
        symbol,
        timeframe,
        buckets,
        points: payload,
        meta: {
          lastPrice: rows.length ? rows[rows.length - 1].price : null,
          lastTimestamp: rows.length ? rows[rows.length - 1].minute : null,
        },
      });
    } catch (error) {
      console.error('[API/CVD] Failed to load history:', error.message);
      return res.status(500).json({ error: 'Failed to load CVD history.' });
    }
  });

  return router;
};
