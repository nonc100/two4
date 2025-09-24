/* =========================
   COSMOS CYBERPUNK CORE
   ========================= */

/* ---- DOM refs ---- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---- Number utils ---- */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fmtMoney=n=>{
  if(n==null||isNaN(n))return"-";
  const a=Math.abs(n);
  if(a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
};
const fmtPrice=n=> n==null||isNaN(n) ? '-' : '$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const fmtPct =n=>{
  if(n==null||isNaN(n)) return '-';
  const s=n>=0?'up':'down';
  const t=(n>=0?'+':'')+n.toFixed(2)+'%';
  return `<span class="pct ${s}">${t}</span>`;
};
const fmtPpFull = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}pp`;
};

const escapeHtml = str => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const LOGO_CACHE_WIDTH = 28;
const LOGO_PREWARM_LIMIT = 24;
const LOGO_FETCH_LOW_START_INDEX = 12;
const ABSOLUTE_URL_REGEX = /^https?:\/\//i;
const prewarmedLogoKeys = new Set();

function collectLogoCandidates(coin) {
  if (!coin || typeof coin !== 'object') return [];
  const candidates = [];
  const push = (value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.push(trimmed);
  };

  push(coin.logo);
  push(coin.logo_url);
  push(coin.logoUrl);
  push(coin.logoSrc);
  push(coin.image);
  push(coin.image_url);
  push(coin.imageUrl);
  push(coin.icon);
  push(coin.icon_url);
  push(coin.iconUrl);
  push(coin.logoURI);
  if (coin.images && typeof coin.images === 'object') {
    Object.values(coin.images).forEach(push);
  }
  if (coin.image && typeof coin.image === 'object') {
    const { original, large, small, thumb, icon } = coin.image;
    push(original);
    push(large);
    push(small);
    push(thumb);
    push(icon);
  }
  if (Array.isArray(coin.logos)) {
    coin.logos.forEach(push);
  }
  return candidates;
}

function getPreferredLogoUrl(coin) {
  const candidates = collectLogoCandidates(coin);
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (ABSOLUTE_URL_REGEX.test(candidate)) return candidate;
  }
  for (const candidate of seen) {
    if (candidate.startsWith('/')) return candidate;
  }
  return null;
}

function resolveLogoSource(coin) {
  const preferred = getPreferredLogoUrl(coin);
  if (preferred && ABSOLUTE_URL_REGEX.test(preferred)) {
    return {
      src: `/api/logo?url=${encodeURIComponent(preferred)}&w=${LOGO_CACHE_WIDTH}`,
      original: preferred
    };
  }
  if (preferred) {
    return { src: preferred, original: null };
  }
  const symbol = (coin?.symbol || '').toLowerCase();
  const fallbackSrc = symbol ? `/api/icon/${symbol}` : '/media/logo.png';
  return {
    src: fallbackSrc,
    original: null
  };
}

function prewarmLogoCache(coins) {
  if (!Array.isArray(coins) || !coins.length) return;
  const items = [];
  const limit = Math.min(LOGO_PREWARM_LIMIT, coins.length);
  for (let i = 0; i < limit; i++) {
    const info = resolveLogoSource(coins[i]);
    if (!info.original) continue;
    const key = `${info.original}|${LOGO_CACHE_WIDTH}`;
    if (prewarmedLogoKeys.has(key)) continue;
    prewarmedLogoKeys.add(key);
    items.push({ url: info.original, w: LOGO_CACHE_WIDTH });
  }
  if (!items.length) return;
  fetch('/api/logo/prewarm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }).catch(err => console.warn('Logo cache prewarm failed', err));
}

/* ---- 안전 fetch helper ---- */
async function safeJson(url){
  try{
    const r = await fetch(url);
    if(!r.ok) return null;
    return await r.json();
  }catch{ return null; }
}

// 심볼 -> 풀네임 (없으면 심볼 그대로)
const NAME_MAP = { BTC:'Bitcoin', ETH:'Ethereum', BCH:'Bitcoin Cash', XRP:'XRP', LTC:'Litecoin', TRX:'TRON', ADA:'Cardano', DOGE:'Dogecoin', SOL:'Solana', DOT:'Polkadot', AVAX:'Avalanche', LINK:'Chainlink', XLM:'Stellar', ETC:'Ethereum Classic', BNB:'BNB', ATOM:'Cosmos', MATIC:'Polygon', SHIB:'Shiba Inu', TON:'Toncoin', NEAR:'NEAR Protocol', APT:'Aptos', SUI:'Sui', ARB:'Arbitrum', OP:'Optimism', FIL:'Filecoin', ICP:'Internet Computer', UNI:'Uniswap', AAVE:'Aave', MKR:'Maker', INJ:'Injective', KAS:'Kaspa', RUNE:'THORChain' };
const nameFor = sym => NAME_MAP[(sym||'').toUpperCase()] || (sym || '');

/* ---- State ---- */
const state={
  all:[], filtered:[],
  sortKey:"market_cap", sortDir:-1,
  page:1, perPage:50
};

/* =========================
   ⭐ StarField (enhanced cyberpunk version)
   ========================= */
const StarField=(()=>{
  let cv,ctx,stars=[],intensity=.8,animId=null,W=0,H=0,dpr=1;
  const D=260, TW_MIN=.002, TW_MAX=.006, R_MIN=.6, R_MAX=1.8;
  const rand=(a,b)=>a+Math.random()*(b-a);
  
  function resize(){
    if(!cv) return; 
    dpr=window.devicePixelRatio||1;
    const vw=innerWidth, vh=innerHeight;
    W=Math.floor(vw*dpr); H=Math.floor(vh*dpr);
    cv.width=W; cv.height=H; 
    cv.style.width=vw+"px"; 
    cv.style.height=vh+"px";
    build();
  }
  
  function build(){
    const area=(W*H)/(dpr*dpr);
    const target=Math.floor(area/100000*D*intensity);
    const cur=stars.length;
    if(cur<target){
      for(let i=cur;i<target;i++){
        stars.push({
          x:Math.random()*W,
          y:Math.random()*H,
          r:rand(R_MIN,R_MAX)*dpr,
          a:rand(.5,.95),
          tw:rand(TW_MIN,TW_MAX),
          ph:Math.random()*Math.PI*2,
          color: Math.random() > 0.7 ? '#00ffff' : '#ffffff' // Cyberpunk touch
        });
      }
    }else if(cur>target){ 
      stars.splice(target); 
    }
  }
  
  function loop(){
    if(!ctx) return;
    ctx.clearRect(0,0,W,H);
    const base=intensity;
    for(const s of stars){
      s.ph+=s.tw;
      const a=base*(.85+.15*Math.sin(s.ph));
      ctx.globalAlpha=a*s.a;
      ctx.beginPath(); 
      ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=s.color; 
      ctx.fill();
      
      // Add glow effect for cyan stars
      if(s.color === '#00ffff') {
        ctx.globalAlpha = a*s.a*0.3;
        ctx.beginPath();
        ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2);
        ctx.fillStyle=s.color;
        ctx.fill();
      }
    }
    ctx.globalAlpha=1;
    animId=requestAnimationFrame(loop);
  }
  
  function setIntensity(v){
    intensity=Math.max(0,Math.min(1,v));
    build();
    if(intensity>0&&!animId) animId=requestAnimationFrame(loop);
    if(intensity===0&&animId){ 
      cancelAnimationFrame(animId); 
      animId=null; 
      ctx.clearRect(0,0,W,H); 
    }
  }
  
  function init(){
    cv=$("#whiteStars"); 
    if(!cv) return;
    ctx=cv.getContext("2d"); 
    resize(); 
    addEventListener("resize",resize);
  }
  
  return {init,setIntensity};
})();

/* ---- Star slider wiring ---- */
(function(){
  const r=$("#starRange");
  if(!r) return;
  const apply=v=>{ 
    const n=clamp(v/100,0,1); 
    document.documentElement.style.setProperty("--starVis", String(n)); 
    StarField.setIntensity(n); 
  };
  r.addEventListener("input",e=>apply(e.target.value));
})();

/* ---- Mobile navigation toggle ---- */
(function(){
  const nav = document.querySelector('.nav-header');
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navLinks');
  if(!nav || !toggle || !menu) return;

  nav.classList.add('js-nav');

  const mq = window.matchMedia('(max-width: 960px)');

  const sync = () => {
    if (mq.matches) {
      if (!nav.classList.contains('open')) menu.setAttribute('hidden', '');
    } else {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      menu.removeAttribute('hidden');
    }
  };

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) menu.removeAttribute('hidden');
    else menu.setAttribute('hidden', '');
  });

  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    menu.setAttribute('hidden', '');
  }));

  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', sync);
  else if (typeof mq.addListener === 'function') mq.addListener(sync);
  window.addEventListener('resize', sync);
  sync();
})();

/* =========================
   Data fetchers (CoinGecko & Alternative.me)
   ========================= */
// 1) markets
async function fetchMarkets(page=1, per=250){
  const base = "/api/binance/markets";
  const q = `vs_currency=usd&order=market_cap_desc&per_page=${per}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  try{
    const r = await fetch(`${base}?${q}`);
if(!r.ok) {
      console.error('Market fetch failed', r.status, await r.text());
      throw 0;
    }
    return await r.json();
  }catch(e){
    console.warn("markets fail p"+page);
   console.error('Market fetch error', e);
    return [];
  }
}

// Fetch top markets from CoinGecko across multiple pages.
// CoinGecko limits the number of items per request, so we request
// consecutive pages until we gather all available markets or a page
// returns fewer results than requested.
async function fetchAllMarkets(){
const per = 250; // maximum allowed by the API per request
  const all = [];
  for(let page=1; page<10; page++){
    const items = await fetchMarkets(page, per);
    if(!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if(items.length < per) break; // reached the last page
  }
  return all;
}

// 2) global
async function fetchGlobal(){
  try{
    const r = await fetch("/api/global");
    if(!r.ok) throw 0;
    return await r.json();
  }catch{
    return null;
  }
}

// 3) FNG
async function fetchFNG(){
  try{
    const r = await fetch("/api/fng?limit=1&format=json");
    if(!r.ok) throw 0;
    return await r.json();
  }catch{
    return null;
  }
}


/* =========================
   HUB (Cyberpunk Donut)
   ========================= */
function gaugeHTML(val){
  const v=clamp(Number(val)||0,0,100);
  const deg=-90+(v/100)*180;
  const color = v<=40 ? "#ff0066" : v<=60 ? "#ffff00" : "#00ff88";
  const label = v<=20?"Extreme Fear":v<=40?"Fear":v<=60?"Neutral":v<=80?"Greed":"Extreme Greed";
  
  return `<div style="display:flex;flex-direction:column;gap:8px">
    <svg viewBox="0 0 300 160" style="width:100%;height:120px;filter:drop-shadow(0 0 10px ${color})">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ff0066"/>
          <stop offset="50%" stop-color="#ffff00"/>
          <stop offset="100%" stop-color="#00ff88"/>
        </linearGradient>
      </defs>
      <path d="M30,140 A120,120 0 0 1 270,140" stroke="url(#g1)" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.3"/>
      <path d="M30,140 A120,120 0 0 1 270,140" stroke="url(#g1)" stroke-width="8" fill="none" stroke-linecap="round"/>
      <g transform="translate(150,140) rotate(${deg})">
        <line x1="0" y1="0" x2="0" y2="-88" stroke="${color}" stroke-width="6" stroke-linecap="round" filter="drop-shadow(0 0 10px ${color})"/>
      </g>
      <circle cx="150" cy="140" r="10" fill="${color}" filter="drop-shadow(0 0 15px ${color})"/>
    </svg>
    <div style="display:flex;justify-content:space-between;font-family:'Orbitron',monospace;font-weight:700;text-transform:uppercase;letter-spacing:1px">
      <span style="color:${color};text-shadow:0 0 10px ${color}">${v}</span>
      <span style="color:${color};text-shadow:0 0 10px ${color}">${label}</span>
    </div>
  </div>`;
}

function whaleDualDonutHTML(gPct, tPct){
  const clamp = n => Math.max(0, Math.min(100, Number(n)||0));
  const G = clamp(gPct), T = clamp(tPct);
   const C=80, R1=60, R2=44, TAU=2*Math.PI;
  const dash = (r,p)=>`${(TAU*r*p/100).toFixed(1)} ${(TAU*r*(1-p/100)).toFixed(1)}`;
  return `
    <svg viewBox="0 0 160 160" style="width:200px;height:200px">
      <circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="rgba(0,255,255,.15)" stroke-width="10"/>
      <circle cx="${C}" cy="${C}" r="${R2}" fill="none" stroke="rgba(255,102,204,.12)" stroke-width="10"/>
      <g transform="rotate(-90 ${C} ${C})">
        <circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="#00ffff" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${dash(R1,G)}"/>
        <circle cx="${C}" cy="${C}" r="${R2}" fill="none" stroke="#ff66cc" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${dash(R2,T)}"/>
      </g>
    </svg>`;
}

// Flow Pulse: 바깥=1h(네온 시안), 안쪽=24h(바이올렛)
const FLOW_OUTER_COLOR = '#00f5ff';
const FLOW_INNER_COLOR = '#ff6ad5';
const FLOW_DELTA_COLOR = '#ffd166';

function flowDualDonutHTML(r1hPct, r24hPct){
  const clamp = n => Math.max(0, Math.min(100, Number(n)||0));
  const A = clamp(r1hPct), B = clamp(r24hPct);
  const C=80, R1=60, R2=44, TAU=2*Math.PI;
  const dash = (r,p)=>`${(TAU*r*p/100).toFixed(1)} ${(TAU*r*(1-p/100)).toFixed(1)}`;
  return `
    <svg viewBox="0 0 160 160" style="width:200px;height:200px">
      <circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="rgba(0,245,255,.18)" stroke-width="10"/>
      <circle cx="${C}" cy="${C}" r="${R2}" fill="none" stroke="rgba(255,106,213,.15)" stroke-width="10"/>
      <g transform="rotate(-90 ${C} ${C})">
        <circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="${FLOW_OUTER_COLOR}"  stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${dash(R1,A)}"/>
        <circle cx="${C}" cy="${C}" r="${R2}" fill="none" stroke="${FLOW_INNER_COLOR}" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${dash(R2,B)}"/>
      </g>
    </svg>`;
}

function flowInfoHTML(r1h, r24, dpp){
  return `
    <div class="wgap-wrap" style="display:flex;gap:18px;align-items:center">
      <div class="wgap-svg">${flowDualDonutHTML(r1h, r24)}</div>
      <div class="wgap-text" style="flex:1;min-width:0;font-family:'Orbitron',monospace">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <span class="chip" style="color:${FLOW_OUTER_COLOR};text-shadow:0 0 10px ${FLOW_OUTER_COLOR}66;"><i class="dot"></i> 1h avg <b>${r1h.toFixed(1)}%</b></span>
          <span class="chip" style="color:${FLOW_INNER_COLOR};text-shadow:0 0 10px ${FLOW_INNER_COLOR}66;"><i class="dot"></i> 24h avg <b>${r24.toFixed(1)}%</b></span>
          <span class="chip" style="color:${FLOW_DELTA_COLOR};text-shadow:0 0 10px ${FLOW_DELTA_COLOR}66;"><i class="dot"></i> Δ <b>${(dpp>=0?'+':'')}${dpp.toFixed(1)}pp</b> <span style="opacity:.6">(1h−24h)</span></span>
        </div>
        <hr class="hr-grad" style="border:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent);margin:8px 0;">
        <div style="color:rgba(255,255,255,.75)">
          <b style="color:${FLOW_OUTER_COLOR};text-shadow:0 0 10px ${FLOW_OUTER_COLOR}66">Outer ring</b>: 1h 평균 Taker Buy %<br>
          <b style="color:${FLOW_INNER_COLOR};text-shadow:0 0 10px ${FLOW_INNER_COLOR}66">Inner ring</b>: 24h 평균 Taker Buy %
        </div>
        <div style="color:rgba(255,255,255,.6);margin-top:8px">
          <b style="color:${FLOW_DELTA_COLOR};text-shadow:0 0 10px ${FLOW_DELTA_COLOR}66">Note</b>: 단독 판단 금지 — Whale Gap, Funding/Basis, OI와 함께 참고
        </div>
      </div>
    </div>
  `;
}

function whaleInfoHTML(gLast, tLast, dNow, dAvg){
  const fmtPctVal = v => Number.isFinite(v) ? v.toFixed(1) + '%' : '—';
  const fmtPpVal  = v => Number.isFinite(v) ? ((v >= 0 ? '+' : '') + v.toFixed(1) + 'pp') : '—';

  const chips = [];
  if (Number.isFinite(gLast)) chips.push(`<span class="chip" style="color:#48b9ff;text-shadow:0 0 10px #48b9ff66;"><i class="dot"></i> Global <b>${fmtPctVal(gLast)}</b></span>`);
  if (Number.isFinite(tLast)) chips.push(`<span class="chip" style="color:#ff7be9;text-shadow:0 0 10px #ff7be966;"><i class="dot"></i> Top <b>${fmtPctVal(tLast)}</b></span>`);
  if (Number.isFinite(dNow)) chips.push(`<span class="chip" style="color:#ffd166;text-shadow:0 0 10px #ffd16666;"><i class="dot"></i> Δ Now <b>${fmtPpVal(dNow)}</b></span>`);
  if (Number.isFinite(dAvg)) chips.push(`<span class="chip" style="color:#8be9ff;text-shadow:0 0 10px #8be9ff66;"><i class="dot"></i> 24h Avg <b>${fmtPpVal(dAvg)}</b></span>`);

  if (!chips.length) {
    return `<div style="color:#8b95a7;font-family:'Orbitron',monospace">No data (Whale Gap)</div>`;
  }

  const summaryParts = [];
  if (Number.isFinite(dNow)) summaryParts.push(`Realtime Δ <b>${fmtPpVal(dNow)}</b>`);
  if (Number.isFinite(dAvg)) summaryParts.push(`24h trend <b>${fmtPpVal(dAvg)}</b>`);
  const summary = summaryParts.length
    ? `<div style="color:rgba(255,255,255,.7);font-size:0.85rem;letter-spacing:1px;margin-top:6px">${summaryParts.join(' · ')}</div>`
    : '';

  return `
    <div class="wgap-wrap" style="display:flex;gap:18px;align-items:center">
      <div class="wgap-svg">${whaleDualDonutHTML(gLast, tLast)}</div>
      <div class="wgap-text" style="flex:1;min-width:0;font-family:'Orbitron',monospace">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${chips.join('')}</div>
        ${summary}
        <hr class="hr-grad" style="border:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent);margin:10px 0;">
        <div style="color:rgba(255,255,255,.75)">
          <b style="color:#48b9ff;text-shadow:0 0 10px #48b9ff66">Outer ring</b>: Global Long/Short Account Ratio<br>
          <b style="color:#ff7be9;text-shadow:0 0 10px #ff7be966">Inner ring</b>: Top Trader Long/Short Position Ratio
        </div>
        <div style="color:rgba(255,255,255,.58);margin-top:8px">
          <b style="color:#ffd166;text-shadow:0 0 10px #ffd16666">Guide</b>: Funding · Basis · OI와 교차 확인
        </div>
      </div>
    </div>
  `;
}

function buildHub(sections){
  const svg=$("#hubSvg");
  if(!svg) return;
  svg.innerHTML="";
  
  const hubBig=$("#hubBig"), hubSub=$("#hubSub"), hubTitle=$("#hubTitle"), hubBody=$("#hubBody");
   
  const cx=500,cy=500,rI=260,rO=470, TAU=Math.PI*2, seg=TAU/sections.length, start=-Math.PI/2;
  
  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const arc=(r0,r1,b0,b1)=>{
      const [x0,y0]=p(r1,b0),[x1,y1]=p(r1,b1),[x2,y2]=p(r0,b1),[x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0; 
      return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
    };
    
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute("d", arc(rI,rO,a0,a1));
    path.setAttribute("class","seg");
    svg.appendChild(path);
    
    const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-30)*Math.cos(mid), ty=cy+(rx-30)*Math.sin(mid)+6;
    const label=document.createElementNS(svg.namespaceURI,'text');
    label.setAttribute("x",tx); 
    label.setAttribute("y",ty); 
    label.setAttribute("text-anchor","middle");
    label.setAttribute("class","seg-label"); 
    label.textContent=s.badge; 
    svg.appendChild(label);
    
    const act=()=>{
      svg.querySelectorAll(".seg").forEach(e=>e.classList.remove("active"));
      path.classList.add("active");
      hubBig.textContent=s.centerTop;
      hubSub.textContent=s.centerSub;
      hubTitle.textContent=s.title;
      hubBody.innerHTML=s.html;
      hubBig.style.fontSize = s.smallCenter ? '16px' : '';
      hubBig.style.whiteSpace = s.smallCenter ? 'nowrap' : '';
    };
    
    path.addEventListener("click", act); 
    label.addEventListener("click", act);
  });
}

async function initHub(){
  const mkts = state.all;
  
  if(!mkts || !mkts.length){
    $("#hubBig").textContent="COSMOS"; 
    $("#hubSub").textContent="INITIALIZE";
    $("#hubTitle").textContent="System Status"; 
    $("#hubBody").textContent="Loading market data...";
    return;
  }
  
  const [global, fng, globalLS, topLS] = await Promise.all([
    fetchGlobal(),
    fetchFNG(),
    fetch('/api/binance/ls/global').then(r=>r.json()).catch(()=>null),
    fetch('/api/binance/ls/top').then(r=>r.json()).catch(()=>null)
  ]);

  const flow = await safeJson('/api/binance/flow?symbol=BTCUSDT&period=5m');

  const r1h = Number(flow?.ratio_1h);
  const r24 = Number(flow?.ratio_24h);
  const dpp = Number(flow?.delta_pp);
  const hasFlow = Number.isFinite(r1h) && Number.isFinite(r24);

  const dominanceMulti = await safeJson('/api/dominance/top3?days=30');
  let domDelta30d = null;
  let domDetailAvailable = false;
  if (dominanceMulti && Array.isArray(dominanceMulti.coins)) {
    const btcDom = dominanceMulti.coins.find(c => {
      const id = (c?.id || '').toLowerCase();
      const sym = (c?.symbol || '').toLowerCase();
      return id === 'bitcoin' || sym === 'btc';
    });
    if (btcDom?.series?.length) {
      domDetailAvailable = true;
      const first = Number(btcDom.series[0]?.value);
      const last = Number(btcDom.series[btcDom.series.length - 1]?.value);
      if (Number.isFinite(first) && Number.isFinite(last)) domDelta30d = last - first;
    }
  }

  const listTop=(by,n=10)=> mkts.slice().sort((a,b)=> (b[by]??0)-(a[by]??0)).slice(0,n);
  
  const toList=(arr,kind)=>`<div style="display:flex;flex-direction:column;gap:8px">`+arr.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const px=fmtPrice(c.current_price);
    const pct=(c.price_change_percentage_24h||0); 
    const cls=pct>=0?'up':'down';
    const vol=fmtMoney(c.total_volume);
    
    return `<div style="display:grid;grid-template-columns:2em 1fr auto auto;gap:10px;align-items:center;padding:8px;background:linear-gradient(135deg,rgba(0,255,255,0.03),rgba(153,69,255,0.03));border-radius:8px;border:1px solid rgba(0,255,255,0.1)">
      <div style="opacity:.7;text-align:right;font-family:'Orbitron',monospace;font-weight:700;color:#00ffff;text-shadow:0 0 5px currentColor">${i+1}</div>
      <div style="font-family:'Orbitron',monospace;font-weight:700;color:#00ffff;text-shadow:0 0 8px currentColor">${sym}</div>
      <div style="opacity:.9;text-align:right;font-weight:600">${px}</div>
      <div class="${kind==='vol'?'':'pct '+cls}" style="text-align:right;font-weight:700">${kind==='vol'?vol:((pct>=0?'+':'')+pct.toFixed(2)+'%')}</div>
    </div>`;
  }).join("")+`</div>`;
  
  const byId=Object.fromEntries(mkts.map(m=>[m.id,m]));
  const btc=byId.bitcoin||null;
  const dom = global?.data?.market_cap_percentage?.btc ?? null;
  const domCenterSub = dom!=null ? `30D Δ ${fmtPpFull(domDelta30d)}` : 'DOMINANCE';
  const domDeltaClass = Number.isFinite(domDelta30d) ? (domDelta30d >= 0 ? 'up' : 'down') : null;
  const domDeltaHtml = domDeltaClass
    ? `<span class="pct ${domDeltaClass}" style="font-size:1rem">${(domDelta30d>=0?'+':'')}${domDelta30d.toFixed(2)}pp</span>`
    : `<span style="opacity:.5">—</span>`;
  const domDetailLink = domDetailAvailable
    ? `<a href="/menu/cosmos/dominance.html" style="display:inline-flex;align-items:center;gap:6px;margin-top:16px;padding:8px 14px;border-radius:12px;border:1px solid rgba(0,255,255,0.35);background:rgba(0,255,255,0.06);color:#00ffff;text-decoration:none;font-family:'Orbitron',monospace;font-size:0.72rem;letter-spacing:1.6px;text-transform:uppercase;">Dominance detail<span aria-hidden="true">→</span></a>`
    : `<div style="margin-top:16px;font-size:0.72rem;color:rgba(255,255,255,0.45);font-family:'Orbitron',monospace;text-transform:uppercase;letter-spacing:1px;">Detail data unavailable</div>`;
  const f = Number(fng?.data?.[0]?.value ?? NaN);

  const gLast = globalLS?.long_pct_last;
  const tLast = topLS?.long_pct_last;
  const dNow  = (isFinite(tLast) && isFinite(gLast)) ? (tLast - gLast) : null;
  const dAvg  = (isFinite(topLS?.long_pct_avg24) && isFinite(globalLS?.long_pct_avg24))
                ? (topLS.long_pct_avg24 - globalLS.long_pct_avg24) : null;

  const fmtPctShort = v => Number.isFinite(v) ? v.toFixed(1) + '%' : '—';
  const fmtPpShort  = v => Number.isFinite(v) ? ((v >= 0 ? '+' : '') + v.toFixed(1) + 'pp') : '—';

  const whaleHasData = [gLast, tLast, dNow, dAvg].some(Number.isFinite);
  const whaleCenterTop = (Number.isFinite(gLast) || Number.isFinite(tLast))
    ? `G ${fmtPctShort(gLast)} | T ${fmtPctShort(tLast)}`
    : '—';
  const whaleCenterParts = [];
  if (Number.isFinite(dNow)) whaleCenterParts.push(`Δ ${fmtPpShort(dNow)}`);
  if (Number.isFinite(dAvg)) whaleCenterParts.push(`24h ${fmtPpShort(dAvg)}`);
  const whaleCenterSub = whaleCenterParts.length ? whaleCenterParts.join(' · ') : 'NO DATA';

  const whaleSec = {
    badge: "W-GAP",
    title: "Whale Gap",
    centerTop: whaleCenterTop,
    centerSub: whaleCenterSub,
    smallCenter: true,
    html: whaleHasData
      ? whaleInfoHTML(gLast, tLast, dNow, dAvg)
      : "<div style=\"color:#8b95a7;font-family:'Orbitron',monospace\">No data (Whale Gap)</div>"
  };
   
  const flowSec = {
    badge: "FLOW",
    title: "Flow Pulse",
    centerTop: hasFlow ? `1h ${r1h.toFixed(1)}% | 24h ${r24.toFixed(1)}%` : "—",
    centerSub:  Number.isFinite(dpp) ? `Δ ${(dpp>=0?'+':'')}${dpp.toFixed(1)}pp` : "NO DATA",
    smallCenter: true,
     html: hasFlow
      ? flowInfoHTML(r1h, r24, dpp)   // ← 시안/바이올렛/앰버 톤 설명 블록
      : "<div style='color:#8b95a7'>No data (Flow API)</div>"
  };

  const secs=[
    {
      badge:"VOL", 
      title:"Volume Leaders", 
      centerTop:"Volume Top10", 
      centerSub:"24H VOLUME", 
      html: toList(listTop("total_volume"),"vol")
    },
    {
      badge:"+24H", 
      title:"24H Gainers", 
      centerTop:"+24H Top", 
      centerSub:"GAINERS", 
      html: toList(listTop("price_change_percentage_24h"),"pct")
    },
    {
      badge:"F&G", 
      title:"Fear & Greed Index", 
      centerTop: isFinite(f)? String(f):"—", 
      centerSub:"INDEX", 
      html: isFinite(f)?gaugeHTML(f):"<div style='color:#8b95a7'>No data available</div>"
    },
    {
      badge:"BTC MC", 
      title:"Bitcoin Market Cap", 
      centerTop: btc?fmtMoney(btc.market_cap):"—", 
      centerSub:"BTC MCAP", 
      html:`<div style="font-family:'Orbitron',monospace;text-transform:uppercase;letter-spacing:2px;color:#00ffff;text-shadow:0 0 10px currentColor">Bitcoin Market Cap</div>
            <div style="margin-top:12px;font-size:24px;font-weight:700">${btc?fmtMoney(btc.market_cap):'—'}</div>`
    },
      whaleSec,
    {
      badge:"BTC DOM",
      title:"Bitcoin Dominance",
      centerTop: dom!=null?dom.toFixed(2)+"%":"—",
      centerSub: domCenterSub,
      html:`<div style="font-family:'Orbitron',monospace;text-transform:uppercase;letter-spacing:2px;color:#00ffff;text-shadow:0 0 10px currentColor">Bitcoin Dominance</div>
            <div style="margin-top:12px;font-size:24px;font-weight:700">${dom!=null?dom.toFixed(2)+"%":"—"}</div>
            <div style="margin-top:12px;font-size:0.9rem;color:rgba(255,255,255,0.75);font-family:'Orbitron',monospace;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:8px;">30D Change ${domDeltaHtml}</div>
            ${domDetailLink}`
    },
  ];
  
  const iBTC = secs.findIndex(s=>s.badge==='BTC MC');
  const iUSDT = secs.findIndex(s=>s.badge==='USDT');
  if (iBTC >= 0) secs[iBTC] = flowSec;
  else if (iUSDT >= 0) secs[iUSDT] = flowSec;
  else secs.push(flowSec);

  buildHub(secs);
  $("#hubBig").textContent="COSMOS";
  $("#hubSub").textContent="ONLINE";
}

/* =========================
   Table
   ========================= */
function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;

  const rawSymbol = (c.symbol || '').trim();
  const sym  = rawSymbol.toUpperCase();      // 예: BTC
  const isUrlSymbol = /^https?:\/\//i.test(rawSymbol) || (rawSymbol.includes('.') && rawSymbol.length > 6);
  const displaySymbol = isUrlSymbol ? rawSymbol : sym;
  const symbolBoxClass = `symbol-box${isUrlSymbol ? ' long' : ''}`;
  const symbolNameClass = `symbol-name${isUrlSymbol ? ' long' : ''}`;
  const safeSymbol = escapeHtml(displaySymbol);
  const logoInfo = resolveLogoSource(c);
  const safeLogoSrc = escapeHtml(logoInfo.src);
  const altText = safeSymbol || escapeHtml(sym || rawSymbol || 'Asset');
  const fetchPriorityAttr = i >= LOGO_FETCH_LOW_START_INDEX ? ' fetchpriority="low"' : '';
  const displayName = (c.name && c.name.toUpperCase() !== sym) ? c.name : nameFor(sym);
  const pair = sym ? sym + 'USDT' : '';             // 예: BTCUSDT

  return `
  <tr data-symbol="${pair}">
    <td class="sticky-rank num">${c.market_cap_rank ?? (i + 1)}</td>
    <td class="sticky-name">
      <div class="mkt-name">
        <img src="${safeLogoSrc}" alt="${altText}" width="${LOGO_CACHE_WIDTH}" height="${LOGO_CACHE_WIDTH}" loading="lazy" decoding="async"${fetchPriorityAttr}>
        <div class="${symbolBoxClass}"><span class="${symbolNameClass}" title="${safeSymbol}">${safeSymbol}</span></div>
        <span class="full">${displayName}</span>
      </div>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPct(p1h)}</td>
    <td class="num">${fmtPct(p24)}</td>
    <td class="num hide-m">${fmtPct(p7d)}</td>
    <td class="num hide-m">${fmtMoney(c.market_cap)}</td>
    <td class="num hide-m">${fmtMoney(c.total_volume)}</td>
    <td class="num">${fmtPct(c.open_interest_1h_change_pct)}</td>
    <td class="num">${fmtPct(c.open_interest_24h_change_pct)}</td>
    <td class="spark"><canvas width="140" height="32" data-spark-id="${c.id}"></canvas></td>
  </tr>`;
}

function applyFilterSort(){
  const q = ($("#q").value||"").toLowerCase();
  let arr = state.all.filter(c=> !q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
  
  const k=state.sortKey, dir=state.sortDir;
  const get = c => ({
    rank: c.market_cap_rank ?? 1e9,
    name: (c.name||"").toLowerCase(),
    price: c.current_price ?? -1,
    change1h: c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? 0,
    change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    change7d: c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0,
    market_cap: c.market_cap ?? -1,
    volume: c.total_volume ?? -1,
    oi_1h_pct:  c.open_interest_1h_change_pct ?? 0,
    oi_24h_pct: c.open_interest_24h_change_pct ?? 0,
  })[k];
  
  arr.sort((a,b)=>{
    const va=get(a), vb=get(b);
    if(typeof va==="string" && typeof vb==="string") return dir * va.localeCompare(vb);
    return dir * ((va??-1) - (vb??-1));
  });
  
  state.filtered=arr;
  if((state.page-1)*state.perPage >= arr.length) state.page=1;
  
  renderTable(); 
  renderPager();
}

function renderTable(){
  const tbody=$("#mktBody");
  const start=(state.page-1)*state.perPage;
  const items=state.filtered.slice(start, start+state.perPage);
  
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');
   
  if (window.innerWidth <= 768) {
         const maxChars = 5;
    tbody.querySelectorAll('.symbol-name').forEach(el => {
      const len = (el.textContent || '').trim().length;
      if (len > maxChars) {
        const base = parseFloat(getComputedStyle(el).fontSize) || 16;
        const scaled = base * (maxChars / len);
        el.style.fontSize = `${scaled}px`;
      }
    });
  }

  // sparklines with cyberpunk glow
  drawSparks(items);
  
  // row click → chart.html (바이낸스 차트 페이지로 이동)
  tbody.querySelectorAll("tr[data-symbol]").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const symbol=tr.getAttribute("data-symbol");
      // menu/cosmos/chart.html 경로로 이동
      if (symbol) location.href=`/menu/cosmos/chart.html?sym=${encodeURIComponent(symbol)}`;
    });
  });
}

function renderPager(){
  const el=$("#pager"); 
  if(!el) return;
  
  const n=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur=state.page;
  
  const btn=(i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" class="${sel?'active':''}">${lab}</button>`;
  
  let html=""; 
  for(let i=1;i<=n;i++){ 
    if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ 
      html+=btn(i,String(i),false,i===cur);
    } else if(!html.endsWith("…")){ 
      html+="<span style='opacity:.6;padding:0 8px;font-family:Orbitron,monospace'>…</span>"; 
    } 
  }
  
  el.innerHTML=html;
  el.querySelectorAll("button[data-pg]").forEach(b=> b.addEventListener("click",()=>{ 
    state.page=Number(b.dataset.pg)||1; 
    renderTable(); 
    renderPager(); 
  }));
}

/* header sort */
(function wireSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.addEventListener("click", ()=>{
      const k=th.dataset.key; 
      if(!k) return;
      if(state.sortKey===k) state.sortDir*=-1; 
      else { state.sortKey=k; state.sortDir=-1; }
      applyFilterSort();
    });
  });
})();

/* sparkline with cyberpunk colors */
function drawSparks(items){
  items.forEach(c=>{
    const cv = document.querySelector(`canvas[data-spark-id="${c.id}"]`);
    const arr=(c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
    if(!cv || !arr || arr.length<2) return;
    
    const ctx=cv.getContext("2d"); 
    const w=cv.width, h=cv.height;
    ctx.clearRect(0,0,w,h);
    
    const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
    const up = arr[arr.length-1] >= arr[0]; 
    
    // Gradient for sparkline
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    if(up) {
      gradient.addColorStop(0, '#00ff8866');
      gradient.addColorStop(1, '#00ff88');
    } else {
      gradient.addColorStop(0, '#ff006666');
      gradient.addColorStop(1, '#ff0066');
    }
    
    ctx.lineWidth=2; 
    ctx.strokeStyle = gradient;
    ctx.shadowColor = up ? '#00ff88' : '#ff0066';
    ctx.shadowBlur = 5;
    
    ctx.beginPath();
    arr.forEach((v,i)=>{
      const x=(i/(arr.length-1))*w, y=h-((v-min)/span)*h; 
      if(i===0) ctx.moveTo(x,y); 
      else ctx.lineTo(x,y);
    });
    ctx.stroke();
  });
}

/* =========================
   Init
   ========================= */
async function init(){
  StarField.init(); // ⭐ Cyberpunk stars
  StarField.setIntensity(0.8);

  $("#q").addEventListener("input", ()=>{ 
    state.page=1; 
    applyFilterSort(); 
  });

  // Initial data load
  const mkts = await fetchAllMarkets();
  state.all = Array.isArray(mkts)? mkts : [];
  applyFilterSort();
  prewarmLogoCache(state.all);

  // Hub initial render
  await initHub();
  
  // Auto refresh every 30s
  setInterval(async ()=>{
    const mkts2 = await fetchAllMarkets();
    if(Array.isArray(mkts2) && mkts2.length){
      state.all=mkts2;
      applyFilterSort();
    }
    prewarmLogoCache(state.all);
    initHub();
  }, 30000);
}

// Initialize when DOM is ready
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
