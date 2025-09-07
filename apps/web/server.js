// apps/web/server.js  (ESM)
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);         // -> apps/web

const app  = express();
// 로컬 기본 3000, Railway/Render 등은 PORT로 들어옴
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

// ------------------------------------------------------------------
// Static
// ------------------------------------------------------------------
app.use(express.static(__dirname));
app.use('/media', express.static(path.join(__dirname, '..', 'media')));
app.use(express.json({ limit: '2mb' }));

// ------------------------------------------------------------------
// Small utils
// ------------------------------------------------------------------
function setCorsAndCache(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
}
const mask = (s) => (s ? `${s.slice(0,6)}...${s.slice(-4)}` : 'MISSING');

console.log('[ENV] OPENROUTER_API_KEY =', mask(process.env.OPENROUTER_API_KEY));
console.log('[ENV] ADMIN_TOKEN        =', mask(process.env.ADMIN_TOKEN));

function assertAuth(req, res) {
  // 개발 단계: ADMIN_TOKEN이 비어있으면 프리패스, 있으면 검증
  if (!process.env.ADMIN_TOKEN) return true;
  const ok = req.headers['x-admin-token'] === process.env.ADMIN_TOKEN;
  if (!ok) res.status(401).json({ error:'unauthorized' });
  return ok;
}

// apps/web 아래만 허용 (경로 이탈 방지)
const ROOT = __dirname;
function safePath(relPath) {
  if (!relPath) throw new Error('path required');
  let p = String(relPath).replace(/^[/\\]+/, '');
  // 사용자가 실수로 apps/web/ 접두어를 넣어도 정상화
  if (p.startsWith('apps/web/')) p = p.slice('apps/web/'.length);
  const abs = path.join(ROOT, p);
  if (!abs.startsWith(ROOT)) throw new Error('path out of bounds');
  return abs;
}

// ------------------------------------------------------------------
// Health
// ------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok:true, app:'two4-cosmos', at: Date.now() });
});

// ------------------------------------------------------------------
// CoinGecko proxy (데모/PRO 키 모두 지원)
// ------------------------------------------------------------------
const CG_PRO  = process.env.X_CG_PRO_API_KEY || '';
const CG_DEMO = process.env.COINGECKO_API_KEY
             || process.env.CG_API_KEY
             || process.env.X_CG_DEMO_API_KEY
             || '';

const cgHeaders = { 'User-Agent': 'two4-cosmos/1.0' };
if (CG_PRO)         cgHeaders['x-cg-pro-api-key']   = CG_PRO;
else if (CG_DEMO)   cgHeaders['x-cg-demo-api-key']  = CG_DEMO;

async function proxyFetch(url, headers = {}){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try{
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok:r.ok, status:r.status, body, ct:r.headers.get('content-type') || 'application/json; charset=utf-8' };
  }catch(e){
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:'proxy failed', detail:String(e) }), ct:'application/json; charset=utf-8' };
  }
}

// /api/coins/markets
app.get('/api/coins/markets', async (req, res) => {
  const u = new URL('https://api.coingecko.com/api/v3/coins/markets');
  for (const [k,v] of Object.entries(req.query)) u.searchParams.set(k, v);
  if (!u.searchParams.get('vs_currency')) u.searchParams.set('vs_currency', 'usd');
  if (!u.searchParams.get('order'))       u.searchParams.set('order','market_cap_desc');
  u.searchParams.set('per_page', String(Math.min(Number(req.query.per_page)||100, 250)));
  if (!u.searchParams.get('page'))        u.searchParams.set('page','1');
  if (!u.searchParams.get('sparkline'))   u.searchParams.set('sparkline','true');
  if (!u.searchParams.get('price_change_percentage')) u.searchParams.set('price_change_percentage', '1h,24h,7d');

  const p = await proxyFetch(u, cgHeaders);
  setCorsAndCache(res);
  res.type(p.ct).status(p.status).send(p.body);
});

// /api/global
app.get('/api/global', async (_req, res) => {
  const p = await proxyFetch('https://api.coingecko.com/api/v3/global', cgHeaders);
  setCorsAndCache(res);
  res.type(p.ct).status(p.status).send(p.body);
});

// /api/fng
app.get('/api/fng', async (req, res) => {
  const u = new URL('https://api.alternative.me/fng/');
  u.searchParams.set('limit',  req.query.limit  || '1');
  u.searchParams.set('format', req.query.format || 'json');
  const p = await proxyFetch(u, { 'User-Agent': 'two4-cosmos/1.0' });
  setCorsAndCache(res);
  res.type(p.ct).status(p.status).send(p.body);
});

// ------------------------------------------------------------------
// FS: open/save
// ------------------------------------------------------------------
app.get('/fs/read', async (req, res) => {
  try{
    const abs = safePath(req.query.path);
    const data = await fs.readFile(abs, 'utf8');
    res.json({ ok:true, path:req.query.path, data });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

app.post('/fs/save', async (req, res) => {
  try{
    if (!assertAuth(req, res)) return;
    const { path: p, content = '' } = req.body || {};
    const abs = safePath(p);
    await fs.writeFile(abs, content, 'utf8');
    res.json({ ok:true, path:p, bytes: Buffer.byteLength(content,'utf8') });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// ------------------------------------------------------------------
// AI via OpenRouter (다양한 모델 선택)
// ------------------------------------------------------------------
async function callOpenRouter({ model, prompt, system='You are a helpful coding assistant.' }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      // 정책상 권장 헤더
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'two4-studio'
    },
    body: JSON.stringify({
      model: model || 'anthropic/claude-3.5-sonnet',
      max_tokens: 1024,
      messages: [
        { role:'system', content: system },
        { role:'user',   content: prompt }
      ]
    })
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const c = j.choices?.[0]?.message?.content;
  return (typeof c === 'string') ? c : Array.isArray(c) ? c.map(p=>p.text||'').join('') : String(c ?? '');
}

app.post('/ai/claude', async (req, res) => {
  try{
    if (!assertAuth(req, res)) return;
    const { prompt = '', system = '', model = '' } = req.body || {};
    const text = await callOpenRouter({ model, prompt, system });
    res.json({ ok:true, text });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

// 스튜디오 진입: /tidewave → apps/web/menu/tidewave/index.html
app.get('/tidewave', (_req, res) => {
  res.sendFile(path.join(__dirname, 'menu', 'tidewave', 'index.html'));
});

// 존재하지 않는 정적/비HTML 요청 404
app.use((req, res, next) => {
  if (req.accepts('html')) return next();
  res.status(404).end();
});

// SPA fallback (apps/web/index.html)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Web server listening on ${PORT}`);
});