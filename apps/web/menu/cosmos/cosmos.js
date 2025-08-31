/* ===== COSMOS JS (모바일 보완 + 헤더 오프셋 + 행 클릭 복구) ===== */

/* Locale clamps */
(()=>{const o=Number.prototype.toLocaleString;Number.prototype.toLocaleString=function(l,e){if(e&&typeof e=="object"){let{minimumFractionDigits:n,maximumFractionDigits:a}=e;Number.isFinite(n)||(n=void 0);Number.isFinite(a)||(a=void 0);n!==void 0&&(n=Math.min(20,Math.max(0,n)));a!==void 0&&(a=Math.min(20,Math.max(0,a)));n!==void 0&&a!==void 0&&a<n&&(a=n);e={...e,...(n!==void 0?{minimumFractionDigits:n}:{}) , ...(a!==void 0?{maximumFractionDigits:a}:{})}}return o.call(this,l||"en-US",e)};const t=Intl.NumberFormat;Intl.NumberFormat=function(l,e){if(e&&typeof e=="object"){let{minimumFractionDigits:n,maximumFractionDigits:a}=e;Number.isFinite(n)||(n=void 0);Number.isFinite(a)||(a=void 0);n!==void 0&&(n=Math.min(20,Math.max(0,n)));a!==void 0&&(a=Math.min(20,Math.max(0,a)));n!==void 0&&a!==void 0&&a<n&&(a=n);e={...e,...(n!==void 0?{minimumFractionDigits:n}:{}) , ...(a!==void 0?{maximumFractionDigits:a}:{})}}return new t(l||"en-US",e)}})();

/* Utils */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const $=(s,sc=document)=>sc.querySelector(s);
const $$=(s,sc=document)=>Array.from(sc.querySelectorAll(s));
const setHTML=(sel,html)=>{const el=typeof sel==="string"?$(sel):sel; if(el) el.innerHTML=html;};
const safeLocale=(num,minFD=0,maxFD=2)=>{let m=Number.isFinite(minFD)?clamp(minFD,0,20):0,x=Number.isFinite(maxFD)?clamp(maxFD,0,20):2; if(x<m)x=m; try{return Number(num??0).toLocaleString('en-US',{minimumFractionDigits:m,maximumFractionDigits:x});}catch{return String(Number(num??0).toFixed(x));}};
const fmtPrice=v=>v==null||Number.isNaN(v)?"-":"$"+safeLocale(v,0,clamp(v>=100?2:v>=1?4:v>0?Math.ceil(Math.abs(Math.log10(v)))+2:2,0,8));
const fmtPctHTML=v=>{if(v==null||Number.isNaN(v))return'<span class="neutral">-</span>'; const n=Number(v),cls=n>0?'up':n<0?'down':'neutral',sign=n>0?'+':''; return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`};
const fmtNumSuffix=v=>{if(v==null||Number.isNaN(v))return "-";const n=Number(v),a=Math.abs(n);if(a>=1e12)return"$"+(n/1e12).toFixed(2)+"T";if(a>=1e9)return"$"+(n/1e9).toFixed(2)+"B";if(a>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(a>=1e3)return"$"+(n/1e3).toFixed(2)+"K";return"$"+safeLocale(n,0,2)};

/* 화면 위 별(캔버스) */
const StarField=(()=>{let cv,ctx,stars=[],intensity=0,animId=null,W=0,H=0,dpr=1;const D=140,TW_MIN=.002,TW_MAX=.006,R_MIN=.3,R_MAX=1.1,rand=(a,b)=>a+Math.random()*(b-a);function resize(){if(!cv)return;dpr=window.devicePixelRatio||1;const vw=innerWidth,vh=innerHeight;W=Math.floor(vw*dpr);H=Math.floor(vh*dpr);cv.width=W;cv.height=H;cv.style.width=vw+"px";cv.style.height=vh+"px";build()}function build(){const area=(W*H)/(dpr*dpr),target=Math.floor(area/100000*D*intensity),cur=stars.length; if(cur<target){for(let i=cur;i<target;i++)stars.push({x:Math.random()*W,y:Math.random()*H,r:rand(R_MIN,R_MAX)*dpr,a:rand(.35,.9),tw:rand(TW_MIN,TW_MAX),ph:Math.random()*Math.PI*2})}else if(cur>target){stars.splice(target)}}
function loop(){if(!ctx)return;ctx.clearRect(0,0,W,H);const base=intensity;for(const s of stars){s.ph+=s.tw;const a=base*(.85+.15*Math.sin(s.ph));ctx.globalAlpha=a*s.a;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill()}ctx.globalAlpha=1;animId=requestAnimationFrame(loop)}
function setIntensity(v){intensity=Math.max(0,Math.min(1,v));document.documentElement.style.setProperty("--bgstar",String(intensity));build(); if(intensity>0&&!animId)animId=requestAnimationFrame(loop); if(intensity===0&&animId){cancelAnimationFrame(animId);animId=null;ctx.clearRect(0,0,W,H)}}
function init(){cv=$("#whiteStars"); if(!cv) return; ctx=cv.getContext("2d"); resize(); addEventListener("resize",resize)}
return{init,setIntensity};})();

/* Fetchers */
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`; const d=`https://api.coingecko.com/api/v3/coins/markets?${q}`, p=`/api/coins/markets?${q}`; try{const r=await fetch(d); if(!r.ok) throw 0; return await r.json();}catch{const r2=await fetch(p); if(!r2.ok) throw new Error("markets failed"); return await r2.json();}}
async function fetchGlobal(){const d=`https://api.coingecko.com/api/v3/global`, p=`/api/global`; try{const r=await fetch(d); if(!r.ok) throw 0; return await r.json();}catch{const r2=await fetch(p); if(!r2.ok) throw new Error("global failed"); return await r2.json();}}
async function fetchFNG(){const d=`https://api.alternative.me/fng/?limit=2`, p=`/api/fng`; try{const r=await fetch(d); if(!r.ok) throw 0; return await r.json();}catch{const r2=await fetch(p); if(!r2.ok) throw new Error("fng failed"); return await r2.json();}}
async function fetchBinanceLS(period='1h'){const sym='BTCUSDT',q=`symbol=${sym}&period=${period}&limit=1`,d=`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${q}`,p=`/api/binance/globalLongShortAccountRatio?${q}`; try{const r=await fetch(d); if(!r.ok) throw 0; return await r.json();}catch{const r2=await fetch(p); if(!r2.ok) throw new Error("ls failed"); return await r2.json();}}
async function fetchMarketChart(id,days=7){const q=`vs_currency=usd&days=${days}`, d=`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`, p=`/api/coins/${encodeURIComponent(id)}/market_chart?${q}`; try{const r=await fetch(d); if(!r.ok) throw 0; return await r.json();}catch{const r2=await fetch(p); if(!r2.ok) throw new Error("chart failed"); return await r2.json();}}

/* State */
const state={all:[],filtered:[],page:1,perPage:50,sortKey:"market_cap",sortDir:-1,lsPeriod:"1h"};

/* Table */
function sparklineSVG(arr,w=100,h=24){if(!arr||arr.length<2)return"-";const min=Math.min(...arr),max=Math.max(...arr),span=(max-min)||1,pts=arr.map((p,i)=>{const x=(i/(arr.length-1))*w,y=h-((p-min)/span)*h; return `${x.toFixed(1)},${y.toFixed(1)}`}).join(" "); const up=arr.at(-1)>=arr[0], color=up?"#22c55e":"#ef4444"; return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`}
function buildRowHTML(c){
  const s7=(c.sparkline_in_7d&&c.sparkline_in_7d.price)||null, sym=(c.symbol||"").toUpperCase();
  return `<tr class="row" data-id="${c.id}">
    <td class="row-index">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell"><img class="coin-img" src="${c.image}" alt="${sym}"><span class="coin-name">${sym}</span></td>
    <td class="text-right">${fmtPrice(c.current_price)}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null)}</td>
    <td class="text-right">${fmtPctHTML(c.price_change_percentage_7d_in_currency ?? null)}</td>
    <td class="text-right">${fmtNumSuffix(c.market_cap)}</td>
    <td class="text-right">${fmtNumSuffix(c.total_volume)}</td>
    <td class="text-right">${s7?sparklineSVG(s7):"-"}</td>
  </tr>`;
}
function ensureTbody(){return $("#cosmos-tbody")}
function renderTableSlice(rows){const tbody=ensureTbody(); if(!tbody) return; const s=(state.page-1)*state.perPage,e=s+state.perPage; const slice=rows.slice(s,e); setHTML(tbody, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);}
function applySortFilter(){
  const q=($("#search").value||"").trim().toLowerCase();
  state.filtered=state.all.filter(c=>!q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
  const dir=state.sortDir,k=state.sortKey,get=c=>{switch(k){case"market_cap":return c.market_cap??-1;case"price":return c.current_price??-1;case"volume":return c.total_volume??-1;case"change1h":return c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? -1;case"change24h":return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? -1;case"change7d":return c.price_change_percentage_7d_in_currency ?? -1;case"rank":return c.market_cap_rank ?? 1e9;case"symbol":return (c.symbol||"").toUpperCase();default:return 0}};
  state.filtered.sort((a,b)=>{const va=get(a),vb=get(b); const r=(typeof va==="string"&&typeof vb==="string")?va.localeCompare(vb):(va>vb?1:va<vb?-1:0); return r*dir;});
  $$(".cosmos-table thead th.sortable").forEach(th=>{const key=th.dataset.key; th.classList.toggle("sorted",key===state.sortKey); th.classList.toggle("asc",key===state.sortKey&&state.sortDir===1); th.classList.toggle("desc",key===state.sortKey&&state.sortDir===-1);});
  const sel=$("#page"), totalPages=Math.max(1,Math.ceil(state.filtered.length/state.perPage));
  if(sel){ sel.innerHTML=Array.from({length:totalPages},(_,i)=>{const s=i*state.perPage+1,e=Math.min(state.filtered.length,(i+1)*state.perPage);return `<option value="${i+1}">${s}~${e}</option>`}).join(""); if(state.page>totalPages)state.page=totalPages; sel.value=String(state.page);}
  renderTableSlice(state.filtered);
}

/* KPIs & lists */
function renderKPIs(markets,global){
  const btc=markets.find(x=>x.id==="bitcoin"), tether=markets.find(x=>x.id==="tether");
  const total=global?.data?.total_market_cap?.usd ?? null, btcCap=btc?.market_cap ?? null;
  const dom=(btcCap&&total)?(btcCap/total*100):(global?.data?.market_cap_percentage?.btc ?? null);
  setHTML("#kpi-btc-mcap", btcCap?fmtNumSuffix(btcCap):"-");
  setHTML("#kpi-usdt-mcap", tether?.market_cap?fmtNumSuffix(tether.market_cap):"-");
  setHTML("#kpi-dominance", dom!=null?Number(dom).toFixed(2)+"%":"-");
}
function renderRightLists(markets){
  const gainers=markets.slice().filter(x=>Number.isFinite(x.price_change_percentage_24h)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,10);
  setHTML("#list-gainers", gainers.map((c,i)=>{const sym=(c.symbol||"").toUpperCase(),val=c.price_change_percentage_24h??0,cls=val>=0?"up":"down"; return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="price">${fmtPrice(c.current_price)}</div><div class="pct ${cls}">${val>=0?'+':''}${val.toFixed(2)}%</div></div>`}).join(""));
  const vol=markets.slice().sort((a,b)=>(b.total_volume||0)-(a.total_volume||0)).slice(0,10);
  setHTML("#list-volume", vol.map((c,i)=>{const sym=(c.symbol||"").toUpperCase(),pct=c.price_change_percentage_24h ?? 0,cls=pct>=0?"up":"down"; return `<div class="row"><div class="rank">${i+1}.</div><div class="sym">${sym}</div><div class="price">${fmtPrice(c.current_price)}</div><div class="pct ${cls}">${pct>=0?'+':''}${pct.toFixed(2)}%</div></div>`}).join(""));
}

/* FNG */
function renderFNGCard(data){
  try{const item=Array.isArray(data?.data)?data.data[0]:null; if(!item){setHTML("#fng-title","- / -"); setHTML("#fng-gauge",""); return;}
    const value=Number(item.value), cls=value<=40?'risk':value<=60?'neutral':'safe', label=item.value_classification || (value<=40?'Fear':value<=60?'Neutral':'Greed');
    setHTML("#fng-title",`${value} / ${label}`);
    const dt=item.timestamp?new Date(Number(item.timestamp)*1000):new Date(); setHTML("#fng-date",`Alternative.me · ${dt.getFullYear()}. ${String(dt.getMonth()+1).padStart(2,'0')}. ${String(dt.getDate()).padStart(2,'0')}`);
    const badge=$("#fng-badge"); badge.className=`badge ${cls}`; badge.textContent=label;
    const pct=Math.max(0,Math.min(1,value/100)), start=-Math.PI, end=0, ang=start+(end-start)*pct, r=56, cx=80, cy=86;
    const arc=a=>`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`, nx=cx+(r-8)*Math.cos(ang), ny=cy+(r-8)*Math.sin(ang);
    const svg=`<svg width="160" height="100" viewBox="0 0 160 100"><defs><linearGradient id="seg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient><linearGradient id="seg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs><path d="M ${arc(start)} A ${r} ${r} 0 0 1 ${arc(-Math.PI/2)}" stroke="url(#seg1)" stroke-width="12" fill="none" opacity=".9"/><path d="M ${arc(-Math.PI/2)} A ${r} ${r} 0 0 1 ${arc(end)}" stroke="url(#seg2)" stroke-width="12" fill="none" opacity=".9"/><circle cx="${cx}" cy="${cy}" r="2.8" fill="#fff" opacity=".9"/><line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
    setHTML("#fng-gauge",svg);
  }catch{setHTML("#fng-title","- / -"); setHTML("#fng-gauge","");}
}

/* Mini caps */
function renderMiniCaps(btc,usdt){const arr=d=>Array.isArray(d?.market_caps)?d.market_caps.map(x=>x[1]):null; setHTML("#kpi-btc-spark",arr(btc)?sparklineSVG(arr(btc),180,44):""); setHTML("#kpi-usdt-spark",arr(usdt)?sparklineSVG(arr(usdt),180,44):"");}

/* Long/Short */
function renderLongShort(period,arr){const last=Array.isArray(arr)?arr.at(-1):null; if(!last){setHTML("#ls-long","-"); setHTML("#ls-short","-"); setHTML("#ls-ratio","-"); return;}
  const ratio=Number(last.longShortRatio||last.longShortRatio?.toString()||0); let longPct,shortPct;
  if(last.longAccount&&last.shortAccount){const la=Number(last.longAccount),sa=Number(last.shortAccount),sum=la+sa||1; longPct=la/sum*100; shortPct=sa/sum*100;}
  else if(ratio){shortPct=100/(1+ratio); longPct=100-shortPct;} else{longPct=shortPct=50;}
  setHTML("#ls-long",`${longPct.toFixed(1)}%`); setHTML("#ls-short",`${shortPct.toFixed(1)}%`); setHTML("#ls-ratio", ratio?ratio.toFixed(2):`${(longPct/shortPct).toFixed(2)}`); $("#ls-longbar").style.width=`${Math.max(0,Math.min(100,longPct))}%`; $$('.ls-ctl button').forEach(b=>b.classList.toggle('active', b.dataset.period===period));
}

/* Topbar 높이 측정 → CSS 변수 적용 */
function applyTopbarHeight(){const bar=$("#topbar"); if(!bar) return; const h=Math.ceil(bar.getBoundingClientRect().height); document.documentElement.style.setProperty('--topbar-h', h+'px');}

/* Init */
function wireHeaderSort(){$$(".cosmos-table thead th.sortable").forEach(th=>{th.addEventListener("click",()=>{const key=th.dataset.key; if(state.sortKey===key) state.sortDir=state.sortDir===-1?1:-1; else {state.sortKey=key; state.sortDir=-1;} applySortFilter();});});}

async function initOnce(){
  $("#backBtn")?.addEventListener("click",()=>history.back());

  // ★ 행 전체 클릭 → chart.html
  $("#cosmos-tbody")?.addEventListener("click",(e)=>{const tr=e.target.closest("tr.row"); if(!tr) return; const id=tr.dataset.id; if(id) location.href=`./chart.html?id=${encodeURIComponent(id)}`;});

  $$('.ls-ctl button').forEach(btn=>btn.addEventListener('click', async e=>{
    const p=e.currentTarget.dataset.period; state.lsPeriod=p;
    try{const d=await fetchBinanceLS(p); renderLongShort(p,d);}catch{}
  }));

  $("#search")?.addEventListener("input", ()=>{state.page=1; applySortFilter();});
  $("#sortkey")?.addEventListener("change", e=>{state.sortKey=e.target.value; applySortFilter();});
  $("#sortdir")?.addEventListener("click", e=>{state.sortDir=state.sortDir===-1?1:-1; e.currentTarget.textContent=state.sortDir===-1?"▼":"▲"; applySortFilter();});
  $("#page")?.addEventListener("change", e=>{state.page=Number(e.target.value)||1; renderTableSlice(state.filtered);});

  wireHeaderSort();

  // STAR 컨트롤
  const r=$("#starRange"); const setStarCSS=v=>document.documentElement.style.setProperty("--star", String(v/100));
  if(r){const saved=Number(localStorage.getItem("two4_star")||0); r.value=String(clamp(saved,0,100)); setStarCSS(Number(r.value)); StarField.setIntensity(Number(r.value)/100);
    r.addEventListener("input",e=>{const v=clamp(Number(e.target.value||0),0,100); setStarCSS(v); StarField.setIntensity(v/100); localStorage.setItem("two4_star",String(v));});}

  // Topbar 높이 적용
  applyTopbarHeight();
  window.addEventListener('resize', applyTopbarHeight, {passive:true});
}

async function initData(){
  try{
    const [markets, global, fng, ls, btcChart, usdtChart]=await Promise.all([
      fetchMarkets(), fetchGlobal(), fetchFNG(), fetchBinanceLS(state.lsPeriod),
      fetchMarketChart('bitcoin',7), fetchMarketChart('tether',7)
    ]);
    state.all=markets;
    renderKPIs(markets,global);
    renderRightLists(markets);
    applySortFilter();
    renderFNGCard(fng);
    renderLongShort(state.lsPeriod,ls);
    renderMiniCaps(btcChart,usdtChart);
  }catch(e){console.error(e); setHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);}
}

document.addEventListener("DOMContentLoaded", ()=>{
  StarField.init();
  initOnce();
  initData();

  let vis=document.visibilityState==="visible";
  document.addEventListener("visibilitychange",()=>{vis=document.visibilityState==="visible";});

  setInterval(async ()=>{ if(!vis) return; try{
    const [markets,global]=await Promise.all([fetchMarkets(),fetchGlobal()]);
    state.all=markets; renderKPIs(markets,global); renderRightLists(markets); applySortFilter();
  }catch{} }, 60000);

  setInterval(async ()=>{ if(!vis) return; try{renderFNGCard(await fetchFNG());}catch{} }, 60*60*1000);
});

// debug
window._cosmos={state,initData};
