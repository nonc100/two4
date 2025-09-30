const EventEmitter = require('events');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const { SUPPORTED_TIMEFRAMES, timeframeToMs, normalizeTimeframe } = require('../utils/timeframes');

class HeatmapEngine extends EventEmitter {
  constructor({ db, symbol }) {
    super();
    this.db = db;
    this.symbol = symbol.toUpperCase();
    this.symbolLower = this.symbol.toLowerCase();

    this.ws = null;
    this.connected = false;

    this.bids = new Map();
    this.asks = new Map();
    this.lastUpdateId = null;
    this.snapshotReady = false;
    this.snapshotTimer = null;
    this.lastPrice = null;
    this.retryAttempt = 0;
    this.snapshotIntervalMs = 30_000;

    this.initTable();
    this.backfillSnapshots();
  }

  initTable() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS orderbook_snapshots (
          symbol TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          bids TEXT NOT NULL,
          asks TEXT NOT NULL,
          last_price REAL,
          PRIMARY KEY (symbol, timestamp)
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_time ON orderbook_snapshots(symbol, timestamp DESC)');
      this.db.run(`
        CREATE TABLE IF NOT EXISTS orderbook_snapshots_tf (
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          bids TEXT NOT NULL,
          asks TEXT NOT NULL,
          last_price REAL,
          PRIMARY KEY (symbol, timeframe, timestamp)
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_snapshots_tf_symbol_time ON orderbook_snapshots_tf(symbol, timeframe, timestamp DESC)');
    });
  }

  backfillSnapshots(limit = 2000) {
    this.db.all(
      `SELECT timestamp, bids, asks, last_price
         FROM orderbook_snapshots
         WHERE symbol = ?
         ORDER BY timestamp ASC
         LIMIT ?`,
      [this.symbol, limit],
      (err, rows) => {
        if (err) {
          console.error('[HEATMAP] Failed to backfill snapshots:', err.message);
          return;
        }
        if (!Array.isArray(rows) || !rows.length) {
          return;
        }
        rows.forEach((row) => {
          this.persistSnapshotVariants({
            timestamp: row.timestamp,
            bidsJson: row.bids,
            asksJson: row.asks,
            lastPrice: row.last_price,
          });
        });
      }
    );
  }

  start() {
    this.fetchInitialSnapshot()
      .then(() => {
        this.openSocket();
        this.startSnapshotTimer();
      })
      .catch((error) => {
        console.error('[HEATMAP] Failed to load initial snapshot:', error.message);
        setTimeout(() => this.start(), 5000);
      });
  }

  stop() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
  }

  async fetchInitialSnapshot() {
    const url = `https://api.binance.com/api/v3/depth?symbol=${this.symbol}&limit=1000`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Snapshot request failed: ${response.status}`);
    }
    const payload = await response.json();
    this.lastUpdateId = payload.lastUpdateId;
    this.bids = new Map(payload.bids.map(([price, qty]) => [Number(price), Number(qty)]));
    this.asks = new Map(payload.asks.map(([price, qty]) => [Number(price), Number(qty)]));
    this.snapshotReady = true;
  }

  openSocket() {
    const endpoint = `wss://stream.binance.com:9443/ws/${this.symbolLower}@depth@100ms`;
    this.ws = new WebSocket(endpoint);

    this.ws.on('open', () => {
      this.connected = true;
      this.retryAttempt = 0;
      console.log(`[HEATMAP] Connected depth stream for ${this.symbol}`);
    });

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handleDepth(payload);
      } catch (error) {
        console.error('[HEATMAP] Failed to parse depth update:', error.message);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(this.retryAttempt, 5));
      this.retryAttempt += 1;
      console.warn(`[HEATMAP] Depth stream closed for ${this.symbol}, retrying in ${Math.round(delay / 1000)}s`);
      const timer = setTimeout(() => this.openSocket(), delay);
      timer.unref?.();
    });

    this.ws.on('error', (error) => {
      console.error('[HEATMAP] Depth stream error:', error.message);
      this.ws?.close();
    });
  }

  handleDepth(update) {
    if (!this.snapshotReady) {
      return;
    }
    if (typeof update.u !== 'number' || typeof update.U !== 'number') {
      return;
    }

    if (this.lastUpdateId && update.u <= this.lastUpdateId) {
      return;
    }

    if (update.U > this.lastUpdateId + 1) {
      // Missed updates; reset
      console.warn('[HEATMAP] Missed depth updates, reloading snapshot');
      this.snapshotReady = false;
      this.stop();
      this.start();
      return;
    }

    this.lastUpdateId = update.u;

    if (Array.isArray(update.b)) {
      update.b.forEach(([price, qty]) => {
        this.applyLevel(this.bids, price, qty, true);
      });
    }
    if (Array.isArray(update.a)) {
      update.a.forEach(([price, qty]) => {
        this.applyLevel(this.asks, price, qty, false);
      });
    }

    const bestBid = this.bids.size ? Math.max(...this.bids.keys()) : null;
    const bestAsk = this.asks.size ? Math.min(...this.asks.keys()) : null;
    if (bestBid && bestAsk) {
      this.lastPrice = (bestBid + bestAsk) / 2;
    }
  }

  applyLevel(book, priceStr, qtyStr, isBid) {
    const price = Number(priceStr);
    const qty = Number(qtyStr);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) {
      return;
    }
    if (qty <= 0) {
      book.delete(price);
    } else {
      book.set(price, qty);
    }

    // Prune to keep maps manageable
    const MAX_LEVELS = 500;
    if (book.size > MAX_LEVELS) {
      const sorted = Array.from(book.keys()).sort((a, b) => (isBid ? b - a : a - b));
      const slice = sorted.slice(0, MAX_LEVELS);
      const trimmed = new Map();
      slice.forEach((key) => {
        trimmed.set(key, book.get(key) || 0);
      });
      book.clear();
      trimmed.forEach((value, key) => {
        book.set(key, value);
      });
    }
  }

  startSnapshotTimer() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }
    this.captureSnapshot();
    this.snapshotTimer = setInterval(() => {
      this.captureSnapshot();
    }, this.snapshotIntervalMs);
    this.snapshotTimer.unref?.();
  }

  captureSnapshot() {
    if (!this.snapshotReady) {
      return;
    }
    const timestamp = Date.now();
    const bids = this.serializeBook(this.bids, true);
    const asks = this.serializeBook(this.asks, false);
    const bidsJson = JSON.stringify(bids);
    const asksJson = JSON.stringify(asks);

    this.db.run(
      `INSERT OR REPLACE INTO orderbook_snapshots (symbol, timestamp, bids, asks, last_price)
       VALUES (?, ?, ?, ?, ?)` ,
      [this.symbol, timestamp, bidsJson, asksJson, this.lastPrice],
      (err) => {
        if (err) {
          console.error('[HEATMAP] Failed to store snapshot:', err.message);
        }
      }
    );

    this.persistSnapshotVariants({
      timestamp,
      bidsJson,
      asksJson,
      lastPrice: this.lastPrice,
    });

    const retentionCutoff = timestamp - 48 * 60 * 60 * 1000;
    this.db.run(
      'DELETE FROM orderbook_snapshots WHERE symbol = ? AND timestamp < ?',
      [this.symbol, retentionCutoff],
      (err) => {
        if (err) {
          console.error('[HEATMAP] Failed to prune snapshots:', err.message);
        }
      }
    );

    SUPPORTED_TIMEFRAMES.forEach((timeframe) => {
      const bucketMs = timeframeToMs(timeframe);
      if (!bucketMs) return;
      const cutoff = Math.floor(retentionCutoff / bucketMs) * bucketMs;
      this.db.run(
        'DELETE FROM orderbook_snapshots_tf WHERE symbol = ? AND timeframe = ? AND timestamp < ?',
        [this.symbol, timeframe, cutoff],
        (err) => {
          if (err) {
            console.error('[HEATMAP] Failed to prune timeframe snapshots:', err.message);
          }
        }
      );
    });

    this.emit('snapshot', { symbol: this.symbol, timestamp, bids, asks, lastPrice: this.lastPrice });
  }

  persistSnapshotVariants({ timestamp, bidsJson, asksJson, lastPrice }) {
    if (!Number.isFinite(timestamp)) {
      return;
    }

    const priceValue = Number.isFinite(lastPrice) ? lastPrice : null;
    SUPPORTED_TIMEFRAMES.forEach((timeframe) => {
      const bucketMs = timeframeToMs(timeframe);
      if (!bucketMs) return;
      const bucketTimestamp = Math.floor(timestamp / bucketMs) * bucketMs;
      this.db.run(
        `INSERT OR REPLACE INTO orderbook_snapshots_tf
           (symbol, timeframe, timestamp, bids, asks, last_price)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [this.symbol, timeframe, bucketTimestamp, bidsJson, asksJson, priceValue],
        (err) => {
          if (err) {
            console.error('[HEATMAP] Failed to store timeframe snapshot:', err.message);
          }
        }
      );
    });
  }

  serializeBook(book, isBid) {
    const sorted = Array.from(book.entries()).sort((a, b) => (isBid ? b[0] - a[0] : a[0] - b[0]));
    return sorted.slice(0, 400);
  }

  getSnapshots({ limit = 720, timeframe = '1m' } = {}) {
    const tf = normalizeTimeframe(timeframe);
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT timestamp, bids, asks, last_price
         FROM orderbook_snapshots_tf
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
}

module.exports = {
  HeatmapEngine,
};
