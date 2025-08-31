/* ---------- Locale clamps (안전한 소수자릿수) ---------- */
(()=>{const o=Number.prototype.toLocaleString;
Number.prototype.toLocaleString=function(l,e){if(e&&typeof e=="object"){let{minimumFractionDigits:n,maximumFractionDigits:a}=e;Number.isFinite(n)||(n=void 0);Number.isFinite(a)||(a=void 0);n!=null&&(n=Math.min(20,Math.max(0,n)));a!=null&&(a=Math.min(20,Math.max(0,a)));if(n!=null&&a!=null&&a<n)a=n;e={...e,...(n!=null?{minimumFractionDigits:n}:{}),...(a!=null?{maximumFractionDigits:a}:{})}}return o.call(this,l||"en-US",e)}})();

/* ---------- Utils ---------- */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const $=(s,sc=document)=>sc.querySelector(s);
const $$=(s,sc=document)=>Array.from(sc.querySelectorAll(s));
const safeLocale=(num,minFD=0,maxFD=2)=>{let m=clamp(minFD,0,20),x=clamp(maxFD,0,20);if(x<m)x=m;try{return Number(num??0).toLocaleString('en-US',{minimumFractionDigits:m,maximumFractionDigits:x})}catch{return String(Number(num??0).toFixed(x))}};
const fmtPrice=v=>v==null||Number.isNaN(v)?"-":"$"+safeLocale(v,0,clamp(v>=100?2:v>=1?4:v>0?Math.ceil(Math.abs(Math.log10(v)))+2:2,0,8));
const fmtNumSuffix=v=>{if(v==null||Number.isNaN(v))return "-";const n=Number(v),a=Math.abs(n);if(a>=1e12)return"$"+(n/1e12).toFixed(2)+"T";if(a>=1e9)return"$"+(n/1e9).toFixed(2)+"B";if(a>=1e6)return"$"+(n/1e6).toFixed(2)+"M";if(a>=1e3)return"$"+(n/1e3).toFixed(2)+"K";return"$"+safeLocale(n,0,2)};
const pctClass=n=>n>0?"up":n<0?"down":"";
const fmtPct=n=> (n==null||Number.isNaN(n))?"-":`${n>0?"+":""}${Number(n).toFixed(2)}%`;

/* ---------- Data fetchers (직접요청 → 프록시 폴백) ---------- */
async function fetchJSON(dirUrl, proxyUrl){
  try{const r=await fetch(dirUrl); if(!r.ok) throw 0; return await r.json();}
  catch{const r2=await fetch(proxyUrl); if(!r2.ok) throw new Error("proxy fail"); return await r2.json();}
}
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){
  const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  return fetchJSON(`https://api.coingecko.com/api/v3/coins/markets?${q}`, `/api/coins/markets?${q}`);
}
async function fetchGlobal(){
  return fetchJSON(`https://api.coingecko.com/api/v3/global`, `/api/global`);
}
async function fetchFNG(){
  return fetchJSON(`https://api.alternative.me/fng/?limit=1`, `/api/fng?limit=1`);
}
async function fetchBinanceLS(period='1h'){
  const sym='BTCUSDT', q=`symbol=${sym}&period=${period}&limit=1`;
  return fetchJSON(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${q}`, `/api/binance/globalLongShortAccountRatio?${q}`);
}

/* ---------- State ---------- */
const state={
  all:[], filtered:[],
  page:1, perPage:50,
  sortKey:"market_cap", sortDir:-1,   // desc
  filterQ:""
};

/* ---------- Small SVG builders ---------- */
function sparklineSVG(arr,w=100,h=24){
  if(!arr||arr.length<2) return "";
  const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
  const pts=arr.map((p,i)=>`${(i/(arr.length-1)*w).toFixed(1)},${(h-((p-min)/span)*h).toFixed(1)}`).join(" ");
  const up=arr.at(-1)>=arr[0];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${up?"#22c55e":"#ef4444"}" stroke-width="2" points="${pts}"/></svg>`;
}
function gaugeSVG(value){ // 0~100
  const v=clamp(Number(value)||0,0,100)/100, cx=140, cy=140, r=110, start=Math.PI, end=0, ang=start+(end-start)*v;
  const arc=(a)=>`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;
  const nx=cx+(r-14)*Math.cos(ang), ny=cy+(r-14)*Math.sin(ang);
  return `<svg width="280" height="160" viewBox="0 0 280 160">
    <defs>
      <linearGradient id="seg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient>
      <linearGradient id="seg2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/></linearGradient>
    </defs>
    <path d="M ${arc(start)} A ${r} ${r} 0 0 1 ${arc(Math.PI/2)}" stroke="url(#seg1)" stroke-width="14" fill="none" opacity=".9" stroke-linecap="round"/>
    <path d="M ${arc(Math.PI/2)} A ${r} ${r} 0 0 1 ${arc(end)}" stroke="url(#seg2)" stroke-width="14" fill="none" opacity=".9" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#fff" opacity=".9"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}

/* ---------- Hub (donut) ---------- */
function arcPath(cx,cy,r0,r1,a0,a1){
  const p=(r,a)=>[cx+r*Math.cos(a), cy+r*Math.sin(a)];
  const [x0,y0]=p(r1,a0), [x1,y1]=p(r1,a1), [x2,y2]=p(r0,a1), [x3,y3]=p(r0,a0);
  const laf=(a1-a0)>Math.PI?1:0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
}
function setCenter(main,sub){ $('#hubMain').textContent=main; $('#hubSub').textContent=sub; }
function openPanel(title,html){ const p=$("#hubPanel"); $("#hubTitle").textContent=title; $("#hubContent").innerHTML=html; p.classList.add('show'); }

/* ---------- Table rendering ---------- */
function buildRowHTML(c){
  const s7=(c.sparkline_in_7d&&c.sparkline_in_7d.price)||null;
  const sym=(c.symbol||"").toUpperCase();
  return `<tr class="row" data-id="${c.id}">
    <td class="text-right">${c.market_cap_rank ?? "-"}</td>
    <td><div class="coin-cell"><img src="${c.image}" alt="${sym}"><span class="sym">${sym}</span><span class="nm" style="opacity:.8;margin-left:6px">${c.name??""}</span></div></td>
    <td class="text-right">${fmtPrice(c.current_price)}</td>
    <td class="text-right ${pctClass(c.price_change_percentage_1h_in_currency)}">${fmtPct(c.price_change_percentage_1h_in_currency)}</td>
    <td class="text-right ${pctClass(c.price_change_percentage_24h_in_currency)}">${fmtPct(c.price_change_percentage_24h_in_currency)}</td>
    <td class="text-right ${pctClass(c.price_change_percentage_7d_in_currency)}">${fmtPct(c.price_change_percentage_7d_in_currency)}</td>
    <td class="text-right">${fmtNumSuffix(c.market_cap)}</td>
    <td class="text-right">${fmtNumSuffix(c.total_volume)}</td>
    <td class="text-right">${s7?sparklineSVG(s7):""}</td>
  </tr>`;
}
function renderTableSlice(rows){
  const tbody=$("#mkt-body"); if(!tbody) return;
  const s=(state.page-1)*state.perPage, e=s+state.perPage;
  const slice=rows.slice(s,e);
  tbody.innerHTML = slice.map(buildRowHTML).join("") || `<tr><td colspan="9" style="text-align:center;padding:24px;opacity:.8">No data</td></tr>`;
}
function pageRange(total,current,max=(innerWidth<=767?5:9)){
  const half=Math.floor(max/2); let start=Math.max(1,current-half), end=start+max-1;
  if(end>total){ end=total; start=Math.max(1,end-max+1); }
  return {start,end};
}
function renderPager(total){
  const el=$("#pager"); if(!el) return;
  const cur=state.page, {start,end}=pageRange(total,cur);
  const btn=(label,pg,cls="")=>`<button data-p="${pg}" class="${cls}">${label}</button>`;
  let html=""; html+=btn("«",1); html+=btn("‹",Math.max(1,cur-1));
  if(start>1) html+=`<span>…</span>`;
  for(let p=start;p<=end;p++) html+=btn(p,p, p===cur?"on":"");
  if(end<total) html+=`<span>…</span>`;
  html+=btn("›",Math.min(total,cur+1)); html+=btn("»",total);
  el.innerHTML=html;
  el.querySelectorAll("button[data-p]").forEach(b=>b.onclick=()=>{const p=Number(b.dataset.p)||1; if(p!==state.page){state.page=p; renderTableSlice(state.filtered); renderPager(total);}});
}

/* ---------- Filter + Sort ---------- */
function applyFilterSort(){
  const q=state.filterQ.toLowerCase();
  let arr = state.all.filter(c => !q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
  const dir=state.sortDir, key=state.sortKey;
  const get=c=>{
    switch(key){
      case "rank": return c.market_cap_rank ?? 1e9;
      case "symbol": return (c.symbol||"").toUpperCase();
      case "price": return c.current_price ?? -1;
      case "change1h": return c.price_change_percentage_1h_in_currency ?? -1;
      case "change24h": return c.price_change_percentage_24h_in_currency ?? -1;
      case "change7d": return c.price_change_percentage_7d_in_currency ?? -1;
      case "volume": return c.total_volume ?? -1;
      case "market_cap": default: return c.market_cap ?? -1;
    }
  };
  arr.sort((a,b)=>{const va=get(a), vb=get(b); const r=(typeof va==="string"&&typeof vb==="string") ? va.localeCompare(vb) : (va>vb?1:va<vb?-1:0); return r*dir;});
  state.filtered=arr;

  // 헤더 정렬 표시(▲/▼)
  $$(".mkt thead th[data-key]").forEach(th=>{
    const d=th.querySelector(".dir");
    if(!d) return;
    if(th.dataset.key===state.sortKey) d.textContent = state.sortDir===-1 ? "▼" : "▲";
    else d.textContent = "";
  });

  const totalPages=Math.max(1,Math.ceil(state.filtered.length/state.perPage));
  if(state.page>totalPages) state.page=totalPages;
  renderTableSlice(state.filtered); renderPager(totalPages);
}
function wireHeaderSort(){
  $$(".mkt thead th[data-key]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key=th.dataset.key;
      if(state.sortKey===key) state.sortDir = (state.sortDir===-1?1:-1);
      else { state.sortKey=key; state.sortDir=-1; }
      applyFilterSort();
    });
  });
}

/* ---------- INIT ---------- */
async function initHub(){
  const svg=$("#hubSvg");
  svg.innerHTML = svg.innerHTML; // defs 유지
  try{
    const [mkts, global, fng, ls1h] = await Promise.all([
      fetchMarkets(), fetchGlobal(), fetchFNG(), fetchBinanceLS('1h')
    ]);
    state.all = Array.isArray(mkts)? mkts : [];

    // 도넛 섹터 데이터 준비
    const gainers = state.all.filter(x=>Number.isFinite(x.price_change_percentage_24h)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,10);
    const byVol   = state.all.slice().sort((a,b)=>b.total_volume-a.total_volume).slice(0,10);
    const btc = state.all.find(x=>x.id==="bitcoin");
    const usdt= state.all.find(x=>x.id==="tether");
    const dom = global?.data?.market_cap_percentage?.btc ?? 0;
    const fngItem = Array.isArray(fng?.data)? fng.data[0] : null;
    const lsLast = Array.isArray(ls1h)? ls1h.at(-1) : null;
    let longPct=50, shortPct=50, ratio=1;
    if(lsLast){ const r=Number(lsLast.longShortRatio||0); if(r){ shortPct=100/(1+r); longPct=100-shortPct; ratio=r; } }

    const TAU=Math.PI*2, cx=500, cy=500, rO=470, rI=260, seg=TAU/7, start=-Math.PI/2;
    const sections=[
      {label:'Long/Short (1H)', badge:`${longPct.toFixed(0)}%`, main:`${longPct.toFixed(1)} / ${shortPct.toFixed(1)}%`, sub:'롱/숏 (1H)',
        html:`<div>BTCUSDT 포지션 비율</div>
          <div style="margin-top:8px;height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden">
            <div style="width:${longPct.toFixed(1)}%;height:100%;background:#22c55e"></div>
          </div>
          <div style="margin-top:6px;display:flex;justify-content:space-between"><div>Long ${longPct.toFixed(1)}%</div><div>Short ${shortPct.toFixed(1)}% · ratio ${ratio.toFixed(2)}</div></div>`},
      {label:'BTC Dominance', badge:`${dom.toFixed(0)}%`, main:`${dom.toFixed(2)}%`, sub:'도미넌스',
        html:`<div>BTC Dominance</div><div style="margin-top:6px">${dom.toFixed(2)}%</div>`},
      {label:'Fear & Greed', badge:fngItem?`${fngItem.value}`:'—', main:fngItem?`${fngItem.value}`:'—', sub:(fngItem?.value_classification||'FNG'),
        html:`<div>Fear & Greed Index</div><div style="margin-top:8px">${gaugeSVG(fngItem?Number(fngItem.value):50)}</div>`},
      {label:'BTC Market Cap', badge:btc?fmtNumSuffix(btc.market_cap):'—', main:btc?fmtNumSuffix(btc.market_cap):'—', sub:'Market Cap',
        html:`<div>BTC Market Cap</div><div style="margin-top:6px">${btc?fmtNumSuffix(btc.market_cap):'—'}</div>`},
      {label:'USDT Market Cap', badge:usdt?fmtNumSuffix(usdt.market_cap):'—', main:usdt?fmtNumSuffix(usdt.market_cap):'—', sub:'Market Cap',
        html:`<div>USDT Market Cap</div><div style="margin-top:6px">${usdt?fmtNumSuffix(usdt.market_cap):'—'}</div>`},
      {label:'24H % TOP10 [USDT]', badge:'TOP10', main:'+24H Gainers', sub:'상승률',
        html:`<div>24H % TOP10 [USDT]</div><div class="list">${
          gainers.map((c,i)=>`<div class="row-min"><div class="rk">${i+1}</div><div class="tk">${(c.symbol||'').toUpperCase()}</div><div class="px">${fmtPrice(c.current_price)}</div><div class="pc ${pctClass(c.price_change_percentage_24h)}">${fmtPct(c.price_change_percentage_24h)}</div></div>`).join("")
        }</div>`},
      {label:'Volume TOP10', badge:'VOL', main:'Volume Top10', sub:'거래량',
        html:`<div>거래량 TOP10</div><div class="list">${
          byVol.map((c,i)=>`<div class="row-min"><div class="rk">${i+1}</div><div class="tk">${(c.symbol||'').toUpperCase()}</div><div class="px">${fmtPrice(c.current_price)}</div><div class="pc">${fmtNumSuffix(c.total_volume)}</div></div>`).join("")
        }</div>`},
    ];

    // SVG 섹터 그림
    const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS(svg.namespaceURI,'defs'));
    sections.forEach((s,i)=>{
      const gid=`sg${i}`;
      const grad=document.createElementNS(svg.namespaceURI,'linearGradient');
      grad.id=gid; grad.setAttribute('x1','0');grad.setAttribute('y1','0');grad.setAttribute('x2','1');grad.setAttribute('y2','1');
      const st1=document.createElementNS(grad.namespaceURI,'stop');st1.setAttribute('offset','0%');st1.setAttribute('stop-color','#7c3aed');st1.setAttribute('stop-opacity','.56');
      const st2=document.createElementNS(grad.namespaceURI,'stop');st2.setAttribute('offset','100%');st2.setAttribute('stop-color','#06b6d4');st2.setAttribute('stop-opacity','.44');
      grad.appendChild(st1);grad.appendChild(st2); defs.appendChild(grad);

      const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
      const path=document.createElementNS(svg.namespaceURI,'path');
      path.setAttribute('d',arcPath(cx,cy,rI,rO,a0,a1));
      path.setAttribute('fill',`url(#${gid})`);
      path.setAttribute('class','hub-seg');
      svg.appendChild(path);

      const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-30)*Math.cos(mid), ty=cy+(rx-30)*Math.sin(mid)+6;
      const text=document.createElementNS(svg.namespaceURI,'text');
      text.setAttribute('x',tx); text.setAttribute('y',ty); text.setAttribute('text-anchor','middle');
      text.setAttribute('class','hub-badge');
      text.textContent = (s.label.includes('TOP10')? (s.label.includes('Volume')?'VOL':'TOP10') : (s.label.includes('Dominance')?`${dom.toFixed(0)}%`: s.label.includes('Long/Short')?`${longPct.toFixed(0)}%` : s.badge));
      svg.appendChild(text);

      const act=()=>{ $$(".hub-seg").forEach(el=>el.classList.remove('active')); path.classList.add('active'); setCenter(s.main, s.sub); openPanel(s.label, s.html); };
      path.addEventListener('mouseenter', ()=>setCenter(s.main, s.sub));
      path.addEventListener('click',act); text.addEventListener('click',act);
    });

    setCenter("—","COSMOS"); // 초기
  }catch(e){
    console.error(e);
    setCenter("—","COSMOS");
  }
}

function wireInteractions(){
  // 행 클릭 → chart.html
  $("#mkt-body")?.addEventListener("click",(e)=>{
    const tr=e.target.closest("tr.row"); if(!tr) return;
    const id=tr.dataset.id; if(id) location.href=`./chart.html?id=${encodeURIComponent(id)}`;
  });

  // 검색
  $("#search")?.addEventListener("input",(e)=>{ state.filterQ = e.target.value||""; state.page=1; applyFilterSort(); });

  // sticky top(모바일 겹침 방지) – 컨트롤러 높이 반영
  const stick=()=>{ document.documentElement.style.setProperty("--sticky-top", (8+28+8)+"px"); };
  stick(); window.addEventListener("resize",stick);
}

async function initData(){
  try{
    const [mkts] = await Promise.all([ fetchMarkets() ]);
    state.all = Array.isArray(mkts)? mkts : [];
    applyFilterSort();
  }catch(e){
    console.error(e);
    $("#mkt-body").innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px">데이터 로딩 실패</td></tr>`;
  }
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  wireHeaderSort();
  wireInteractions();
  initData();
  initHub();

  // 주기적 갱신
  let vis=document.visibilityState==="visible";
  document.addEventListener("visibilitychange",()=>{vis=document.visibilityState==="visible";});
  setInterval(async ()=>{
    if(!vis) return;
    try{ const mkts=await fetchMarkets(); state.all=Array.isArray(mkts)?mkts:state.all; applyFilterSort(); }catch{}
  }, 30000);
});

/* debug */
window._cosmos={state,applyFilterSort};
