
/* ===== COSMOS JS – full build ===== */

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
  return safeLocale(v,0,clamp(d,0,8));
}
function fmtNum(v,max=2){ if(v==null||Number.isNaN(v)) return "-"; return safeLocale(v,0,clamp(max,0,8)); }
function fmtPct(v){
  if(v==null||Number.isNaN(v)) return "-";
  const n = Number(v);
  const sign = n>0?"+":""; const cls = n>0?"up":n<0?"down":"";
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
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
  const color = up ? "#28e07a" : "#ff5b6e";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`;
}
const $ = (s,sc=document)=>sc.querySelector(s);
const $$ = (s,sc=document)=>Array.from(sc.querySelectorAll(s));
const safeSetHTML = (sel,html) => { const el = typeof sel==="string"?$(sel):sel; if(el) el.innerHTML = html; };

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
async function fetchMarketChart(id, vs='usd', days=7, interval='daily'){
  const q=`vs_currency=${vs}&days=${days}&interval=${interval}`;
  const direct=`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  const proxy=`/api/coins/${encodeURIComponent(id)}/market_chart?${q}`;
  try{ const r=await fetch(direct); if(!r.ok) throw 0; return await r.json(); }
  catch{ const r2=await fetch(proxy); if(!r2.ok) throw new Error("chart failed"); return await r2.json(); }
}

/* --- State --- */
const state = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 50,
  sortKey: "market_cap",
  sortDir: -1, // -1 desc, 1 asc
};

/* --- Rendering --- */
function buildRowHTML(c){
  const id = c.id;
  const price = fmtPrice(c.current_price);
  const s7 = (c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  const sym = (c.symbol||"").toUpperCase();
  const href = `./chart.html?id=${encodeURIComponent(id)}`;
  return `<tr class="row">
    <td class="row-index">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell">
      <img class="coin-img" src="${c.image}" alt="${sym}">
      <a class="coin-name" href="${href}" title="전체 차트 보기">${sym}</a>
      <span class="coin-sym">${c.name}</span>
    </td>
    <td class="text-right">$${price}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null)}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_7d_in_currency ?? null)}</td>
    <td class="text-right capcell">
      <span>$${fmtNum(c.market_cap,0)}</span>
      <span class="cap-spark" data-id="${id}"></span>
    </td>
    <td class="text-right">$${fmtNum(c.total_volume,0)}</td>
    <td class="text-right spark-col"><span class="spark">${s7 ? sparklineSVG(s7) : "-"}</span></td>
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
      el.innerHTML = sparklineSVG(caps,70,20);
      el.removeAttribute('data-id');
    }catch(e){/* ignore */}
    await new Promise(r=>setTimeout(r,150));
  }
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
  // 50단위 고정 묶음 안내: 1~50, 51~100 ...
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
  const total = global?.data?.total_market_cap?.usd ?? null;
  const btcCap = btc?.market_cap ?? null;
  const dom = (btcCap && total) ? (btcCap/total*100) : null;
  safeSetHTML("#kpi-btc-mcap", btcCap ? "$"+fmtNum(btcCap,0) : "-");
  safeSetHTML("#kpi-global-mcap", total ? "$"+fmtNum(total,0) : "-");
  safeSetHTML("#kpi-dominance", dom!=null ? fmtNum(dom,2)+"%" : "-");
}
function renderRightLists(markets){
  // gainers by 24h %
  const gainers = markets.slice().filter(x=>Number.isFinite(x.price_change_percentage_24h)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,7);
  safeSetHTML("#list-gainers", gainers.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const val=c.price_change_percentage_24h;
    const cls=val>=0?"up":"down";
    return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="value ${cls}">${val.toFixed(2)}%</div></div>`;
  }).join(""));
  // volume ranking
  const vol = markets.slice().sort((a,b)=>b.total_volume-a.total_volume).slice(0,7);
  safeSetHTML("#list-volume", vol.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="value">$${fmtNum(c.total_volume,0)}</div></div>`;
  }).join(""));
}

/* --- Init --- */
async function init(){
  try{
    const [markets, global] = await Promise.all([fetchMarkets(), fetchGlobal()]);
    state.all = markets;
    renderKPIs(markets, global);
    renderRightLists(markets);
    applySortFilter();
  }catch(e){
    console.error(e);
    safeSetHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // events
  $("#search").addEventListener("input", ()=>{ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", (e)=>{ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", (e)=>{
    state.sortDir = state.sortDir===-1 ? 1 : -1;
    e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲";
    applySortFilter();
  });
  $("#page").addEventListener("change", (e)=>{ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });

  init();
  // auto refresh every 30s
  setInterval(init, 30000);
});

// expose for console debug
window._cosmos = { state, init };
