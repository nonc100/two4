const EventEmitter = require('events');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const { SUPPORTED_TIMEFRAMES, timeframeToMs } = require('../utils/timeframes');

class HeatmapEngine extends EventEmitter {
  constructor({ heatmapModel, symbol }) {
    super();
    this.heatmapModel = heatmapModel;
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

    this.restoreLastSnapshot();
  }

  restoreLastSnapshot() {
    if (!this.heatmapModel) {
      return;
    }

    this.heatmapModel
      .findOne({ symbol: this.symbol, tf: '1m', binLow: null })
      .sort({ t: -1 })
      .select({ lastPrice: 1 })
      .lean()
      .then((doc) => {
        if (!doc) {
          return;
        }
        this.lastPrice = doc.lastPrice ?? null;
      })
      .catch((error) => {
        console.error('[HEATMAP] Failed to restore snapshot state:', error.message);
      });
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

    this.persistSnapshotVariants({
      timestamp,
      bids,
      asks,
      lastPrice: this.lastPrice,
    });

    const retentionCutoff = timestamp - 48 * 60 * 60 * 1000;
    this.pruneSnapshots(retentionCutoff);

    this.emit('snapshot', { symbol: this.symbol, timestamp, bids, asks, lastPrice: this.lastPrice });
  }

  persistSnapshotVariants({ timestamp, bids, asks, lastPrice }) {
    if (!Number.isFinite(timestamp) || !this.heatmapModel) {
      return;
    }

    try {
      const priceValue = Number.isFinite(lastPrice) ? lastPrice : null;
      const snapshotBids = Array.isArray(bids) ? bids : [];
      const snapshotAsks = Array.isArray(asks) ? asks : [];
      const { cells, priceMin, priceMax } = this.transformSnapshot(snapshotBids, snapshotAsks);
      const minuteTimestamp = Math.floor(timestamp / 60000) * 60000;

      const operations = [
        {
          deleteMany: {
            filter: { symbol: this.symbol, tf: '1m', t: minuteTimestamp },
          },
        },
      ];

      cells.forEach((cell) => {
        operations.push({
          updateOne: {
            filter: {
              symbol: this.symbol,
              tf: '1m',
              t: minuteTimestamp,
              binLow: cell.binLow,
            },
            update: {
              $set: {
                symbol: this.symbol,
                tf: '1m',
                t: minuteTimestamp,
                binLow: cell.binLow,
                binHigh: cell.binHigh,
                volUSDT: cell.volUSDT,
                lastPrice: priceValue,
                priceMin,
                priceMax,
              },
            },
            upsert: true,
          },
        });
      });

      operations.push({
        updateOne: {
          filter: {
            symbol: this.symbol,
            tf: '1m',
            t: minuteTimestamp,
            binLow: null,
          },
          update: {
            $set: {
              symbol: this.symbol,
              tf: '1m',
              t: minuteTimestamp,
              binLow: null,
              binHigh: null,
              volUSDT: 0,
              lastPrice: priceValue,
              priceMin,
              priceMax,
            },
          },
          upsert: true,
        },
      });

      if (operations.length > 1) {
        this.heatmapModel
          .bulkWrite(operations, { ordered: false })
          .catch((error) => {
            console.error('[HEATMAP] Failed to store heatmap snapshot:', error.message);
          });
      }
    } catch (error) {
      console.error('[HEATMAP] Failed to transform snapshot:', error.message);
    }
  }

  pruneSnapshots(retentionCutoff) {
    if (!this.heatmapModel || !Number.isFinite(retentionCutoff)) {
      return;
    }

    const operations = SUPPORTED_TIMEFRAMES.map((timeframe) => {
      const bucketMs = timeframeToMs(timeframe);
      if (!bucketMs) {
        return null;
      }
      const cutoff = Math.floor(retentionCutoff / bucketMs) * bucketMs;
      return this.heatmapModel
        .deleteMany({ symbol: this.symbol, tf: timeframe, t: { $lt: cutoff } })
        .catch((error) => {
          console.error('[HEATMAP] Failed to prune snapshots:', error.message);
        });
    }).filter(Boolean);

    if (operations.length) {
      Promise.allSettled(operations);
    }
  }

  serializeBook(book, isBid) {
    const sorted = Array.from(book.entries()).sort((a, b) => (isBid ? b[0] - a[0] : a[0] - b[0]));
    return sorted.slice(0, 400);
  }

  transformSnapshot(bids, asks) {
    const cells = [];
    let priceMin = Number.POSITIVE_INFINITY;
    let priceMax = Number.NEGATIVE_INFINITY;

    const addLevel = ([price, qty]) => {
      const priceNum = Number(price);
      const qtyNum = Number(qty);
      if (!Number.isFinite(priceNum) || !Number.isFinite(qtyNum) || qtyNum === 0) {
        return;
      }
      const notional = Math.abs(priceNum * qtyNum);
      if (!Number.isFinite(notional) || notional <= 0) {
        return;
      }

      priceMin = Math.min(priceMin, priceNum);
      priceMax = Math.max(priceMax, priceNum);

      cells.push({
        binLow: priceNum,
        binHigh: priceNum,
        volUSDT: notional,
      });
    };

    bids.forEach(addLevel);
    asks.forEach(addLevel);

    if (!Number.isFinite(priceMin)) {
      priceMin = null;
    }
    if (!Number.isFinite(priceMax)) {
      priceMax = null;
    }

    return { cells, priceMin, priceMax };
  }
}

module.exports = {
  HeatmapEngine,
};
