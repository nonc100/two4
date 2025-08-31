/* ===== COSMOS JS – full build (with Derivatives card, 2025-08-31) ===== */

/* --- Locale clamps to avoid maximumFractionDigits errors --- */
(() => {
  const origToLS = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locale, opts) {
    if (opts && typeof opts === "object") {
      let { minimumFractionDigits: min, maximumFractionDigits: max } = opts;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = { ...opts, ...(min !== undefined ? { minimumFractionDigits: min } : {}),
                        ...(max !== undefined ? { maximumFractionDigits: max } : {}), };
    }
    return origToLS.call(this, locale || "en-US", opts);
  };
  const OrigNF = Intl.NumberFormat;
  Intl.NumberFormat = function (locale, opts) {
    if (opts && typeof opts === "object") {
      let { minimumFractionDigits: min, maximumFractionDigits: max } = opts;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = { ...opts, ...(min !== undefined ? { minimumFractionDigits: min } : {}),
                        ...(max !== undefined ? { maximumFractionDigits: max } : {}), };
    }
    return new OrigNF(locale || "en-US", opts);
  };
})();

/* --- Utils --- */
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
function safeLocale(num,minFD=0,maxFD=2){
  let min = Number.isFinite(minFD) ? clamp(minFD,0,20) : 0;
  let max = Number.isFinite(maxFD) ? clamp(maxFD,0,20) : 2;
  if(max<min) max=min;
  try{return Number(num??0).toLocaleString('en-US',{minimumFractionDigits:min,maximumFractionDigits:max});}
  catch{return String(Number(num??0).toFixed(max));}
}
function fmtPrice(v){
  if(v==null||Number.isNaN(v)) return "-";
  let d; if(v>=100)d=2; else if(v>=1)d=4; else if(v>0)d=Math.ceil(Math.abs(Math.log10(v)))+2; else d=2;
  return "$"+safeLocale(v,0,clamp(d,0,8));
}
function fmtPctHTML(v){
  if(v==null||Number.isNaN(v)) return '<span class="neutral">-</span>';
  const n=Number(v);
  const cls=n>0?'up':n<0?'down':'neutral';
  const sign=n>0?'+':'';
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
}
function fmtSmallPct(v, decimals=4){
  if(v==null||Number.isNaN(v)) return "−";
  const n = Number(v);
  const sign = n>0?'+':'';
  return `${sign}${n.toFixed(decimals)}%`;
}
function fmtNumSuffix(v){
  if(v==null||Number.isNaN(v)) return "-";
  const n = Number(v);
  const abs=Math.abs(n);
  if(abs>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(abs>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(abs>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  if(abs>=1e3)  return "$"+(n/1e3).toFixed(2)+"K";
  return "$"+safeLocale(n,0,2);
}
function $(s,sc=document){return sc.querySelector(s)}
function $$(s,sc=document){return Array.from(sc.querySelectorAll(s))}
const setHTML = (sel,html) => { const el = typeof sel==="string"?$(sel):sel; if(el) el.innerHTML = html; };

/* --- Fetchers (direct → proxy fallback) --- */
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){
  const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  const direct=`https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy=`/api/coins/markets?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("markets failed"); return await r2.json(); }
}
async function fetchGlobal(){
  const direct=`https://api.coingecko.com/api/v3/global`;
  const proxy=`/api/global`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("global failed"); return await r2.json(); }
}
async function fetchFNG(){
  const direct=`https://api.alternative.me/fng/?limit=2`;
  const proxy=`/api/fng`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("fng failed"); return await r2.json(); }
}
async function fetchBinanceLS(period='1h'){
  const sym='BTCUSDT';
  const q=`symbol=${sym}&period=${period}&limit=1`;
  const direct=`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${q}`;
  const proxy=`/api/binance/globalLongShortAccountRatio?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("ls failed"); return await r2.json(); }
}

/* --- Derivatives: Funding / OI --- */
async function fetchFunding(symbol="BTCUSDT", limit=3){
  const q=`symbol=${symbol}&limit=${limit}`;
  const direct=`https://fapi.binance.com/futures/data/fundingRate?${q}`;
  const proxy=`/api/binance/fundingRate?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("funding failed"); return await r2.json(); }
}
async function fetchOIHist(symbol="BTCUSDT", period="5m", limit=288){
  const q=`symbol=${symbol}&period=${period}&limit=${limit}`;
  const direct=`https://fapi.binance.com/futures/data/openInterestHist?${q}`;
  const proxy=`/api/binance/openInterestHist?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("oi failed"); return await r2.json(); }
}

/* --- State --- */
const state = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 50,
  sortKey: "market_cap",
  sortDir: -1, // -1 desc, 1 asc
  lsPeriod: "1h",
};

/* --- Rendering: table --- */
function buildRowHTML(c){
  const price = fmtPrice(c.current_price);
  const s7 = (c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  const sym = (c.symbol||"").toUpperCase();
  return `<tr class="row">
    <td class="row-index">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell">
      <img class="coin-img" src="${c.image}" alt="${sym}">
      <span class="coin-name">${sym}</span>
    </td>
    <td class="text-right">${price}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null)}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_7d_in_currency ?? null)}</td>
    <td class="text-right">${fmtNumSuffix(c.market_cap)}</td>
    <td class="text-right">${fmtNumSuffix(c.total_volume)}</td>
    <td class="text-right">${s7 ? sparklineSVG(s7) : "-"}</td>
  </tr>`;
}
function sparklineSVG(arr,w=100,h=24){
  if(!arr || arr.length < 2) return "-";
  const min = Math.min(...arr), max = Math.max(...arr), span = (max-min)||1;
  const pts = arr.map((p,i)=>{
    const x=(i/(arr.length-1))*w;
    const y=h-((p-min)/span)*h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = arr[arr.length-1] >= arr[0];
  const color = up ? "#22c55e" : "#ef4444";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`;
}
function ensureTbody(){ return $("#cosmos-tbody"); }

function renderTableSlice(rows){
  const tbody = ensureTbody(); if(!tbody) return;
  const start = (state.page-1)*state.perPage, end = start + state.perPage;
  const slice = rows.slice(start,end);
  setHTML(tbody, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);
}

function applySortFilter(){
  const q = ($("#search").value||"").trim().toLowerCase();
  state.filtered = state.all.filter(c => {
    if(!q) return true;
    const sym = (c.symbol||"").toLowerCase();
    const nm = (c.name||"").toLowerCase();
    return sym.includes(q) || nm.includes(q);
  });

  const dir = state.sortDir;
  const k = state.sortKey;
  const get = (c)=>{
    switch(k){
      case "market_cap": return c.market_cap ?? -1;
      case "price": return c.current_price ?? -1;
      case "volume": return c.total_volume ?? -1;
      case "change1h": return c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? -1;
      case "change24h": return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? -1;
      case "change7d": return c.price_change_percentage_7d_in_currency ?? -1;
      case "rank": return c.market_cap_rank ?? 1e9;
      case "symbol": return (c.symbol||"").toUpperCase();
      default: return 0;
    }
  };
  state.filtered.sort((a,b)=>{
    const va = get(a), vb = get(b);
    const res = (typeof va === "string" && typeof vb === "string") ? va.localeCompare(vb) : (va>vb?1:va<vb?-1:0);
    return res*dir;
  });

  // header sort indicator
  $$(".cosmos-table thead th.sortable").forEach(th=>{
    const key=th.dataset.key;
    th.classList.toggle("sorted", key===state.sortKey);
    th.classList.toggle("asc", key===state.sortKey && state.sortDir===1);
    th.classList.toggle("desc", key===state.sortKey && state.sortDir===-1);
  });

  const sel = $("#page");
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
  sel.innerHTML = Array.from({length: totalPages}, (_,i)=>{
    const s=i*state.perPage+1, e=Math.min(state.filtered.length,(i+1)*state.perPage);
    return `<option value="${i+1}">${s}~${e}</option>`;
  }).join("");
  if(state.page>totalPages) state.page = totalPages;

  renderTableSlice(state.filtered);
}

/* --- KPIs/Gainers/Volume --- */
function renderKPIs(markets, global){
  const btc = markets.find(x=>x.id==="bitcoin");
  const tether = markets.find(x=>x.id==="tether");
  const total = global?.data?.total_market_cap?.usd ?? null;
  const btcCap = btc?.market_cap ?? null;
  const dom = (btcCap && total) ? (btcCap/total*100) : (global?.data?.market_cap_percentage?.btc ?? null);
  setHTML("#kpi-btc-mcap", btcCap ? fmtNumSuffix(btcCap) : "-");
  setHTML("#kpi-usdt-mcap", tether?.market_cap ? fmtNumSuffix(tether.market_cap) : "-");
  setHTML("#kpi-dominance", dom!=null ? Number(dom).toFixed(2)+"%" : "-");
}

function renderRightLists(markets){
  // 24h 등락률 상위
  const gainers = markets.slice()
    .filter(x=>Number.isFinite(x.price_change_percentage_24h))
    .sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h)
    .slice(0,10);
  setHTML("#list-gainers", gainers.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const val=c.price_change_percentage_24h ?? 0;
    const cls=val>=0?"up":"down";
    return `<div class="row">
      <div class="rank">${i+1}.</div>
      <div class="sym">${sym}</div>
      <div class="price">${fmtPrice(c.current_price)}</div>
      <div class="pct ${cls}">${val>=0?'+':''}${val.toFixed(2)}%</div>
    </div>`;
  }).join(""));

  // 거래량 순위
  const vol = markets.slice().sort((a,b)=> (b.total_volume||0)-(a.total_volume||0)).slice(0,10);
  setHTML("#list-volume", vol.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const pct=c.price_change_percentage_24h ?? 0;
    const cls=pct>=0?"up":"down";
    return `<div class="row">
      <div class="rank">${i+1}.</div>
      <div class="sym">${sym}</div>
      <div class="price">${fmtPrice(c.current_price)}</div>
      <div class="pct ${cls}">${pct>=0?'+':''}${pct.toFixed(2)}%</div>
    </div>`;
  }).join(""));
}

/* --- FNG gauge --- */
function renderFNGCard(data){
  try{
    const item = Array.isArray(data?.data) ? data.data[0] : null;
    if(!item){ setHTML("#fng-title","- / -"); setHTML("#fng-gauge",""); return; }
    const value = Number(item.value);
    const cls = value<=40?'risk':value<=60?'neutral':'safe';
    const label = item.value_classification || (value<=40?'Fear':value<=60?'Neutral':'Greed');
    setHTML("#fng-title", `${value} / ${label}`);
    const dt = item.timestamp ? new Date(Number(item.timestamp)*1000) : new Date();
    setHTML("#fng-date", `Alternative.me · ${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}`);
    const badge = $("#fng-badge"); badge.className = `badge ${cls}`; badge.textContent = label;

    const pct = clamp((value/100),0,1);
    const start=-Math.PI, end=0;
    const ang = start + (end-start)*pct;
    const r=56, cx=80, cy=86;
    const arc=(a)=>`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;
    const needleX=cx+ (r-8)*Math.cos(ang), needleY=cy+ (r-8)*Math.sin(ang);
    const svg = `
    <svg width="160" height="100" viewBox="0 0 160 100">
      <defs>
        <linearGradient id="seg1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
        <linearGradient id="seg2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/>
        </linearGradient>
      </defs>
      <path d="M ${arc(start)} A ${r} ${r} 0 0 1 ${arc(-Math.PI/2)}" stroke="url(#seg1)" stroke-width="12" fill="none" opacity=".9"/>
      <path d="M ${arc(-Math.PI/2)} A ${r} ${r} 0 0 1 ${arc(end)}" stroke="url(#seg2)" stroke-width="12" fill="none" opacity=".9"/>
      <circle cx="${cx}" cy="${cy}" r="2.8" fill="#fff" opacity=".9"/>
      <line x1="${cx}" y1="${cy}" x2="${needleX}" y2="${needleY}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
    setHTML("#fng-gauge", svg);
  }catch{
    setHTML("#fng-title","- / -"); setHTML("#fng-gauge","");
  }
}

/* --- Mini caps (BTC/USDT) --- */
async function fetchMarketChart(id, days=7){
  const q=`vs_currency=usd&days=${days}`;
  const direct=`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  const proxy=`/api/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("chart failed"); return await r2.json(); }
}
function renderMiniCaps(btcChart, usdtChart){
  const toCapArr = d => Array.isArray(d?.market_caps) ? d.market_caps.map(x=>x[1]) : null;
  const a = toCapArr(btcChart), b = toCapArr(usdtChart);
  setHTML("#kpi-btc-spark", a ? sparklineSVG(a, 180, 44) : "");
  setHTML("#kpi-usdt-spark", b ? sparklineSVG(b, 180, 44) : "");
}

/* --- Derivatives render --- */
function renderDerivatives({btc, eth}){
  const setFunding = (coin, valPct)=>{
    const maxAbs = 0.10; // 0.10% = 풀스케일(한쪽 50%)
    const w = clamp(Math.abs(valPct)/maxAbs, 0, 1)*50; // half width
    const pos = $(`#fund-${coin}-pos`), neg = $(`#fund-${coin}-neg`);
    if(!pos || !neg) return;
    pos.style.width = "0%"; neg.style.width = "0%";
    if(valPct>=0) pos.style.width = `${w}%`; else neg.style.width = `${w}%`;
    setHTML(`#fund-${coin}-val`, fmtSmallPct(valPct, 4));
  };
  const setOI = (coin, valPct)=>{
    const max = 25; // 25%를 풀스케일로
    const w = clamp(Math.abs(valPct)/max, 0, 1)*100;
    const bar = $(`#oi-${coin}-bar`);
    if(bar) bar.style.width = `${w}%`;
    const el = $(`#oi-${coin}-val`);
    if(el){ el.textContent = (valPct>=0?'+':'') + valPct.toFixed(2) + '%'; el.className = 'val ' + (valPct>=0?'up':'down'); }
  };
  setFunding("btc", btc.funding);
  setFunding("eth", eth.funding);
  setOI("btc", btc.oiDelta);
  setOI("eth", eth.oiDelta);
  const dt = new Date();
  setHTML("#deriv-meta", `Binance Futures · ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`);
}

/* --- Long/Short --- */
function renderLongShort(period, arr){
  const last = Array.isArray(arr) ? arr[arr.length-1] : null;
  if(!last){ setHTML("#ls-long","-"); setHTML("#ls-short","-"); setHTML("#ls-ratio","-"); return; }
  const ratio = Number(last.longShortRatio || last.longShortRatio?.toString() || 0);
  let longPct, shortPct;
  if(last.longAccount && last.shortAccount){
    const la=Number(last.longAccount), sa=Number(last.shortAccount);
    const sum=la+sa || 1;
    longPct = la/sum*100; shortPct = sa/sum*100;
  }else if(ratio){
    shortPct = 100/(1+ratio);
    longPct = 100-shortPct;
  }else{
    longPct = shortPct = 50;
  }
  setHTML("#ls-long", `${longPct.toFixed(1)}%`);
  setHTML("#ls-short", `${shortPct.toFixed(1)}%`);
  setHTML("#ls-ratio", ratio ? ratio.toFixed(2) : `${(longPct/shortPct).toFixed(2)}`);
  $("#ls-longbar").style.width = `${clamp(longPct,0,100)}%`;
  $$('.ls-ctl button').forEach(b=>b.classList.toggle('active', b.dataset.period===period));
}

/* --- Init --- */
function wireHeaderSort(){
  const mapKey = (k)=> k;
  $$(".cosmos-table thead th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = mapKey(th.dataset.key);
      if(state.sortKey === key){
        state.sortDir = state.sortDir===-1 ? 1 : -1;
      }else{
        state.sortKey = key;
        state.sortDir = -1; // 기본 내림차순
      }
      applySortFilter();
    });
  });
}

async function initOnce(){
  $("#backBtn").addEventListener("click", ()=>history.back());

  // Long/Short buttons
  $$('.ls-ctl button').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const p=e.currentTarget.dataset.period;
      state.lsPeriod=p;
      try{ const d=await fetchBinanceLS(p); renderLongShort(p,d); }catch{}
    });
  });

  $("#search").addEventListener("input", ()=>{ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", (e)=>{ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", (e)=>{
    state.sortDir = state.sortDir===-1 ? 1 : -1;
    e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲";
    applySortFilter();
  });
  $("#page").addEventListener("change", (e)=>{ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });

  wireHeaderSort();

  // Star controller
  const r = $("#starRange");
  const setStar = (v)=> document.documentElement.style.setProperty("--star", String(v/100));
  if(r){
    const saved = Number(localStorage.getItem("two4_star")||0);
    r.value = String(clamp(saved,0,100));
    setStar(Number(r.value));
    r.addEventListener("input", (e)=>{
      const v = clamp(Number(e.target.value||0),0,100);
      setStar(v);
      localStorage.setItem("two4_star", String(v));
    });
  }
}

async function initData(){
  try{
    const [markets, global, fng, ls, btcChart, usdtChart] = await Promise.all([
      fetchMarkets(), fetchGlobal(), fetchFNG(), fetchBinanceLS(state.lsPeriod),
      fetchMarketChart('bitcoin', 7), fetchMarketChart('tether', 7)
    ]);
    state.all = markets;
    renderKPIs(markets, global);
    renderRightLists(markets);
    applySortFilter();
    renderFNGCard(fng);
    renderLongShort(state.lsPeriod, ls);
    renderMiniCaps(btcChart, usdtChart);

    // Derivatives data
    const [fund_btc, fund_eth, oi_btc, oi_eth] = await Promise.all([
      fetchFunding("BTCUSDT", 3), fetchFunding("ETHUSDT", 3),
      fetchOIHist("BTCUSDT", "5m", 288), fetchOIHist("ETHUSDT", "5m", 288)
    ]);

    const avgFunding = (arr)=> {
      if(!Array.isArray(arr)||arr.length===0) return 0;
      const rates = arr.map(x=>Number(x.fundingRate||x.rate||0));
      const m = rates.length || 1;
      return rates.reduce((s,v)=>s+v,0)/m*100; // % 단위
    };
    const oiDeltaPct = (arr)=>{
      if(!Array.isArray(arr)||arr.length<2) return 0;
      const first = Number(arr[0].sumOpenInterest || arr[0].openInterest || 0);
      const last  = Number(arr[arr.length-1].sumOpenInterest || arr[arr.length-1].openInterest || 0);
      if(!first) return 0;
      return (last-first)/first*100;
    };

    renderDerivatives({
      btc: { funding: avgFunding(fund_btc), oiDelta: oiDeltaPct(oi_btc) },
      eth: { funding: avgFunding(fund_eth), oiDelta: oiDeltaPct(oi_eth) }
    });

  }catch(e){
    console.error(e);
    setHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  initOnce();
  initData();

  // 비가시 탭에서는 업데이트 중지
  let vis = document.visibilityState === "visible";
  document.addEventListener("visibilitychange", ()=>{ vis = document.visibilityState === "visible"; });

  // auto refresh (모바일: 60s)
  setInterval(async ()=>{
    if(!vis) return;
    try{
      const [markets, global] = await Promise.all([fetchMarkets(), fetchGlobal()]);
      state.all = markets;
      renderKPIs(markets, global);
      renderRightLists(markets);
      applySortFilter();
    }catch{}
  }, 60000);

  // FNG hourly
  setInterval(async ()=>{ if(!vis) return; try{ renderFNGCard(await fetchFNG()); }catch{} }, 60*60*1000);

  // Derivatives 5분마다
  setInterval(async ()=>{
    if(!vis) return;
    try{
      const [fund_btc, fund_eth, oi_btc, oi_eth] = await Promise.all([
        fetchFunding("BTCUSDT", 3), fetchFunding("ETHUSDT", 3),
        fetchOIHist("BTCUSDT", "5m", 288), fetchOIHist("ETHUSDT", "5m", 288)
      ]);
      const avgFunding = (arr)=> {
        if(!Array.isArray(arr)||arr.length===0) return 0;
        const rates = arr.map(x=>Number(x.fundingRate||x.rate||0));
        const m = rates.length || 1;
        return rates.reduce((s,v)=>s+v,0)/m*100;
      };
      const oiDeltaPct = (arr)=>{
        if(!Array.isArray(arr)||arr.length<2) return 0;
        const first = Number(arr[0].sumOpenInterest || arr[0].openInterest || 0);
        const last  = Number(arr[arr.length-1].sumOpenInterest || arr[arr.length-1].openInterest || 0);
        if(!first) return 0;
        return (last-first)/first*100;
      };
      renderDerivatives({
        btc: { funding: avgFunding(fund_btc), oiDelta: oiDeltaPct(oi_btc) },
        eth: { funding: avgFunding(fund_eth), oiDelta: oiDeltaPct(oi_eth) }
      });
    }catch{}
  }, 5*60*1000);
});

// expose for console debug
window._cosmos = { state, initData };
