// apps/web/menu/server.js
// ===== Two.4 Menu Server (Railway) =====

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

// ----- ESM __dirname -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Paths (monorepo)
const MENU_DIR = __dirname;                       // apps/web/menu
const WEB_DIR  = path.join(__dirname, "..");      // apps/web
const MEDIA_DIR = path.join(WEB_DIR, "media");    // apps/web/media

// ----- App / Port / Key -----
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const CG_KEY = process.env.COINGECKO_API_KEY || "";

console.log("🌌 Two.4 menu server booting…");
console.log("📁 MENU_DIR :", MENU_DIR);
console.log("📁 WEB_DIR  :", WEB_DIR);
console.log("📁 MEDIA_DIR:", MEDIA_DIR);
console.log("🔑 COINGECKO_API_KEY:", CG_KEY ? "set" : "missing");

// ----- CORS / Parsers -----
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

// ----- Ultra-simple in-memory cache (default 30s) -----
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: now, v });
  return v;
}

// ----- Static files -----
// NOTE: root에 mount해서 /, /index.html, /style.css 다 바로 제공
app.use(express.static(MENU_DIR));          // /, /index.html, /style.css …
app.use("/media", express.static(MEDIA_DIR)); // /media/background.mp4 등
// (필요 시 web 루트도 탐색)
app.use(express.static(WEB_DIR));

// ----- Debug / Health -----
app.get("/__debug", (req, res) => {
  let files = [];
  let media = [];
  try {
    files = fs.readdirSync(MENU_DIR);
  } catch (e) {
    files = ["<err> " + e.message];
  }
  try {
    media = fs.readdirSync(MEDIA_DIR);
  } catch (e) {
    media = ["<err> " + e.message];
  }
  res.json({
    dirname: MENU_DIR,
    cwd: process.cwd(),
    files,
    media,
    ts: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    key: !!CG_KEY,
  });
});

// ----- CoinGecko helper -----
async function cg(endpoint, { ttl = 30_000 } = {}) {
  return cached(`cg:${endpoint}`, ttl, async () => {
    const url = `https://api.coingecko.com/api/v3${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const headers = {
      Accept: "application/json",
      "User-Agent": "Two4-Cosmos/1.0",
    };
    // Demo/Pro 키 헤더
    if (CG_KEY) headers["x-cg-demo-api-key"] = CG_KEY;

    const resp = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`CG ${resp.status} ${resp.statusText} :: ${text}`);
    }
    return await resp.json();
  });
}

// ----- API routes -----
// 글로벌(키 필요) – raw/summary 형태
app.get("/api/global", async (req, res) => {
  if (!CG_KEY)
    return res.status(400).json({
      error: "COINGECKO_API_KEY is required for /api/global",
    });
  try {
    const data = await cg("/global", { ttl: 60_000 });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/global/summary", async (req, res) => {
  if (!CG_KEY)
    return res.status(400).json({
      error: "COINGECKO_API_KEY is required for /api/global/summary",
    });
  try {
    const data = await cg("/global", { ttl: 60_000 });
    res.json({
      active_cryptocurrencies: data?.data?.active_cryptocurrencies ?? null,
      markets: data?.data?.markets ?? null,
      market_cap_change_percentage_24h_usd:
        data?.data?.market_cap_change_percentage_24h_usd ?? null,
      updated_at: data?.data?.updated_at ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 트렌딩(키 없이 가능)
app.get("/api/trending", async (req, res) => {
  try {
    const data = await cg("/search/trending", { ttl: 30_000 });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Top gainers (정렬/슬라이스)
app.get("/api/top-gainers", async (req, res) => {
  try {
    const vs = (req.query.vs_currency || "usd").toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);

    const q = new URLSearchParams({
      vs_currency: vs,
      order: "market_cap_desc",
      per_page: "100",
      page: "1",
      price_change_percentage: "24h",
    }).toString();

    const rows = await cg(`/coins/markets?${q}`, { ttl: 30_000 });

    const top = rows
      .filter((r) => typeof r.price_change_percentage_24h === "number")
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      .slice(0, limit)
      .map((r, i) => ({
        vs_currency: vs,
        limit,
        rows: undefined,
        rank: i + 1,
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        price: r.current_price,
        price_change_24h_pct: r.price_change_percentage_24h,
        market_cap: r.market_cap,
      }));

    res.json({ vs_currency: vs, limit, rows: top.length, list: top });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Markets pass-through
app.get("/api/coins/markets", async (req, res) => {
  try {
    const p = new URLSearchParams();
    p.set("vs_currency", (req.query.vs_currency || "usd").toLowerCase());
    p.set("order", req.query.order || "market_cap_desc");
    p.set("per_page", String(Math.min(parseInt(req.query.per_page || "20", 10), 50)));
    p.set("page", String(Math.max(parseInt(req.query.page || "1", 10), 1)));
    if (req.query.sparkline) p.set("sparkline", String(req.query.sparkline));
    if (req.query.price_change_percentage)
      p.set("price_change_percentage", String(req.query.price_change_percentage));
    if (req.query.ids) p.set("ids", String(req.query.ids));

    const data = await cg(`/coins/markets?${p.toString()}`, { ttl: 30_000 });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ----- Fallbacks -----
// 필요한 경우 /menu로 리다이렉트(정적이 root에 걸려있으면 생략 가능)
app.get("/menu", (req, res) => {
  res.sendFile(path.join(MENU_DIR, "index.html"));
});

// ----- Start server -----
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Two.4 menu serving on :${PORT}`);
  console.log(`🔎 Health: /api/health   Debug: /__debug`);
});
