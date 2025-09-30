const express = require('express');
const { normalizeTimeframe, timeframeToMs } = require('../utils/timeframes');
const { createMemoryCache } = require('../utils/cache');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const RESPONSE_CACHE = createMemoryCache({ ttlMs: 2 * 60 * 60 * 1000, maxEntries: 64 });

module.exports = function createHeatmapRouter({ heatmapEngine, heatmapModel }) {
  const router = express.Router();

  heatmapEngine.on('snapshot', () => {
    RESPONSE_CACHE.clear();
  });

  router.get('/', async (req, res) => {
    const symbol = (req.query.symbol || heatmapEngine.symbol || 'BTCUSDT').toUpperCase();
    const bins = clamp(Number.parseInt(req.query.bins, 10) || 120, 10, 500);
    const limit = clamp(Number.parseInt(req.query.limit, 10) || 720, 10, 720);
    const timeframe = normalizeTimeframe(req.query.tf, '1m');

    if (symbol !== heatmapEngine.symbol) {
      return res.status(404).json({ error: 'Symbol not tracked yet.' });
    }

    const cacheKey = [symbol, timeframe, bins, limit];

    try {
      const payload = await RESPONSE_CACHE.wrap(cacheKey, async () => {
        if (!heatmapModel) {
          return {
            symbol,
            timeframe,
            rows: [],
            cols: [],
            matrix: [],
            priceMin: null,
            priceMax: null,
            lastPrice: heatmapEngine.lastPrice,
          };
        }

        const timeframeMs = timeframeToMs(timeframe) || timeframeToMs('1m');
        const effectiveTf = timeframeMs || 60_000;
        const since = Math.max(0, Date.now() - effectiveTf * limit);
        const pipeline = [
          {
            $match: {
              symbol,
              tf: '1m',
              binLow: { $ne: null },
              t: { $gte: since },
            },
          },
          {
            $addFields: {
              bucket: {
                $subtract: ['$t', { $mod: ['$t', effectiveTf] }],
              },
            },
          },
          {
            $group: {
              _id: { bucket: '$bucket', binLow: '$binLow', binHigh: '$binHigh' },
              volume: { $sum: '$volUSDT' },
              priceMin: { $min: '$priceMin' },
              priceMax: { $max: '$priceMax' },
            },
          },
          {
            $group: {
              _id: '$_id.bucket',
              bins: {
                $push: {
                  binLow: '$_id.binLow',
                  binHigh: '$_id.binHigh',
                  volume: '$volume',
                },
              },
              priceMin: { $min: '$priceMin' },
              priceMax: { $max: '$priceMax' },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              t: '$_id',
              bins: 1,
              priceMin: 1,
              priceMax: 1,
            },
          },
          { $sort: { t: 1 } },
        ];

        const aggregated = await heatmapModel.aggregate(pipeline).exec();

        if (!aggregated.length) {
          return {
            symbol,
            timeframe,
            rows: [],
            cols: [],
            matrix: [],
            priceMin: null,
            priceMax: null,
            lastPrice: heatmapEngine.lastPrice,
          };
        }

        const colMap = new Map();
        const rows = [];
        let globalMin = Number.POSITIVE_INFINITY;
        let globalMax = Number.NEGATIVE_INFINITY;

        aggregated.forEach((entry) => {
          const timestamp = Number(entry.t);
          if (Number.isFinite(timestamp)) {
            rows.push(timestamp);
          }
          (entry.bins || []).forEach((cell) => {
            const low = Number(cell.binLow);
            const high = Number(cell.binHigh);
            const vol = Number(cell.volume);
            if (!Number.isFinite(low) || !Number.isFinite(vol)) {
              return;
            }
            if (!colMap.has(low)) {
              colMap.set(low, { low, high: Number.isFinite(high) ? high : low });
            }
            if (Number.isFinite(low)) {
              globalMin = Math.min(globalMin, low);
              globalMax = Math.max(globalMax, colMap.get(low).high);
            }
          });
          const entryMin = Number(entry.priceMin);
          if (Number.isFinite(entryMin)) {
            globalMin = Math.min(globalMin, entryMin);
          }
          const entryMax = Number(entry.priceMax);
          if (Number.isFinite(entryMax)) {
            globalMax = Math.max(globalMax, entryMax);
          }
        });

        const sortedCols = Array.from(colMap.values()).sort((a, b) => a.low - b.low);
        const colIndex = new Map(sortedCols.map((col, index) => [col.low, index]));
        const baseMatrix = aggregated.map((entry) => {
          const row = new Array(sortedCols.length).fill(0);
          (entry.bins || []).forEach((cell) => {
            const low = Number(cell.binLow);
            const vol = Number(cell.volume);
            if (!Number.isFinite(low) || !Number.isFinite(vol)) {
              return;
            }
            const idx = colIndex.get(low);
            if (idx != null) {
              row[idx] += vol;
            }
          });
          return row;
        });

        let finalCols = sortedCols.map((col) => col.low);
        let finalMatrix = baseMatrix;

        if (finalCols.length > bins) {
          const step = finalCols.length / bins;
          const downsampled = baseMatrix.map(() => new Array(bins).fill(0));
          const sampledCols = [];

          for (let idx = 0; idx < bins; idx += 1) {
            const start = Math.min(finalCols.length - 1, Math.floor(idx * step));
            let end = Math.min(finalCols.length - 1, Math.floor((idx + 1) * step) - 1);
            if (end < start) {
              end = start;
            }
            sampledCols.push(finalCols[start]);
            downsampled.forEach((row, rowIndex) => {
              let sum = 0;
              for (let col = start; col <= end; col += 1) {
                sum += baseMatrix[rowIndex][col] || 0;
              }
              row[idx] = sum;
            });
          }

          finalCols = sampledCols;
          finalMatrix = downsampled;
        }

        const metaDoc = await heatmapModel
          .findOne({ symbol, tf: '1m', binLow: null })
          .sort({ t: -1 })
          .select({ lastPrice: 1 })
          .lean();

        const lastPrice = Number.isFinite(metaDoc?.lastPrice)
          ? metaDoc.lastPrice
          : heatmapEngine.lastPrice;

        const priceMin = Number.isFinite(globalMin) ? globalMin : null;
        const priceMax = Number.isFinite(globalMax) ? globalMax : null;

        return {
          symbol,
          timeframe,
          rows,
          cols: finalCols,
          matrix: finalMatrix,
          priceMin,
          priceMax,
          lastPrice,
        };
      });

      return res.json(payload);
    } catch (error) {
      console.error('[API/HEATMAP] Failed to load snapshots:', error.message);
      return res.status(500).json({ error: 'Failed to load heatmap data.' });
    }
  });

  return router;
};
