const EventEmitter = require('events');
const WebSocket = require('ws');
const fetch = require('node-fetch');

const { timeframeToMs, normalizeTimeframe } = require('../utils/timeframes');

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/ws';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class LiquidationHeatmapEngine extends EventEmitter {
  constructor({ db, topSymbols = 30, retentionDays = 14 } = {}) {
    super();
    this.db = db;
    this.topSymbols = topSymbols;
    this.retentionDays = retentionDays;

    this.symbols = [];
    this.symbolMeta = new Map(); // symbol -> { lastPrice, quoteVolume }
    this.streams = new Map(); // symbol -> { ws, retry }
    this.lastPrices = new Map();

    this.refreshTimer = null;
    this.pruneTimer = null;

    this.initTable();
  }

  initTable() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS liquidation_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          event_time INTEGER NOT NULL,
          side TEXT NOT NULL,
          price REAL NOT NULL,
          quantity REAL NOT NULL,
          notional REAL NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
          UNIQUE(symbol, event_time, side, price, quantity)
        )
      `);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_liq_symbol_time ON liquidation_events(symbol, event_time DESC)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_liq_time ON liquidation_events(event_time DESC)');
    });
  }

  start() {
    this.refreshSymbols();
    this.refreshTimer = setInterval(() => this.refreshSymbols(), 30 * 60 * 1000);
    this.refreshTimer.unref?.();
    this.pruneTimer = setInterval(() => this.pruneOldEvents(), 60 * 60 * 1000);
    this.pruneTimer.unref?.();
  }

  stop() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.streams.forEach((stream) => {
      if (stream.ws) {
        try {
          stream.ws.removeAllListeners();
          stream.ws.close();
        } catch (_) {
          // ignore
        }
      }
    });
    this.streams.clear();
  }

  async refreshSymbols() {
    try {
      const top = await this.fetchTopSymbols();
      const symbols = top.map((item) => item.symbol.toUpperCase());
      this.symbols = symbols;
      const currentSet = new Set(symbols);

      // close removed streams
      this.streams.forEach((_value, symbol) => {
        if (!currentSet.has(symbol)) {
          this.teardownStream(symbol);
        }
      });

      // start new streams
      symbols.forEach((symbol, idx) => {
        const meta = top[idx];
        if (meta) {
          const lastPrice = Number(meta.lastPrice);
          const quoteVolume = Number(meta.quoteVolume);
          this.symbolMeta.set(symbol, {
            lastPrice: Number.isFinite(lastPrice) ? lastPrice : null,
            quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : null,
            fetchedAt: Date.now(),
            rank: idx + 1,
          });
        }
        if (!this.streams.has(symbol)) {
          this.startStream(symbol);
        }
      });

      this.emit('symbols', this.getSymbols());
    } catch (error) {
      console.error('[LIQ] Failed to refresh symbols:', error.message);
    }
  }

  async fetchTopSymbols() {
    const response = await fetch(`${BINANCE_FUTURES_API}/fapi/v1/ticker/24hr`);
    if (!response.ok) {
      throw new Error(`Ticker request failed: ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }
    const filtered = payload
      .filter((item) => typeof item?.symbol === 'string' && item.symbol.endsWith('USDT'))
      .map((item) => ({
        symbol: item.symbol.toUpperCase(),
        lastPrice: item.lastPrice,
        priceChangePercent: item.priceChangePercent,
        quoteVolume: item.quoteVolume,
      }));
    filtered.sort((a, b) => {
      const av = Number(a.quoteVolume) || 0;
      const bv = Number(b.quoteVolume) || 0;
      return bv - av;
    });
    return filtered.slice(0, this.topSymbols);
  }

  startStream(symbol) {
    const lower = symbol.toLowerCase();
    const url = `${BINANCE_FUTURES_WS}/${lower}@forceOrder`;
    const stream = {
      ws: null,
      retry: 0,
    };
    const connect = () => {
      const ws = new WebSocket(url);
      stream.ws = ws;

      ws.on('open', () => {
        stream.retry = 0;
      });

      ws.on('message', (raw) => {
        this.handleMessage(symbol, raw);
      });

      ws.on('error', (err) => {
        console.error(`[LIQ:${symbol}] WS error:`, err.message);
      });

      ws.on('close', async () => {
        const delay = Math.min(60_000, 1000 * 2 ** Math.min(stream.retry, 5));
        stream.retry += 1;
        await sleep(delay);
        if (this.symbols.includes(symbol)) {
          connect();
        }
      });
    };

    connect();
    this.streams.set(symbol, stream);
  }

  teardownStream(symbol) {
    const stream = this.streams.get(symbol);
    if (stream && stream.ws) {
      try {
        stream.ws.removeAllListeners();
        stream.ws.close();
      } catch (_) {
        // ignore
      }
    }
    this.streams.delete(symbol);
  }

  handleMessage(symbol, raw) {
    try {
      const payload = JSON.parse(raw);
      const order = payload?.o;
      if (!order) {
        return;
      }
      const eventTime = Number(order.T || payload.E);
      const price = Number(order.ap || order.p);
      const quantity = Number(order.q || order.l || order.z);
      const side = String(order.S || '');
      if (!Number.isFinite(eventTime) || !Number.isFinite(price) || !Number.isFinite(quantity) || !side) {
        return;
      }
      const notional = Math.abs(price * quantity);
      if (!Number.isFinite(notional) || notional <= 0) {
        return;
      }

      this.lastPrices.set(symbol, price);
      const meta = this.symbolMeta.get(symbol) || {};
      this.symbolMeta.set(symbol, { ...meta, lastPrice: price, updatedAt: Date.now() });

      this.db.run(
        `INSERT OR IGNORE INTO liquidation_events (symbol, event_time, side, price, quantity, notional)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [symbol, eventTime, side, price, quantity, notional],
        (err) => {
          if (err) {
            console.error(`[LIQ:${symbol}] Failed to store liquidation event:`, err.message);
          } else {
            this.emit('event', { symbol, eventTime, side, price, quantity, notional });
          }
        }
      );
    } catch (error) {
      console.error(`[LIQ:${symbol}] Failed to parse message:`, error.message);
    }
  }

  pruneOldEvents() {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    this.db.run(
      'DELETE FROM liquidation_events WHERE event_time < ?',
      [cutoff],
      (err) => {
        if (err) {
          console.error('[LIQ] Failed to prune liquidation events:', err.message);
        }
      }
    );
  }

  getSymbols() {
    return this.symbols.map((symbol) => {
      const meta = this.symbolMeta.get(symbol) || {};
      return {
        symbol,
        rank: meta.rank || null,
        lastPrice: meta.lastPrice ?? null,
        quoteVolume: meta.quoteVolume ?? null,
        updatedAt: meta.updatedAt ?? meta.fetchedAt ?? null,
      };
    });
  }

  getLastPrice(symbol) {
    const meta = this.symbolMeta.get(symbol);
    if (meta && Number.isFinite(meta.lastPrice)) {
      return meta.lastPrice;
    }
    const last = this.lastPrices.get(symbol);
    return Number.isFinite(last) ? last : null;
  }

  getEvents({ symbol, timeframe = '1m', limit = 720 }) {
    return new Promise((resolve, reject) => {
      const tf = normalizeTimeframe(timeframe, '1m');
      const bucketMs = timeframeToMs(tf);
      if (!bucketMs) {
        resolve([]);
        return;
      }
      const rangeMs = bucketMs * Math.max(10, limit);
      const cutoff = Date.now() - rangeMs;
      this.db.all(
        `SELECT event_time, side, price, quantity, notional
         FROM liquidation_events
         WHERE symbol = ? AND event_time >= ?
         ORDER BY event_time ASC`,
        [symbol, cutoff],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }
}

module.exports = {
  LiquidationHeatmapEngine,
};
