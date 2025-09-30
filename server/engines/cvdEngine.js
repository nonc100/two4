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
  constructor({ db, symbol }) {
    super();
    this.db = db;
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
    this.backfillTimer = null;

    this.initTables();
    this.loadState();
    this.backfillSeries();
    this.scheduleBackfill();
  }

  initTables() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS cvd_points (
          symbol TEXT NOT NULL,
          minute INTEGER NOT NULL,
          total REAL NOT NULL,
          bucket0 REAL NOT NULL,
          bucket1 REAL NOT NULL,
          bucket2 REAL NOT NULL,
          bucket3 REAL NOT NULL,
          bucket4 REAL NOT NULL,
          price REAL,
          created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
          PRIMARY KEY (symbol, minute)
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cvd_symbol_minute ON cvd_points(symbol, minute DESC)');
      this.db.run(`
        CREATE TABLE IF NOT EXISTS cvd_series (
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          total REAL NOT NULL,
          bucket0 REAL NOT NULL,
          bucket1 REAL NOT NULL,
          bucket2 REAL NOT NULL,
          bucket3 REAL NOT NULL,
          bucket4 REAL NOT NULL,
          price REAL,
          PRIMARY KEY (symbol, timeframe, timestamp)
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cvd_series_symbol_tf_time ON cvd_series(symbol, timeframe, timestamp DESC)');
    });
  }

  backfillSeries(limit = 5000) {
    this.db.all(
      `SELECT minute, total, bucket0, bucket1, bucket2, bucket3, bucket4, price
         FROM cvd_points
         WHERE symbol = ?
         ORDER BY minute ASC
         LIMIT ?`,
      [this.symbol, limit],
      (err, rows) => {
        if (err) {
          console.error('[CVD] Failed to backfill series:', err.message);
          return;
        }
        if (!Array.isArray(rows) || !rows.length) {
          return;
        }
        rows.forEach((row) => {
          const payload = {
            minute: row.minute,
            total: row.total,
            buckets: [row.bucket0, row.bucket1, row.bucket2, row.bucket3, row.bucket4],
            price: row.price,
          };
          this.persistAggregates(payload);
        });
      }
    );
  }

  loadState() {
    this.db.get(
      'SELECT * FROM cvd_points WHERE symbol = ? ORDER BY minute DESC LIMIT 1',
      [this.symbol],
      (err, row) => {
        if (err) {
          console.error('[CVD] Failed to load state:', err.message);
          return;
        }
        if (row) {
          this.cumulative = [row.bucket0, row.bucket1, row.bucket2, row.bucket3, row.bucket4];
          this.cumulativeTotal = row.total;
          this.currentMinute = row.minute;
          this.lastPrice = row.price;
        }
      }
    );
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
    if (this.backfillTimer) {
      clearInterval(this.backfillTimer);
      this.backfillTimer = null;
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
    this.db.run(
      `INSERT OR REPLACE INTO cvd_points
        (symbol, minute, total, bucket0, bucket1, bucket2, bucket3, bucket4, price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
      [
        row.symbol,
        row.minute,
        row.total,
        row.buckets[0],
        row.buckets[1],
        row.buckets[2],
        row.buckets[3],
        row.buckets[4],
        row.price,
      ],
      (err) => {
        if (err) {
          console.error('[CVD] Failed to store minute snapshot:', err.message);
        }
      }
    );
    this.persistAggregates(row);
  }

  persistAggregates(row) {
    if (!row || !Number.isFinite(row.minute)) {
      return;
    }

    const buckets = Array.isArray(row.buckets) ? row.buckets : this.createZeroBuckets();
    SUPPORTED_TIMEFRAMES.forEach((timeframe) => {
      const bucketMs = timeframeToMs(timeframe);
      if (!bucketMs) return;
      const bucketTimestamp = Math.floor(row.minute / bucketMs) * bucketMs;
      this.db.run(
        `INSERT OR REPLACE INTO cvd_series
           (symbol, timeframe, timestamp, total, bucket0, bucket1, bucket2, bucket3, bucket4, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ,
        [
          this.symbol,
          timeframe,
          bucketTimestamp,
          row.total,
          buckets[0],
          buckets[1],
          buckets[2],
          buckets[3],
          buckets[4],
          Number.isFinite(row.price) ? row.price : null,
        ],
        (err) => {
          if (err) {
            console.error('[CVD] Failed to store series snapshot:', err.message);
          }
        }
      );
    });
  }

  scheduleBackfill() {
    const run = () => {
      const cutoff = Date.now() - 72 * 60 * 60 * 1000;
      this.db.all(
        `SELECT minute, total, bucket0, bucket1, bucket2, bucket3, bucket4, price
         FROM cvd_points
         WHERE symbol = ? AND minute >= ?
         ORDER BY minute ASC`,
        [this.symbol, cutoff],
        (err, rows) => {
          if (err) {
            console.error('[CVD] Backfill window failed:', err.message);
            return;
          }
          rows.forEach((row) => {
            this.persistAggregates({
              minute: row.minute,
              total: row.total,
              buckets: [row.bucket0, row.bucket1, row.bucket2, row.bucket3, row.bucket4],
              price: row.price,
            });
          });
        }
      );
    };

    run();
    this.backfillTimer = setInterval(run, 30 * 60 * 1000);
    this.backfillTimer.unref?.();
  }

  getHistory({ limit = 1440, timeframe = '1m' } = {}) {
    const tf = normalizeTimeframe(timeframe);
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT timestamp, total, bucket0, bucket1, bucket2, bucket3, bucket4, price
         FROM cvd_series
         WHERE symbol = ? AND timeframe = ?
         ORDER BY timestamp DESC
         LIMIT ?`,
        [this.symbol, tf, limit],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.reverse());
        }
      );
    });
  }

  getPriceHistory({ limit = 1440, timeframe = '1m' } = {}) {
    const tf = normalizeTimeframe(timeframe);
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT timestamp, price
         FROM cvd_series
         WHERE symbol = ? AND timeframe = ? AND price IS NOT NULL
         ORDER BY timestamp DESC
         LIMIT ?`,
        [this.symbol, tf, limit],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.reverse());
        }
      );
    });
  }
}

module.exports = {
  CVDEngine,
  BUCKETS,
  SUPPORTED_TIMEFRAMES,
};
