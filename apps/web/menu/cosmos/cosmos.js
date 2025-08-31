/* =========================
   COSMOS CORE (safe build)
   ========================= */

/* ---- 전역 DOM ---- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---- 유틸 ---- */
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
function fmtMoney(n){
  if(n==null || isNaN(n)) return "-";
  const a = Math.abs(n);
  if(a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
}
function fmtPrice(n){
  return n==null || isNaN(n) ? '-' : '$' + Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
}
function fmtPctHTML(v){
  if(v==null || isNaN(v)) return '<span class="pct">-</span>';
  const cls = v>=0?'up':'down';
  const sign = v>=0?'+':'';
  return `<span class="pct ${cls}">${sign}${v.toFixed(2)}%</span>`;
}

/* ---- 상태 ---- */
const state = {
  all: [],
  filtered: [],
  sortKey: "market_cap",
  sortDir: -1,
  page: 1,
  perPage: 50,
};

/* ---- 별 컨트롤러 ---- */
(function starCtl(){
  const r = $("#starRange");
  if(!r) return;
  const saved = Number(localStorage.getItem("cosmos_star") || r.value || 75);
  r.value = String(saved);
  const apply = v => {
    const n = clamp(v/100,0,1);
    document.documentElement.style.setProperty("--starVis", String(n));
    localStorage.setItem("cosmos_star", String(v));
  };
  r.addEventListener("input", e=>apply(Number(e.target.value||0)));
  apply(saved);
})();

/* ---- Fetch with fallback ---- */
async function fetchWithFallback(directUrl, proxyUrl){
  try{
    const r = await fetch(directUrl, {cache:"no-store"});
    if(!r.ok) throw 0;
    return await r.json();
  }catch{
    if(!proxyUrl) throw new Error("direct failed");
    const r2 = await fetch(proxyUrl, {cache:"no-store"});
    if(!r2.ok) throw new Error("proxy failed");
    return await r2.json();
  }
}

/* ---- 데이터 ---- */
async function fetchMarkets({perPage=200,page=1}={}) {
  const q = `vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`;
  try { return await fetchWithFallback(direct, proxy); }
  catch(e){ console.warn("markets fail:", e.message); return []; }
}
async function fetchGlobal(){
  try { return await fetchWithFallback(`https://api.coingecko.com/api/v3/global`, `/api/global`); }
  catch{ return null; }
}
async function fetchFNG(){
  try { return await fetchWithFallback(`https://api.alternative.me/fng/?limit=1&format=json`, `/api/fng?limit=1`); }
  catch{ return null; }
}

/* ---- HUB(도넛) ---- */
function buildHub(sections){
  const svg = $("#hubSvg");
  svg.innerHTML = "";
  const cx=500, cy=500, rI=260, rO=470;
  const TAU = Math.PI*2, seg = TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const pathStr = (r0,r1,b0,b1)=>{
      const [x0,y0]=p(r1,b0), [x1,y1]=p(r1,b1), [x2,y2]=p(r0,b1), [x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0;
      return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
    };
    // sector
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d', pathStr(rI,rO,a0,a1));
    path.setAttribute('fill', i%2? "#334155" : "#1f2a44");
    path.setAttribute('opacity', ".92");
    path.classList.add("seg");
    svg.appendChild(path);

    // label (2배, glow 없음)
    const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-28)*Math.cos(mid), ty=cy+(rx-28)*Math.sin(mid)+6;
    const text=document.createElementNS(svg.namespaceURI,'text');
    text.setAttribute("x", tx); text.setAttribute("y", ty);
    text.setAttribute("text-anchor","middle");
    text.classList.add("seg-label");
    text.textContent = s.badge;
    svg.appendChild(text);

    const activate = ()=>{
      svg.querySelectorAll(".seg").forEach(el=>el.classList.remove("active"));
      path.classList.add("active");
      $("#cBig").textContent = s.centerTop;     // 흰색 한 줄
      $("#cSub").textContent = s.centerSub;     // 그레이 한 줄
      $("#pTitle").textContent = s.title;
      $("#pBody").innerHTML = s.html;
    };
    path.addEventListener("click", activate);
    text.addEventListener("click", activate);
  });
}

/* Fear & Greed gauge (게이지 이미지 포함) */
function gaugeHTML(val){
  const v = clamp(Number(val)||0,0,100);
  const deg = -90 + (v/100)*180; // -90~+90
  return `
  <svg viewBox="0 0 300 160" class="gauge" aria-label="Fear & Greed gauge">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <path d="M30,140 A120,120 0 0 1 270,140" class="g-arc" stroke="url(#g1)"/>
    <g transform="translate(150,140)">
      <line x1="0" y1="0" x2="0" y2="-90" stroke="#000" stroke-opacity=".2" stroke-width="10" />
      <g transform="rotate(${deg})"><line x1="0" y1="0" x2="0" y2="-90" class="needle" /></g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>`;
}

/* HUB 데이터 */
async function initHub(){
  try{
    const [mkts, global, fng] = await Promise.all([
      fetchMarkets({perPage:100,page:1}),
      fetchGlobal(),
      fetchFNG()
    ]);
    const topBy = (arr, key, n=10)=>arr.slice().sort((a,b)=>(b[key]??0)-(a[key]??0)).slice(0,n);
    const listHTML = (items,kind)=>`
      <div class="list">
        ${items.map((c,i)=>{
          const tk=(c.symbol||"").toUpperCase();
          const px=fmtMoney(c.current_price);
          const p24 = c.price_change_percentage_24h;
          const val = kind==='vol' ? fmtMoney(c.total_volume) : (p24!=null ? ( (p24>=0?'+':'')+p24.toFixed(2)+'%' ) : '-' );
          const cls = kind==='vol' ? '' : (p24>=0?'up':'down');
          return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${val}</div></div>`;
        }).join("")}
      </div>`;

    const btc = mkts.find(x=>x.id==="bitcoin");
    const usdt= mkts.find(x=>x.id==="tether");
    const dom = global?.data?.market_cap_percentage?.btc ?? null;
    const fngVal = Number((fng?.data?.[0]?.value) ?? NaN);
    const secs = [
      { badge:"VOL",   title:"Volume TOP10",        centerTop:"Volume Top10",     centerSub:"거래량",    html: listHTML(topBy(mkts,"total_volume"),"vol") },
      { badge:"+24H",  title:"24H % TOP10 [USDT]",  centerTop:"+24H Gainers",     centerSub:"상승률",    html: listHTML(topBy(mkts,"price_change_percentage_24h"),"pct") },
      { badge:"F&G",   title:"Fear & Greed",        centerTop: isFinite(fngVal)? String(fngVal) : "—", centerSub:"index", html: (isFinite(fngVal)? gaugeHTML(fngVal) : "—") },
      { badge:"BTC",   title:"BTC Market Cap",      centerTop: btc?fmtMoney(btc.market_cap):"—", centerSub:"Market Cap", html:`<div>BTC Market Cap</div><div style="margin-top:6px">${btc?fmtMoney(btc.market_cap):"—"}</div>` },
      { badge:"USDT",  title:"USDT Market Cap",     centerTop: usdt?fmtMoney(usdt.market_cap):"—", centerSub:"Market Cap", html:`<div>USDT Market Cap</div><div style="margin-top:6px">${usdt?fmtMoney(usdt.market_cap):"—"}</div>` },
      { badge:"DOM",   title:"BTC Dominance",       centerTop: dom!=null? dom.toFixed(2)+"%":"—", centerSub:"dominance", html:`<div>BTC Dominance</div><div style="margin-top:6px">${dom!=null? dom.toFixed(2)+"%":"—"}</div>` },
    ];
    buildHub(secs);
    $("#cBig").textContent="COSMOS"; $("#cSub").textContent="—";
  }catch(e){
    console.error("initHub error:", e);
    buildHub([{badge:"—", title:"—", centerTop:"—", centerSub:"—", html:"데이터를 불러오지 못했습니다."}]);
  }
}

/* ---- Market Table ---- */
function sparklineSVG(arr,w=120,h=28){
  if(!arr || arr.length<2) return "";
  const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
  const pts = arr.map((p,i)=>{
    const x=(i/(arr.length-1))*w;
    const y=h-((p-min)/span)*h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = arr[arr.length-1] >= arr[0];
  const color = up ? "#22c55e" : "#ef4444";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`;
}

function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
  const s7  = (c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  const sym = (c.symbol||'').toUpperCase();

  return `<tr class="mrow" data-id="${c.id}">
    <td class="sticky-rank num">${c.market_cap_rank ?? (i+1)}</td>
    <td class="sticky-name">
      <a class="no-link" href="/menu/cosmos/chart.html?id=${encodeURIComponent(c.id)}" title="${sym}">
        <div class="mkt-name">
          <img src="${c.image}" alt="${sym}">
          <span class="sym">${sym}</span>
          <span class="full">${c.name ?? ''}</span>
        </div>
      </a>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPctHTML(p1h)}</td>
    <td class="num">${fmtPctHTML(p24)}</td>
    <td class="num hide-m">${fmtPctHTML(p7d)}</td>
    <td class="num hide-m">${fmtMoney(c.market_cap)}</td>
    <td class="num hide-m">${fmtMoney(c.total_volume)}</td>
    <td class="spark">${s7 ? sparklineSVG(s7) : ""}</td>
  </tr>`;
}

/* 정렬/필터/페이징 */
function applyFilterSort(){
  const q = ($("#q").value||"").toLowerCase();
  let arr = state.all.filter(c=>{
    return !q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q);
  });

  const k=state.sortKey, dir=state.sortDir;
  const get = c => ({
    rank: c.market_cap_rank ?? 1e9,
    name: (c.name||"").toLowerCase(),
    price: c.current_price ?? -1,
    change1h: c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? 0,
    change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    change7d: c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0,
    market_cap: c.market_cap ?? -1,
    volume: c.total_volume ?? -1
  }[k]);
  arr.sort((a,b)=>{
    const va=get(a), vb=get(b);
    if(typeof va==="string" && typeof vb==="string") return dir * va.localeCompare(vb);
    return dir * ((va??-1) - (vb??-1));
  });

  state.filtered = arr;
  if( (state.page-1)*state.perPage >= arr.length ) state.page=1;
  renderTable(); renderPager();
}

function renderTable(){
  const tbody = $("#mktBody");
  if(!tbody) return;
  const start = (state.page-1)*state.perPage;
  const items = state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');

  // 행 전체 클릭 → 차트 이동
  $$("#mkt tbody tr.mrow").forEach(tr=>{
    tr.style.cursor="pointer";
    tr.onclick = ()=>{
      const id = tr.dataset.id;
      if(id) location.href = `/menu/cosmos/chart.html?id=${encodeURIComponent(id)}`;
    };
  });
}

function renderPager(){
  const el = $("#pager"); if(!el) return;
  const total = Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur = state.page;
  const btn = (i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html = "";
  for(let i=1;i<=total;i++){
    if(i<=8 || i>total-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur); }
    else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; }
  }
  el.innerHTML = html;
  el.querySelectorAll("button[data-pg]").forEach(b=>{
    b.onclick = ()=>{ state.page = Number(b.dataset.pg)||1; renderTable(); renderPager(); };
  });
}

/* 헤더 정렬 */
function wireSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.addEventListener("click", ()=>{
      const k = th.dataset.key;
      if(!k) return;
      if(state.sortKey===k) state.sortDir *= -1; else { state.sortKey=k; state.sortDir=-1; }
      applyFilterSort();
    });
  });
}

/* ---- 초기화 ---- */
async function init(){
  wireSort();
  $("#q")?.addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

  // 데이터 로드 (부하 완화: perPage 100)
  try{
    const mkts = await fetchMarkets({perPage:100,page:1});
    state.all = Array.isArray(mkts)? mkts : [];
  }catch{ state.all = []; }
  applyFilterSort();

  initHub();

  // 60초마다 갱신
  setInterval(async ()=>{
    try{
      const mkts2 = await fetchMarkets({perPage:100,page:1});
      if(Array.isArray(mkts2) && mkts2.length){ state.all = mkts2; applyFilterSort(); }
      initHub();
    }catch{}
  }, 60000);
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
