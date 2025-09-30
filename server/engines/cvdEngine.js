const EventEmitter = require('events');
const WebSocket = require('ws');

const { SUPPORTED_TIMEFRAMES, timeframeToMs, normalizeTimeframe } = require('../utils/timeframes');

const BUCKETS = [
  { key: 'bucket0', label: '$0 - $10K', min: 0, max: 10_000 },
  { key: 'bucket1', label: '$10K - $100K', min: 10_000, max: 100_000 },
  { key: 'bucket2', label: '$100K - $1M', min: 100_000, max: 1_000_000 },
  { key: 'bucket3', label: '$1M - $10M', min: 1_000_000, max: 10_000_000 },
  { key: 'bucket4', label: '$10M+', min: 10_000_000, max: Infinity },
];

class CVDEngine extends EventEmitter {
  constructor({ cvdModel, priceModel, symbol }) {
    super();
    this.cvdModel = cvdModel;
    this.priceModel = priceModel;
    this.symbol = symbol.toUpperCase();
    this.symbolLower = this.symbol.toLowerCase();
    this.ws = null;
    this.connected = false;

    this.currentMinute = null;
    this.pending = this.createZeroBuckets();
    this.pendingTotal = 0;
    this.cumulative = this.createZeroBuckets();
    this.cumulativeTotal = 0;
    this.lastPrice = null;
    this.lastTimestamp = null;
    this.heartbeatInterval = null;
    this.retryAttempt = 0;
    this.restoreState();
  }

  restoreState() {
    if (!this.cvdModel) {
      return;
    }

    this.cvdModel
      .findOne({ symbol: this.symbol, tf: '1m' })
      .sort({ t: -1 })
      .lean()
      .then((doc) => {
        if (!doc) {
          return;
        }
        this.cumulative = [doc.g0, doc.g1, doc.g2, doc.g3, doc.g4];
        this.cumulativeTotal = doc.all;
        this.currentMinute = doc.t;
        this.lastPrice = doc.price ?? null;
      })
      .catch((error) => {
        console.error('[CVD] Failed to restore state:', error.message);
      });
  }

  createZeroBuckets() {
    return BUCKETS.map(() => 0);
  }

  start() {
    if (this.ws) {
      return;
    }
    this.connect();
    if (!this.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        this.flushIfStale();
      }, 15_000);
      this.heartbeatInterval.unref?.();
    }
  }

  connect() {
    const endpoint = `wss://stream.binance.com:9443/ws/${this.symbolLower}@trade`;
    this.ws = new WebSocket(endpoint);

    this.ws.on('open', () => {
      this.connected = true;
      this.retryAttempt = 0;
      console.log(`[CVD] Connected trade stream for ${this.symbol}`);
    });

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (!payload || payload.s !== this.symbol) {
          return;
        }
        this.handleTrade(payload);
      } catch (error) {
        console.error('[CVD] Failed to parse trade message:', error.message);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(this.retryAttempt, 5));
      this.retryAttempt += 1;
      console.warn(`[CVD] Trade stream closed for ${this.symbol}, retrying in ${Math.round(delay / 1000)}s`);
      const timer = setTimeout(() => this.connect(), delay);
      timer.unref?.();
    });

    this.ws.on('error', (error) => {
      console.error('[CVD] Trade stream error:', error.message);
      this.ws?.close();
    });
  }

  stop() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleTrade(trade) {
    const price = Number(trade.p);
    const quantity = Number(trade.q);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) {
      return;
    }

    const tradeTime = Number(trade.T || trade.E || Date.now());
    const minute = Math.floor(tradeTime / 60000) * 60000;
    const notional = price * quantity;
    const direction = trade.m ? -1 : 1; // market buy -> m false

    if (this.currentMinute === null) {
      this.currentMinute = minute;
    }

    if (minute > this.currentMinute) {
      this.flushPending();

      while (minute - this.currentMinute > 60000) {
        this.currentMinute += 60000;
        this.pending = this.createZeroBuckets();
        this.pendingTotal = 0;
        this.flushPending();
      }

      this.currentMinute = minute;
      this.pending = this.createZeroBuckets();
      this.pendingTotal = 0;
    }

    const bucketIndex = this.getBucketIndex(notional);
    if (bucketIndex === -1) {
      return;
    }

    this.pending[bucketIndex] += direction * notional;
    this.pendingTotal += direction * notional;
    this.lastPrice = price;
    this.lastTimestamp = tradeTime;
  }

  getBucketIndex(notional) {
    for (let i = 0; i < BUCKETS.length; i += 1) {
      const bucket = BUCKETS[i];
      if (notional >= bucket.min && notional < bucket.max) {
        return i;
      }
    }
    return BUCKETS.length - 1;
  }

  flushPending() {
    if (this.currentMinute === null) {
      return;
    }

    const nextCumulative = this.cumulative.map((value, idx) => value + this.pending[idx]);
    const nextTotal = this.cumulativeTotal + this.pendingTotal;

    const row = {
      symbol: this.symbol,
      minute: this.currentMinute,
      total: nextTotal,
      buckets: nextCumulative,
      price: this.lastPrice,
    };

    this.cumulative = nextCumulative;
    this.cumulativeTotal = nextTotal;
    this.pending = this.createZeroBuckets();
    this.pendingTotal = 0;

    this.persistRow(row);
    this.emit('minute', row);
  }

  flushIfStale() {
    if (this.currentMinute === null) {
      return;
    }

    const currentMinute = Math.floor(Date.now() / 60000) * 60000;
    if (currentMinute > this.currentMinute) {
      this.flushPending();

      while (currentMinute - this.currentMinute > 60000) {
        this.currentMinute += 60000;
        this.pending = this.createZeroBuckets();
        this.pendingTotal = 0;
        this.flushPending();
      }

      this.currentMinute = currentMinute;
      this.pending = this.createZeroBuckets();
      this.pendingTotal = 0;
    }
  }

  persistRow(row) {
    if (!this.cvdModel || !row || !Number.isFinite(row.minute)) {
      return;
    }

    const buckets = Array.isArray(row.buckets) ? row.buckets : this.createZeroBuckets();
    const minuteTimestamp = Number(row.minute);
    const priceValue = Number.isFinite(row.price) ? row.price : null;

    this.cvdModel
      .findOneAndUpdate(
        { symbol: this.symbol, tf: '1m', t: minuteTimestamp },
        {
          $set: {
            symbol: this.symbol,
            tf: '1m',
            t: minuteTimestamp,
            g0: buckets[0] ?? 0,
            g1: buckets[1] ?? 0,
            g2: buckets[2] ?? 0,
            g3: buckets[3] ?? 0,
            g4: buckets[4] ?? 0,
            all: row.total ?? 0,
            price: priceValue,
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      )
      .catch((error) => {
        console.error('[CVD] Failed to store minute snapshot:', error.message);
      });

    this.persistAggregates(row);
  }

  persistAggregates(row) {
    if (!row || !Number.isFinite(row.minute)) {
      return;
    }

    if (!this.cvdModel) {
      return;
    }

    const buckets = Array.isArray(row.buckets) ? row.buckets : this.createZeroBuckets();
    const priceValue = Number.isFinite(row.price) ? row.price : null;
    const operations = [];

    SUPPORTED_TIMEFRAMES.forEach((timeframe) => {
      const bucketMs = timeframeToMs(timeframe);
      if (!bucketMs) return;
      const bucketTimestamp = Math.floor(row.minute / bucketMs) * bucketMs;
      const update = {
        symbol: this.symbol,
        tf: timeframe,
        t: bucketTimestamp,
        g0: buckets[0] ?? 0,
        g1: buckets[1] ?? 0,
        g2: buckets[2] ?? 0,
        g3: buckets[3] ?? 0,
        g4: buckets[4] ?? 0,
        all: row.total ?? 0,
        price: priceValue,
      };

      operations.push(
        this.cvdModel
          .findOneAndUpdate(
            { symbol: this.symbol, tf: timeframe, t: bucketTimestamp },
            { $set: update },
            { upsert: true, setDefaultsOnInsert: true }
          )
          .catch((error) => {
            console.error('[CVD] Failed to store series snapshot:', error.message);
          })
      );

      if (this.priceModel && priceValue != null) {
        operations.push(
          this.priceModel
            .findOneAndUpdate(
              { symbol: this.symbol, tf: timeframe, t: bucketTimestamp },
              {
                $set: {
                  symbol: this.symbol,
                  tf: timeframe,
                  t: bucketTimestamp,
                  close: priceValue,
                },
              },
              { upsert: true, setDefaultsOnInsert: true }
            )
            .catch((error) => {
              console.error('[CVD] Failed to store price snapshot:', error.message);
            })
        );
      }
    });

    if (operations.length) {
      Promise.allSettled(operations);
    }
  }

  async getHistory({ limit = 1440, timeframe = '1m' } = {}) {
    const tf = normalizeTimeframe(timeframe);
    if (!this.cvdModel) {
      return [];
    }

    const docs = await this.cvdModel
      .find({ symbol: this.symbol, tf })
      .sort({ t: -1 })
      .limit(limit)
      .lean();

    return docs
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
        price: doc.price,
      }));
  }

  async getPriceHistory({ limit = 1440, timeframe = '1m' } = {}) {
    const tf = normalizeTimeframe(timeframe);
    if (!this.priceModel && !this.cvdModel) {
      return [];
    }

    let docs;
    if (this.priceModel) {
      docs = await this.priceModel
        .find({ symbol: this.symbol, tf, close: { $ne: null } })
        .sort({ t: -1 })
        .limit(limit)
        .lean();
    } else {
      docs = await this.cvdModel
        .find({ symbol: this.symbol, tf, price: { $ne: null } })
        .sort({ t: -1 })
        .limit(limit)
        .lean();
    }

    if (!docs || !docs.length) {
      return [];
    }

    return docs
      .slice()
      .reverse()
      .map((doc) => ({
        timestamp: doc.t,
        price: doc.close ?? doc.price ?? null,
      }));
  }
}

module.exports = {
  CVDEngine,
  BUCKETS,
  SUPPORTED_TIMEFRAMES,
};
