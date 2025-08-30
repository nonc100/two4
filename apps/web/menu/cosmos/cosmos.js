/* ===== COSMOS JS – full build (cards + table + stars + gauges) ===== */

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
      opts = { ...opts,
        ...(min !== undefined ? { minimumFractionDigits: min } : {}),
        ...(max !== undefined ? { maximumFractionDigits: max } : {}) };
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
      opts = { ...opts,
        ...(min !== undefined ? { minimumFractionDigits: min } : {}),
        ...(max !== undefined ? { maximumFractionDigits: max } : {}) };
    }
    return new OrigNF(locale || "en-US", opts);
  };
})();

/* --- Utils --- */
const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
const $  = (s,sc=document)=>sc.querySelector(s);
const $$ = (s,sc=document)=>Array.from(sc.querySelectorAll(s));
const safeSetHTML = (sel,html) => { const el = typeof sel==="string"?$(sel):sel; if(el) el.innerHTML = html; };

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
  return safeLocale(v,0,clamp(d,0,8));
}
function fmtNum(v,max=2){ if(v==null||Number.isNaN(v)) return "-"; return safeLocale(v,0,clamp(max,0,8)); }
function fmtCompact(n){
  if(n==null||!Number.isFinite(+n)) return "-";
  const abs = Math.abs(n);
  if(abs>=1e12) return "$"+(n/1e12).toLocaleString('en-US',{maximumFractionDigits:2})+"T";
  if(abs>=1e9)  return "$"+(n/1e9 ).toLocaleString('en-US',{maximumFractionDigits:2})+"B";
  if(abs>=1e6)  return "$"+(n/1e6 ).toLocaleString('en-US',{maximumFractionDigits:2})+"M";
  return "$"+n.toLocaleString('en-US',{maximumFractionDigits:0});
}
function fmtPctSpan(v){
  if(v==null||Number.isNaN(+v)) return `<span>-</span>`;
  const n = Number(v);
  const sign = n>0?"+":"";
  const cls = n>0?"up":n<0?"down":"";
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
}
function sparklineSVG(arr,w=280,h=110,color="#ff5b6e"){
  if(!arr || arr.length < 2) return "-";
  const min = Math.min(...arr), max = Math.max(...arr), span = (max-min)||1;
  const pts = arr.map((p,i)=>{
    const x=(i/(arr.length-1))*w;
    const y=h-((p-min)/span)*h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/>
    </svg>`;
}

/* --- Fetchers (direct → proxy fallback) --- */
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){
  const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  const direct=`https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy =`/api/coins/markets?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("markets failed"); return await r2.json(); }
}
async function fetchGlobal(){
  const direct=`https://api.coingecko.com/api/v3/global`;
  const proxy =`/api/global`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("global failed"); return await r2.json(); }
}
async function fetchMarketChart(id, vs='usd', days=7, interval='daily'){
  const q=`vs_currency=${vs}&days=${days}&interval=${interval}`;
  const direct=`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  const proxy =`/api/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("chart failed"); return await r2.json(); }
}
/* Fear & Greed (2개 받아 증감률) */
async function fetchFGI(){
  const direct=`https://api.alternative.me/fng/?limit=2&format=json`;
  const proxy =`/api/fng?limit=2&format=json`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("fng failed"); return await r2.json(); }
}
/* Binance Long/Short */
async function fetchLongShort(period='1h'){
  const direct=`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=${period}&limit=30`;
  const proxy =`/api/binance/globalLongShortAccountRatio?symbol=BTCUSDT&period=${period}&limit=30`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("ls failed"); return await r2.json(); }
}

/* --- State --- */
const state = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 50,
  sortKey: "market_cap",
  sortDir: -1, // -1 desc, 1 asc
  lsPeriod: '1h',
};

/* --- Rendering: table --- */
function buildRowHTML(c){
  const id   = c.id;
  const price= fmtPrice(c.current_price);
  const s7   = (c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  const sym  = (c.symbol||"").toUpperCase();
  const href = `./chart.html?id=${encodeURIComponent(id)}`;
  return `<tr class="row">
    <td class="row-index">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell">
      <img class="coin-img" src="${c.image}" alt="${sym}">
      <a class="coin-name" href="${href}" title="전체 차트 보기">${sym}</a>
    </td>
    <td class="text-right">$${price}</td>
    <td class="text-right">${fmtPctSpan(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
    <td class="text-right">${fmtPctSpan(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null)}</td>
    <td class="text-right">${fmtPctSpan(c.price_change_percentage_7d_in_currency ?? null)}</td>
    <td class="text-right capcell">
      <span>${fmtCompact(c.market_cap)}</span>
      <span class="cap-spark" data-id="${id}"></span>
    </td>
    <td class="text-right">${fmtCompact(c.total_volume)}</td>
    <td class="text-right spark-col"><span class="spark">${s7 ? sparklineSVG(s7,100,24, s7.at(-1)>=s7[0]?"#28e07a":"#ff5b6e") : "-"}</span></td>
  </tr>`;
}
function ensureTbody(){ return $("#cosmos-tbody"); }

function renderTableSlice(rows){
  const tbody = ensureTbody(); if(!tbody) return;
  const start = (state.page-1)*state.perPage, end = start + state.perPage;
  const slice = rows.slice(start,end);
  safeSetHTML(tbody, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);
  loadCapSparklinesForPage(); // lazy load caps
}

/* lazy load market cap mini charts for first 15 rows of the page */
async function loadCapSparklinesForPage(){
  const nodes = Array.from(document.querySelectorAll('.cap-spark[data-id]')).slice(0,15);
  for(const el of nodes){
    const id = el.dataset.id;
    try{
      const d = await fetchMarketChart(id,'usd',7,'daily');
      const caps = (d.market_caps||[]).map(x=>Array.isArray(x)?x[1]:x).filter(Boolean);
      el.innerHTML = sparklineSVG(caps,70,20, caps.at(-1)>=caps[0]?"#28e07a":"#ff5b6e");
      el.removeAttribute('data-id');
    }catch(e){/* ignore */}
    await new Promise(r=>setTimeout(r,120));
  }
}

function applySortFilter(){
  const q = ($("#search").value||"").trim().toLowerCase();
  state.filtered = state.all.filter(c => {
    if(!q) return true;
    const sym = (c.symbol||"").toLowerCase();
    const nm  = (c.name||"").toLowerCase();
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
      default: return 0;
    }
  };
  state.filtered.sort((a,b)=>{
    const va = get(a), vb = get(b);
    return (va>vb?1:va<vb?-1:0)*dir;
  });

  // pagination options
  const sel = $("#page");
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
  sel.innerHTML = Array.from({length: totalPages}, (_,i)=>{
    const s=i*state.perPage+1, e=Math.min(state.filtered.length,(i+1)*state.perPage);
    return `<option value="${i+1}">${s}~${e}</option>`;
  }).join("");
  if(state.page>totalPages) state.page = totalPages;

  renderTableSlice(state.filtered);
}

/* --- KPIs & lists & mini cards --- */
function renderKPIs(markets, global){
  const btc = markets.find(x=>x.id==="bitcoin");
  const usdt = markets.find(x=>x.id==="tether");
  const total = global?.data?.total_market_cap?.usd ?? null;
  const btcCap = btc?.market_cap ?? null;
  const dom = (btcCap && total) ? (btcCap/total*100) : null;

  safeSetHTML("#kpi-btc-mcap", btcCap ? fmtCompact(btcCap) : "-");
  safeSetHTML("#kpi-usdt-mcap", usdt?.market_cap ? fmtCompact(usdt.market_cap) : "-");
  safeSetHTML("#kpi-dominance", dom!=null ? dom.toFixed(2)+"%" : "-");
}
function renderRightLists(markets){
  // gainers by 24h %
  const gainers = markets.slice()
    .filter(x=>Number.isFinite(x.price_change_percentage_24h))
    .sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h)
    .slice(0,10);

  safeSetHTML("#list-gainers", gainers.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const cls=(c.price_change_percentage_24h||0)>=0?"up":"down";
    const price=fmtPrice(c.current_price);
    const pct  =(c.price_change_percentage_24h||0).toFixed(2);
    return `<div class="r">
      <div class="rank">${i+1}.</div>
      <div class="sym">${sym} <span class="price">$${price}</span></div>
      <div class="pct ${cls}">${pct}%</div>
    </div>`;
  }).join(""));

  // volume ranking
  const vol = markets.slice().sort((a,b)=>b.total_volume-a.total_volume).slice(0,10);
  safeSetHTML("#list-volume", vol.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    return `<div class="r"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="value">${fmtCompact(c.total_volume)}</div></div>`;
  }).join(""));
}

/* --- Fear & Greed gauge + colorization --- */
function setFGI(val, prevVal, labelText){
  const v = clamp(+val||0,0,100);
  $("#fgi-val").textContent = v.toString();
  $("#fgi-label").textContent = labelText || "";
  $("#fgi-src").textContent = "Alternative.me · " + new Date().toLocaleDateString('ko-KR');

  // 색상(40↓ 루비, 41~60 노랑, 61↑ 에메랄드)
  const badge = $("#fgi-badge");
  badge.className = "badge " + (v<=40?"b-red":v<=60?"b-yellow":"b-green");
  const diffPct = (prevVal>0) ? ((v-prevVal)/prevVal*100) : 0;
  badge.textContent = `${v} ${diffPct>=0?"▲":"▼"} ${Math.abs(diffPct).toFixed(2)}%`;

  // 바늘 (0..100 -> -90deg..90deg)
  const deg = -90 + (v/100)*180;
  $("#fgi-needle").style.transform = `rotate(${deg}deg)`;
}

/* --- Long/Short render --- */
function setLongShort(longPct, shortPct, ratioStr, period){
  $("#ls-long-t").textContent = `${longPct.toFixed(1)}%`;
  $("#ls-short-t").textContent = `${shortPct.toFixed(1)}%`;
  $("#ls-long").style.width = `${clamp(longPct,0,100)}%`;
  $("#ls-short").style.width = `${clamp(shortPct,0,100)}%`;
  $("#ls-note").textContent = `BTCUSDT · ratio ${ratioStr} · ${period.toUpperCase()}`;

  // 색 그라 판단은 CSS로 충분 (초록/빨강 bar)
}

/* --- Mini charts in KPI cards --- */
async function drawMini(id, coinId, color){
  try{
    const d = await fetchMarketChart(coinId,'usd',30,'daily');
    const caps = (d.market_caps||[]).map(x=>Array.isArray(x)?x[1]:x).filter(Boolean);
    $(id).innerHTML = sparklineSVG(caps, 500, 120, color);
  }catch(e){ /* ignore */ }
}

/* --- Star field --- */
function makeStars(ctx,w,h,count){
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = `rgba(255,255,255,${0.55})`;
  for(let i=0;i<count;i++){
    const x=Math.random()*w, y=Math.random()*h, r=Math.random()*1.25+0.25;
    ctx.globalAlpha = (Math.random()*0.7+0.3);
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
}
function initStars(){
  const canvas=$("#sky"); const ctx=canvas.getContext("2d");
  function size(){ canvas.width=window.innerWidth*2; canvas.height=window.innerHeight*2; }
  size(); makeStars(ctx,canvas.width,canvas.height, 160);
  window.addEventListener('resize',()=>{ size(); makeStars(ctx,canvas.width,canvas.height, lastCount); });

  let lastCount=160;
  $("#starDensity").addEventListener('input',(e)=>{
    lastCount = 40 + Math.floor((+e.target.value/100)*460);
    makeStars(ctx,canvas.width,canvas.height,lastCount);
  });
}

/* --- Init --- */
async function init(){
  try{
    const [markets, global, fgiRaw, lsRaw] = await Promise.all([
      fetchMarkets({perPage:200}),
      fetchGlobal(),
      fetchFGI(),
      fetchLongShort(state.lsPeriod)
    ]);
    state.all = markets;

    /* KPIs + Lists */
    renderKPIs(markets, global);
    renderRightLists(markets);
    applySortFilter();

    /* Card mini charts (BTC, USDT) */
    drawMini("#mini-btc","bitcoin","#ff5b6e");
    drawMini("#mini-usdt","tether","#28e07a");

    /* Fear/Greed */
    const arr = fgiRaw?.data || [];
    const cur = arr[0]; const prev = arr[1] || {};
    setFGI(Number(cur?.value||0), Number(prev?.value||0), cur?.value_classification||"-");

    /* Long/Short */
    const last = Array.isArray(lsRaw) && lsRaw.length ? lsRaw[lsRaw.length-1] : null;
    if(last){
      const L = Number(last.longAccount||0), S = Number(last.shortAccount||0);
      const sum = (L+S)||1;
      setLongShort(L/sum*100, S/sum*100, (Number(last.longShortRatio)||0).toFixed(2), state.lsPeriod);
    }
  }catch(e){
    console.error(e);
    safeSetHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // table events
  $("#search").addEventListener("input", ()=>{ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", (e)=>{ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", (e)=>{
    state.sortDir = state.sortDir===-1 ? 1 : -1;
    e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲";
    applySortFilter();
  });
  $("#page").addEventListener("change", (e)=>{ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });

// ---- period 버튼 강조 표시 헬퍼
  function markPeriod(){
    ["1h","4h","1d"].forEach(p=>{
      const el = document.querySelector(`[data-p="${p}"]`);
      if(!el) return;
      el.style.opacity = (state.lsPeriod===p) ? "1" : "0.55";
      el.style.fontWeight = (state.lsPeriod===p) ? "800" : "600";
      el.style.border = (state.lsPeriod===p)
        ? "1px solid rgba(255,255,255,.35)"
        : "1px solid rgba(255,255,255,.15)";
    });
  }

  // ---- period 버튼 클릭 이벤트
  ["ls-1h","ls-4h","ls-1d"].forEach(id=>{
    $("#"+id).addEventListener("click", async (ev)=>{
      state.lsPeriod = ev.currentTarget.dataset.p || "1h";
      try{
        const lsRaw = await fetchLongShort(state.lsPeriod);
        const last = Array.isArray(lsRaw) && lsRaw.length ? lsRaw[lsRaw.length-1] : null;
        if(last){
          const L = Number(last.longAccount||0), S = Number(last.shortAccount||0);
          const sum = (L+S)||1;
          setLongShort(L/sum*100, S/sum*100, (Number(last.longShortRatio)||0).toFixed(2), state.lsPeriod);
        }
      }catch(e){ console.error(e); }
      markPeriod();
    });
  });
 
  // 초기 표시 한번
  markPeriod();

  // back
  $("#backBtn").addEventListener("click", ()=>{ history.back(); });

  // stars
  initStars();

  // initial data
  init();
  setInterval(init, 30000);
});

// expose for debugging
window._cosmos = { state, init };
