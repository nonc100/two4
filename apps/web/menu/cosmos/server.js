// apps/web/menu/cosmos/server.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// 정적 파일 제공
app.use(express.static("."));

// 범용 CoinGecko 프록시: /api/** -> https://api.coingecko.com/api/v3/**
app.use("/api", async (req, res) => {
  const target = "https://api.coingecko.com/api/v3" + req.url;
  try {
    const r = await fetch(target, { headers: { "User-Agent": "two4-cosmos/1.0" } });
    res.status(r.status);
    res.setHeader("access-control-allow-origin", "*");
    r.headers.forEach((v, k) => res.setHeader(k, v));
    const body = await r.text();
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: "proxy failed", detail: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("cosmos proxy listening on", port));
