const express = require('express');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = function createHeatmapRouter({ heatmapEngine }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || heatmapEngine.symbol || 'BTCUSDT').toUpperCase();
    const bins = clamp(Number.parseInt(req.query.bins, 10) || 120, 10, 500);
    const limit = clamp(Number.parseInt(req.query.limit, 10) || 720, 10, 2000);

    if (symbol !== heatmapEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    try {
      const rows = await heatmapEngine.getSnapshots({ limit });
      if (!rows.length) {
        return res.json({
          symbol,
          timestamps: [],
          matrix: [],
          priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
          maxValue: 0,
          lastPrice: heatmapEngine.lastPrice,
        });
      }

      const parsed = rows.map((row) => ({
        timestamp: row.timestamp,
        bids: JSON.parse(row.bids || '[]'),
        asks: JSON.parse(row.asks || '[]'),
        lastPrice: row.last_price,
      }));

      let minPrice = Number.POSITIVE_INFINITY;
      let maxPrice = Number.NEGATIVE_INFINITY;
      parsed.forEach((snapshot) => {
        snapshot.bids.forEach(([price]) => {
          const value = Number(price);
          if (Number.isFinite(value)) {
            minPrice = Math.min(minPrice, value);
            maxPrice = Math.max(maxPrice, value);
          }
        });
        snapshot.asks.forEach(([price]) => {
          const value = Number(price);
          if (Number.isFinite(value)) {
            minPrice = Math.min(minPrice, value);
            maxPrice = Math.max(maxPrice, value);
          }
        });
      });

      if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
        return res.json({
          symbol,
          timestamps: [],
          matrix: [],
          priceBins: { count: bins, min: null, max: null, step: null, centers: [] },
          maxValue: 0,
          lastPrice: heatmapEngine.lastPrice,
        });
      }

      if (minPrice === maxPrice) {
        const padding = Math.max(1, minPrice * 0.001);
        minPrice -= padding;
        maxPrice += padding;
      }

      const range = maxPrice - minPrice;
      const step = range > 0 ? range / bins : Math.max(1, minPrice * 0.001);
      const centers = Array.from({ length: bins }, (_, idx) => minPrice + step * (idx + 0.5));

      let globalMax = 0;
      const matrix = parsed.map((snapshot) => {
        const rowValues = new Array(bins).fill(0);
        const accumulate = (levels) => {
          levels.forEach(([price, qty]) => {
            const priceNum = Number(price);
            const qtyNum = Number(qty);
            if (!Number.isFinite(priceNum) || !Number.isFinite(qtyNum)) {
              return;
            }
            const index = Math.min(
              bins - 1,
              Math.max(0, Math.floor((priceNum - minPrice) / step))
            );
            const notional = Math.abs(priceNum * qtyNum);
            rowValues[index] += notional;
          });
        };
        accumulate(snapshot.bids);
        accumulate(snapshot.asks);
        const localMax = Math.max(...rowValues);
        if (Number.isFinite(localMax)) {
          globalMax = Math.max(globalMax, localMax);
        }
        return rowValues;
      });

      return res.json({
        symbol,
        timestamps: parsed.map((snapshot) => snapshot.timestamp),
        matrix,
        priceBins: {
          count: bins,
          min: minPrice,
          max: maxPrice,
          step,
          centers,
        },
        maxValue: globalMax,
        lastPrice: parsed[parsed.length - 1].lastPrice ?? heatmapEngine.lastPrice,
      });
    } catch (error) {
      console.error('[API/HEATMAP] Failed to load snapshots:', error.message);
      return res.status(500).json({ error: 'Failed to load heatmap data.' });
    }
  });

  return router;
};
