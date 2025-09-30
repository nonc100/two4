const express = require('express');
const { BUCKETS } = require('../engines/cvdEngine');
const { normalizeTimeframe, SUPPORTED_TIMEFRAMES } = require('../utils/timeframes');
const { createMemoryCache } = require('../utils/cache');

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

const RESPONSE_CACHE = createMemoryCache({ ttlMs: 2 * 60 * 60 * 1000, maxEntries: 256 });

function buildSeries(rows, buckets) {
  const template = {};
  buckets.forEach((bucket) => {
    template[bucket.key] = [];
  });
  const deltas = {};
  buckets.forEach((bucket) => {
    deltas[bucket.key] = 0;
  });

  let previous = null;
  rows.forEach((row) => {
    const timestamp = Number(row.timestamp);
    const values = {
      all: Number(row.total),
      bucket0: Number(row.bucket0),
      bucket1: Number(row.bucket1),
      bucket2: Number(row.bucket2),
      bucket3: Number(row.bucket3),
      bucket4: Number(row.bucket4),
    };

    buckets.forEach((bucket) => {
      const val = Number(values[bucket.key]);
      if (!Number.isFinite(timestamp) || !Number.isFinite(val)) {
        return;
      }
      template[bucket.key].push([timestamp, val]);
    });

    if (previous) {
      buckets.forEach((bucket) => {
        const prev = Number(previous[bucket.key]);
        const next = Number(values[bucket.key]);
        if (Number.isFinite(prev) && Number.isFinite(next)) {
          deltas[bucket.key] = next - prev;
        }
      });
    }
    previous = values;
  });

  return { series: template, deltas };
}

function performIntegrityChecks(series, priceSeries) {
  if (!series || !series.all || series.all.length < 2 || !Array.isArray(priceSeries)) {
    return { warnings: [] };
  }

  const recent = series.all.slice(-20);
  const priceMap = new Map(priceSeries.map(([ts, val]) => [ts, val]));
  let mismatches = 0;
  recent.forEach(([ts, value], index) => {
    if (index === 0) return;
    const [prevTs, prevValue] = recent[index - 1];
    const delta = value - prevValue;
    const currentPrice = priceMap.get(ts);
    const prevPrice = priceMap.get(prevTs);
    if (!Number.isFinite(delta) || !Number.isFinite(currentPrice) || !Number.isFinite(prevPrice)) {
      return;
    }
    const priceDelta = currentPrice - prevPrice;
    if (priceDelta !== 0 && delta !== 0 && Math.sign(priceDelta) !== Math.sign(delta)) {
      mismatches += 1;
    }
  });

  const ratio = mismatches / Math.max(1, recent.length - 1);
  const warnings = [];
  if (ratio > 0.5) {
    warnings.push({
      type: 'cvd-sign-check',
      ratio,
    });
  }
  return { warnings };
}

module.exports = function createCvdRouter({ cvdEngine, cvdModel, priceModel }) {
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
        if (cvdModel) {
          docs = await cvdModel
            .find({ symbol, tf: timeframe })
            .sort({ t: -1 })
            .limit(limit)
            .select({ t: 1, all: 1, g0: 1, g1: 1, g2: 1, g3: 1, g4: 1, price: 1 })
            .lean();
        }

        const rows = (docs || [])
          .slice()
          .reverse()
          .map((doc) => ({
            timestamp: doc.t,
            total: doc.all,
            bucket0: doc.g0,
            bucket1: doc.g1,
            bucket2: doc.g2,
            bucket3: doc.g3,
            bucket4: doc.g4,
            price: doc.price ?? null,
          }));
        const buckets = formatBuckets();
        const { series, deltas } = buildSeries(rows, buckets);
        let priceRows = [];
        if (priceModel) {
          priceRows = await priceModel
            .find({ symbol, tf: timeframe, close: { $ne: null } })
            .sort({ t: -1 })
            .limit(limit)
            .select({ t: 1, close: 1 })
            .lean();
        }

        const priceSource = priceRows.length ? priceRows : docs;
        const price = priceSource
          .slice()
          .reverse()
          .map((row) => {
            const ts = Number(row.t ?? row.timestamp);
            const priceValue = row.close ?? row.price;
            const numericPrice = priceValue == null ? null : Number(priceValue);
            return [ts, numericPrice];
          })
          .filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val));
        const integrity = performIntegrityChecks(series, price);

        return {
          symbol,
          timeframe,
          buckets,
          series,
          price,
          deltas,
          meta: {
            lastPrice: rows.length ? rows[rows.length - 1].price : null,
            lastTimestamp: rows.length ? rows[rows.length - 1].timestamp : null,
            timeframes: SUPPORTED_TIMEFRAMES,
            integrity,
          },
        };
      });

      return res.json(payload);
    } catch (error) {
      console.error('[API/CVD] Failed to load history:', error.message);
      return res.status(500).json({ error: 'Failed to load CVD history.' });
    }
  });

  return router;
};
