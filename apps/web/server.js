// ESM 서버 (Node18+)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// 정적 파일 (menu 폴더 + /media)
app.use(express.static(__dirname));
app.use("/media", express.static(path.join(__dirname, "..", "media")));

// 루트 → cosmos.html
app.get("/", (_req, res) => res.redirect(302, "/cosmos.html"));

function setCorsAndCache(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
}

// CoinGecko 키
const CG_PRO  = process.env.X_CG_PRO_API_KEY || "";
const CG_DEMO = process.env.COINGECKO_API_KEY || process.env.X_CG_DEMO_API_KEY || "";
const cgHeaders = { "User-Agent": "two4-cosmos/1.0" };
if (CG_PRO)   cgHeaders["x-cg-pro-api-key"]   = CG_PRO;
else if (CG_DEMO) cgHeaders["x-cg-demo-api-key"] = CG_DEMO;

// 캐시/공통 fetch
const cache = new Map();
const TTL_MS = 60_000;
const hit = k => { const v=cache.get(k); return v && Date.now()-v.t<TTL_MS ? v : null; };
const keep=(k,p)=>{ if(p.ok) cache.set(k,{...p,t:Date.now()}); };
async function proxyFetch(url, headers={}){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),8000);
  try{
    const r=await fetch(url,{headers,signal:ac.signal});
    const body=await r.text(); clearTimeout(t);
    return { ok:r.ok, status:r.status, body, ct:r.headers.get("content-type")||"application/json; charset=utf-8" };
  }catch(e){
    clearTimeout(t);
    return { ok:false, status:502, body:JSON.stringify({error:"proxy failed", detail:String(e)}), ct:"application/json; charset=utf-8" };
  }
}

// /api/coins/markets
app.get("/api/coins/markets", async (req,res)=>{
  const u = new URL("https://api.coingecko.com/api/v3/coins/markets");
  for(const [k,v] of Object.entries(req.query)) u.searchParams.set(k,v);
  if(!u.searchParams.get("vs_currency")) u.searchParams.set("vs_currency","usd");
  if(!u.searchParams.get("order"))      u.searchParams.set("order","market_cap_desc");
  if(!u.searchParams.get("per_page"))   u.searchParams.set("per_page","200");
  if(!u.searchParams.get("page"))       u.searchParams.set("page","1");
  if(!u.searchParams.get("sparkline"))  u.searchParams.set("sparkline","true");
  if(!u.searchParams.get("price_change_percentage")) u.searchParams.set("price_change_percentage","1h,24h,7d");

  const key=`CG:${u}`;
  const c=hit(key); if(c){ setCorsAndCache(res); return res.type(c.ct).status(c.status).send(c.body); }
  const p=await proxyFetch(u,cgHeaders);
  setCorsAndCache(res); res.type(p.ct).status(p.status).send(p.body); keep(key,p);
});

// /api/global
app.get("/api/global", async (_req,res)=>{
  const u="https://api.coingecko.com/api/v3/global";
  const key=`CG:${u}`;
  const c=hit(key); if(c){ setCorsAndCache(res); return res.type(c.ct).status(c.status).send(c.body); }
  const p=await proxyFetch(u,cgHeaders);
  setCorsAndCache(res); res.type(p.ct).status(p.status).send(p.body); keep(key,p);
});

// /api/fng
app.get("/api/fng", async (req,res)=>{
  const u=new URL("https://api.alternative.me/fng/");
  u.searchParams.set("limit", req.query.limit||"1");
  u.searchParams.set("format",req.query.format||"json");
  const key=`FNG:${u}`;
  const c=hit(key); if(c){ setCorsAndCache(res); return res.type(c.ct).status(c.status).send(c.body); }
  const p=await proxyFetch(u,{ "User-Agent":"two4-cosmos/1.0" });
  setCorsAndCache(res); res.type(p.ct).status(p.status).send(p.body); keep(key,p);
});

// SPA fallback
app.get("*", (_req,res)=>res.sendFile(path.join(__dirname,"cosmos.html")));

app.listen(PORT, ()=>console.log(`🚀 Cosmos server on ${PORT}`));
