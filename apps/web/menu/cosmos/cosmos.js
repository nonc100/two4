/* ===== COSMOS JS – header minis + grid + star slider ===== */

/* --- Locale guards --- */
(()=>{const o=Number.prototype.toLocaleString;Number.prototype.toLocaleString=function(l,a){if(a&&"object"==typeof a){let{minimumFractionDigits:n,maximumFractionDigits:t}=a;Number.isFinite(n)||(n=void 0),Number.isFinite(t)||(t=void 0),void 0!==n&&(n=Math.min(20,Math.max(0,n))),void 0!==t&&(t=Math.min(20,Math.max(0,t))),void 0!==n&&void 0!==t&&t<n&&(t=n),a={...a,...(void 0!==n?{minimumFractionDigits:n}:{}),...(void 0!==t?{maximumFractionDigits:t}:{})}}return o.call(this,l||"en-US",a)};const e=Intl.NumberFormat;Intl.NumberFormat=function(l,a){if(a&&"object"==typeof a){let{minimumFractionDigits:n,maximumFractionDigits:t}=a;Number.isFinite(n)||(n=void 0),Number.isFinite(t)||(t=void 0),void 0!==n&&(n=Math.min(20,Math.max(0,n))),void 0!==t&&(t=Math.min(20,Math.max(0,t))),void 0!==n&&void 0!==t&&t<n&&(t=n),a={...a,...(void 0!==n?{minimumFractionDigits:n}:{}),...(void 0!==t?{maximumFractionDigits:t}:{})}}return new e(l||"en-US",a)}})();

/* --- Utils --- */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function safeLocale(v,minFD=0,maxFD=2){let m=Number.isFinite(minFD)?clamp(minFD,0,20):0,x=Number.isFinite(maxFD)?clamp(maxFD,0,20):2;if(x<m)x=m;try{return Number(v??0).toLocaleString('en-US',{minimumFractionDigits:m,maximumFractionDigits:x})}catch{return String(Number(v??0).toFixed(x))}}
function fmtPrice(v){if(v==null||Number.isNaN(v))return"-";let d; if(v>=100)d=2; else if(v>=1)d=4; else if(v>0)d=Math.ceil(Math.abs(Math.log10(v)))+2; else d=2; return safeLocale(v,0,clamp(d,0,8))}
function fmtNum(v,max=2){if(v==null||Number.isNaN(v))return"-";return safeLocale(v,0,clamp(max,0,8))}
function fmtPct(v){if(v==null||Number.isNaN(v))return"-";const n=Number(v),s=n>0?"+":"";return `<span class="${n>0?"up":n<0?"down":""}">${s}${n.toFixed(2)}%</span>`}
function sparklineSVG(arr,w=100,h=24){ if(!arr||arr.length<2) return "-"; const min=Math.min(...arr),max=Math.max(...arr),span=(max-min)||1; const pts=arr.map((p,i)=>`${(i/(arr.length-1))*w},${h-((p-min)/span)*h}`).join(" "); const up=arr[arr.length-1]>=arr[0]; const color=up?"#28e07a":"#ff5b6e"; return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`}
const $=(s,sc=document)=>sc.querySelector(s); const $$=(s,sc=document)=>Array.from(sc.querySelectorAll(s));
const safeSetHTML=(sel,html)=>{const el=typeof sel==="string"?$(sel):sel; if(el) el.innerHTML=html}

/* --- Data fetchers (direct -> proxy fallback) --- */
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;const d=`https://api.coingecko.com/api/v3/coins/markets?${q}`;const p=`/api/coins/markets?${q}`;try{const r=await fetch(d);if(!r.ok)throw 0;return await r.json()}catch{const r2=await fetch(p);if(!r2.ok)throw new Error("markets failed");return await r2.json()}}
async function fetchGlobal(){const d=`https://api.coingecko.com/api/v3/global`;const p=`/api/global`;try{const r=await fetch(d);if(!r.ok)throw 0;return await r.json()}catch{const r2=await fetch(p);if(!r2.ok)throw new Error("global failed");return await r2.json()}}
async function fetchMarketChart(id,vs='usd',days=7,interval='daily'){const q=`vs_currency=${vs}&days=${days}&interval=${interval}`;const d=`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`;const p=`/api/coins/${encodeURIComponent(id)}/market_chart?${q}`;try{const r=await fetch(d);if(!r.ok)throw 0;return await r.json()}catch{const r2=await fetch(p);if(!r2.ok)throw new Error("chart failed");return await r2.json()}}

/* --- State --- */
const state={all:[],filtered:[],page:1,perPage:50,sortKey:"market_cap",sortDir:-1};

/* --- Table --- */
function buildRowHTML(c){
  const id=c.id, price=fmtPrice(c.current_price), s7=c.sparkline_in_7d?.price || null, sym=(c.symbol||"").toUpperCase();
  const href=`./chart.html?id=${encodeURIComponent(id)}`;
  return `<tr class="row">
    <td class="row-index">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell"><img class="coin-img" src="${c.image}" alt="${sym}"><a class="coin-name" href="${href}" title="전체 차트 보기">${sym}</a><span class="coin-sym">${c.name}</span></td>
    <td class="text-right">$${price}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null)}</td>
    <td class="text-right">${fmtPct(c.price_change_percentage_7d_in_currency ?? null)}</td>
    <td class="text-right">$${fmtNum(c.market_cap,0)}</td>
    <td class="text-right">$${fmtNum(c.total_volume,0)}</td>
    <td class="text-right spark-col"><span class="spark">${s7 ? sparklineSVG(s7) : "-"}</span></td>
  </tr>`;
}
function renderTableSlice(rows){
  const tb=$("#cosmos-tbody"); if(!tb) return;
  const s=(state.page-1)*state.perPage, e=s+state.perPage;
  const slice=rows.slice(s,e);
  safeSetHTML(tb, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);
}

/* --- Header minis (BTC/Global) --- */
async function renderHeaderMinis(markets){
  try{ const d=await fetchMarketChart('bitcoin','usd',7,'daily'); const caps=(d.market_caps||[]).map(p=>Array.isArray(p)?p[1]:p).filter(Boolean); safeSetHTML('#mini-btc', sparklineSVG(caps,180,36)); }catch{}
  try{
    const top=markets.slice(0,100).filter(c=>Array.isArray(c.sparkline_in_7d?.price));
    if(top.length){ const len=top[0].sparkline_in_7d.price.length; const agg=new Array(len).fill(0);
      top.forEach(c=>{ const supply=(c.market_cap&&c.current_price)?(c.market_cap/c.current_price):0; const s=c.sparkline_in_7d.price; for(let i=0;i<len;i++) agg[i]+=s[i]*supply; });
      safeSetHTML('#mini-global', sparklineSVG(agg,180,36));
    }
  }catch{}
}

/* --- KPIs / Lists --- */
function renderKPIs(markets,global){
  const btc=markets.find(x=>x.id==="bitcoin");
  const total=global?.data?.total_market_cap?.usd ?? null;
  const btcCap=btc?.market_cap ?? null;
  const dom=(btcCap&&total)?(btcCap/total*100):null;
  safeSetHTML("#kpi-btc-mcap", btcCap ? "$"+fmtNum(btcCap,0) : "-");
  safeSetHTML("#kpi-global-mcap", total ? "$"+fmtNum(total,0) : "-");
  safeSetHTML("#kpi-dominance", dom!=null ? fmtNum(dom,2)+"%" : "-");
}
function renderRightLists(markets){
  const gainers=markets.slice().filter(x=>Number.isFinite(x.price_change_percentage_24h)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,7);
  safeSetHTML("#list-gainers", gainers.map((c,i)=>{ const sym=(c.symbol||"").toUpperCase(); const v=c.price_change_percentage_24h; const cls=v>=0?"up":"down"; return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="value ${cls}">${v.toFixed(2)}%</div></div>`; }).join(""));
  const vol=markets.slice().sort((a,b)=>b.total_volume-a.total_volume).slice(0,7);
  safeSetHTML("#list-volume", vol.map((c,i)=>{ const sym=(c.symbol||"").toUpperCase(); return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="value">$${fmtNum(c.total_volume,0)}</div></div>`; }).join(""));
}

/* --- Filter/Sort --- */
function applySortFilter(){
  const q=($("#search").value||"").trim().toLowerCase();
  state.filtered=state.all.filter(c=>!q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
  const k=state.sortKey, dir=state.sortDir;
  const get=c=>{
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
  state.filtered.sort((a,b)=>{const va=get(a),vb=get(b); return (va>vb?1:va<vb?-1:0)*dir;});
  const sel=$("#page"), totalPages=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  sel.innerHTML=Array.from({length:totalPages},(_,i)=>{const s=i*state.perPage+1,e=Math.min(state.filtered.length,(i+1)*state.perPage);return `<option value="${i+1}">${s}~${e}</option>`}).join("");
  if(state.page>totalPages) state.page=totalPages;
  renderTableSlice(state.filtered);
}

/* --- Star slider (우측 상단, 드래그/자동 슬라이드, 별 트윙클) --- */
function initStarSlider(){
  const rail=$("#star-rail"), knob=$("#star-knob"), dotsWrap=$("#star-dots");
  if(!rail||!knob||!dotsWrap) return;

  // 별 점 생성 (고정 간격)
  function buildDots(){
    dotsWrap.innerHTML="";
    const W=rail.clientWidth, H=rail.clientHeight;
    const pad=24, usable=W-pad*2, N=18; // 점 개수
    for(let i=0;i<N;i++){
      const x=pad + (usable/(N-1))*i;
      const d=document.createElement("div");
      d.className="dot";
      d.style.left = `${x}px`;
      dotsWrap.appendChild(d);
    }
  }
  buildDots(); addEventListener("resize", buildDots);

  let dragging=false, auto=true, pos=8, v=1; // pos(px), v(px per frame)
  const minX=8, maxX=()=>rail.clientWidth- (knob.clientWidth+8);

  function setKnob(x){
    const max=maxX();
    pos = Math.max(minX, Math.min(max, x));
    knob.style.left = pos+"px";
    // 주변 별 트윙클(가우시안 근사)
    const dots=$$(".dot", dotsWrap);
    const center = pos + knob.clientWidth/2;
    dots.forEach(dot=>{
      const dx = center - dot.offsetLeft;
      const w = knob.clientWidth*0.9;
      const amp = Math.exp(-(dx*dx)/(2*(w*w)));
      const op = .15 + amp*.85;
      const scale = .7 + amp*.6;
      dot.style.opacity = op.toFixed(2);
      dot.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(2)})`;
    });
  }
  setKnob(pos);

  // 드래그
  const getX = e => (e.touches?e.touches[0].clientX:e.clientX) - rail.getBoundingClientRect().left - knob.clientWidth/2;
  const onDown = e => { dragging=true; auto=false; setKnob(getX(e)); e.preventDefault(); }
  const onMove = e => { if(!dragging) return; setKnob(getX(e)); }
  const onUp   = () => { dragging=false; setTimeout(()=>auto=true, 1500); }

  knob.addEventListener("mousedown", onDown);
  addEventListener("mousemove", onMove);
  addEventListener("mouseup", onUp);
  knob.addEventListener("touchstart", onDown, {passive:false});
  addEventListener("touchmove", onMove, {passive:false});
  addEventListener("touchend", onUp);

  // 자동 왕복 슬라이드
  function tick(){
    if(auto && !dragging){
      const max=maxX();
      pos += v;
      if(pos<=minX || pos>=max) v*=-1;
      setKnob(pos);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

/* --- Init --- */
async function init(){
  try{
    const [markets, global] = await Promise.all([fetchMarkets(), fetchGlobal()]);
    state.all=markets;
    renderKPIs(markets, global);
    await renderHeaderMinis(markets);
    renderRightLists(markets);
    applySortFilter();
  }catch(e){
    console.error(e);
    safeSetHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  // controls
  $("#search").addEventListener("input", ()=>{ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", e=>{ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", e=>{ state.sortDir = state.sortDir===-1 ? 1 : -1; e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲"; applySortFilter(); });
  $("#page").addEventListener("change", e=>{ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });

  initStarSlider();   // ⭐ 우측 상단 슬라이드형 별 효과
  init();
  setInterval(init, 30000);
});

window._cosmos={state,init};
