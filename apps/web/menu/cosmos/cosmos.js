/* =========================
   COSMOS CORE (safe build)
   ========================= */

/* ---- 전역 DOM ---- */
var table=null, tbody=null, pager=null;

/* ---- 유틸 ---- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
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
function fmtPct(n){
  if(n==null || isNaN(n)) return '-';
  const s=n>=0?'up':'down';
  return `<span class="pct ${s}">${(n>=0?'+':'')+n.toFixed(2)}%</span>`;
}
function fmtCap(n){
  if(n==null || isNaN(n)) return '-';
  const a=Math.abs(n);
  if(a>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
  if(a>=1e9)  return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6)  return '$'+(n/1e6).toFixed(2)+'M';
  return '$'+Number(n).toLocaleString('en-US');
}

/* ---- 상태 ---- */
const state = { all:[], filtered:[], sortKey:"market_cap", sortDir:-1, page:1, perPage:50 };

/* ---- 별 컨트롤 ---- */
(function starCtl(){
  const r = $("#starRange");
  if(!r) return;
  const apply = v => document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  r.addEventListener("input", e=>apply(e.target.value));
  apply(r.value);
})();

/* ---- 데이터 페치 ---- */
async function fetchMarkets(){
  try{
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=1h,24h,7d&per_page=250&page=1";
    const rs = await fetch(url);
    if(!rs.ok) throw new Error("coingecko blocked");
    return await rs.json();
  }catch(e){ console.warn("fetchMarkets fail:", e.message); return []; }
}
async function fetchGlobal(){
  try{
    const rs = await fetch("https://api.coingecko.com/api/v3/global");
    if(!rs.ok) throw new Error("global blocked");
    return await rs.json();
  }catch(e){ return null; }
}
async function fetchFNG(){
  try{
    const rs = await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    if(!rs.ok) throw new Error("fng blocked");
    return await rs.json();
  }catch(e){ return null; }
}

/* ---- 도넛(HUB) ---- */
function buildHub(sections){
  const svg = $("#hubSvg");
  svg.innerHTML = "";
  const cx=500, cy=500, rI=260, rO=470;
  const TAU = Math.PI*2, seg = TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const arcPath = (r0,r1,b0,b1)=>{
      const [x0,y0]=p(r1,b0), [x1,y1]=p(r1,b1), [x2,y2]=p(r0,b1), [x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0;
      return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
    };
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d', arcPath(rI,rO,a0,a1));
    path.setAttribute('fill', i%2? "#334155" : "#1f2a44");
    path.setAttribute('opacity', ".92");
    path.classList.add("seg");
    svg.appendChild(path);

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
      $("#cBig").textContent = s.centerTop;
      $("#cSub").textContent = s.centerSub;
      $("#pTitle").textContent = s.title;
      $("#pBody").innerHTML = s.html;
    };
    path.addEventListener("click", activate);
    text.addEventListener("click", activate);
  });
}

/* Fear&Greed gauge (색/라벨) */
function gaugeHTML(val){
  const v = clamp(val,0,100);
  const deg = -90 + (v/100)*180;
  let label="Neutral", color="#eab308";
  if(v<25){ label="Extreme Fear"; color="#ef4444"; }
  else if(v<45){ label="Fear"; color="#f97316"; }
  else if(v<=55){ label="Neutral"; color="#eab308"; }
  else if(v<=75){ label="Greed"; color="#22c55e"; }
  else { label="Extreme Greed"; color="#16a34a"; }
  return `
  <div style="display:flex;align-items:center;gap:10px;margin:0 0 6px 2px">
    <span style="font-weight:800;color:${color}">${v}</span>
    <span style="opacity:.85">${label}</span>
  </div>
  <svg viewBox="0 0 300 160" class="gauge" aria-label="Fear & Greed gauge">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="50%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <path d="M30,140 A120,120 0 0 1 270,140" class="g-arc" stroke="url(#g1)"/>
    <g transform="translate(150,140)">
      <line x1="0" y1="0" x2="0" y2="-90" stroke="#000" stroke-opacity=".25" stroke-width="10" />
      <g transform="rotate(${deg})">
        <line x1="0" y1="0" x2="0" y2="-90" class="needle" />
      </g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>`;
}

/* 패널용 7일 마켓캡 스파크 */
async function fetchMarketCap7d(coinId){
  try{
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`;
    const r = await fetch(url);
    if(!r.ok) throw new Error("cap blocked");
    const j = await r.json();
    return (j.market_caps||[]).map(p=>p[1]);
  }catch(e){ return null; }
}
function drawPanelSpark(canvasId, arr){
  const cvs = document.getElementById(canvasId);
  if(!cvs || !Array.isArray(arr) || arr.length<2) return;
  const ctx = cvs.getContext("2d");
  const W = cvs.width, H = cvs.height;
  ctx.clearRect(0,0,W,H);
  const min = Math.min(...arr), max = Math.max(...arr), span=max-min||1;
  const xStep = W/(arr.length-1);
  ctx.lineWidth = 2;
  const up = arr[arr.length-1] >= arr[0];
  ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
  ctx.beginPath();
  arr.forEach((v,i)=>{
    const x = i*xStep;
    const y = H - ( (v-min)/span )*H;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}
async function paintPanelSparks(){
  const [btcCap, usdtCap] = await Promise.all([
    fetchMarketCap7d("bitcoin"),
    fetchMarketCap7d("tether"),
  ]);
  if(btcCap)  drawPanelSpark("spark-btc-cap",  btcCap);
  if(usdtCap) drawPanelSpark("spark-usdt-cap", usdtCap);
}

/* HUB 데이터 */
async function initHub(){
  const [mkts, global, fng] = await Promise.all([fetchMarkets(), fetchGlobal(), fetchFNG()]);
  const listTop = (arr, by, n=10)=>arr.slice().sort((a,b)=> (b[by]??0) - (a[by]??0)).slice(0,n);
  const toList = (items,kind)=>`
    <div class="list">
      ${items.map((c,i)=>{
        const tk=(c.symbol||"").toUpperCase();
        const px=fmtMoney(c.current_price);
        const pc=kind==='vol' ? fmtMoney(c.total_volume) : (c.price_change_percentage_24h!=null?(c.price_change_percentage_24h.toFixed(2)+"%"):"-");
        const cls=kind==='vol'?'':((c.price_change_percentage_24h||0)>=0?'up':'down');
        return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${pc}</div></div>`;
      }).join("")}
    </div>`;

  const btc  = mkts.find(x=>x.id==="bitcoin");
  const usdt = mkts.find(x=>x.id==="tether");
  const dom  = global?.data?.market_cap_percentage?.btc ?? null;
  const fngVal = Number((fng?.data?.[0]?.value) ?? NaN);

  const secs = [
    { badge:"VOL", title:"Volume TOP10", centerTop:"Volume Top10", centerSub:"거래량",
      html: toList(listTop(mkts,"total_volume"),"vol") },

    { badge:"+24H", title:"24H % TOP10 [USDT]", centerTop:"+24H Gainers", centerSub:"상승률",
      html: toList(listTop(mkts,"price_change_percentage_24h"),"pct") },

    { badge:"F&G", title:"Fear & Greed", centerTop: isFinite(fngVal)? String(fngVal) : "—", centerSub:"index",
      html:`<div style="margin-bottom:8px">Fear & Greed Index</div>${isFinite(fngVal)?gaugeHTML(fngVal):"—"}` },

    { badge:"BTC", title:"비트코인 시가총액", centerTop: btc?fmtMoney(btc.market_cap):"—", centerSub:"시가총액",
      html:`<div>비트코인 시가총액</div>
            <canvas id="spark-btc-cap" width="280" height="42" style="margin-top:8px;display:block"></canvas>` },

    { badge:"USDT", title:"테더 시가총액", centerTop: usdt?fmtMoney(usdt.market_cap):"—", centerSub:"시가총액",
      html:`<div>테더 시가총액</div>
            <canvas id="spark-usdt-cap" width="280" height="42" style="margin-top:8px;display:block"></canvas>` },

    { badge:"DOM", title:"비트코인 도미넌스", centerTop: dom!=null? dom.toFixed(2)+"%":"—", centerSub:"도미넌스",
      html:`<div>비트코인 도미넌스</div>
            <div style="margin-top:6px">${dom!=null? dom.toFixed(2)+"%":"—"}</div>` },
  ];
  buildHub(secs);
  paintPanelSparks();
  $("#cBig").textContent="COSMOS"; $("#cSub").textContent="—";
}

/* ---- Table ---- */
function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
  const sym = (c.symbol||'').toUpperCase();
  const link = `./chart.html?symbol=${encodeURIComponent(sym)}`;
  return `<tr>
    <td class="sticky-rank num">${c.market_cap_rank ?? (i+1)}</td>
    <td class="sticky-name">
      <a class="mkt-name" href="${link}" style="text-decoration:none">
        <img src="${c.image}" alt="${sym}">
        <span class="sym">${sym}</span>
        <span class="full">${c.name ?? ''}</span>
      </a>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPct(p1h)}</td>
    <td class="num">${fmtPct(p24)}</td>
    <td class="num hide-m">${fmtPct(p7d)}</td>
    <td class="num hide-m">${fmtCap(c.market_cap)}</td>
    <td class="num hide-m">${fmtCap(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-id="${c.id}"></canvas></td>
  </tr>`;
}

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

function drawSparkForEachCanvas(){
  $$("#mkt tbody canvas[data-id]").forEach(cv=>{
    const id = cv.dataset.id;
    const coin = state.filtered.find(c=>c.id===id);
    if(!coin || !coin.sparkline_in_7d || !coin.sparkline_in_7d.price) return;
    const arr = coin.sparkline_in_7d.price;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0,0,W,H);
    const min = Math.min(...arr), max = Math.max(...arr), span=max-min||1;
    const xStep = W/(arr.length-1);
    ctx.lineWidth = 1.5;
    const up = arr[arr.length-1] >= arr[0];
    ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    arr.forEach((v,i)=>{
      const x = i*xStep;
      const y = H - ( (v-min)/span )*H;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  });
}

function renderTable(){
  if(!tbody) return;
  const start = (state.page-1)*state.perPage;
  const items = state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');
  drawSparkForEachCanvas();
}

function renderPager(){
  if(!pager) return;
  const n = Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur = state.page;
  const btn = (i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html = "";
  for(let i=1;i<=n;i++){
    if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur);}
    else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; }
  }
  pager.innerHTML = html;
  pager.querySelectorAll("button[data-pg]").forEach(b=>{
    b.addEventListener("click", ()=>{ state.page = Number(b.dataset.pg)||1; renderTable(); renderPager(); });
  });
}

/* ---- 헤더 정렬 ---- */
function wireSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.style.cursor="pointer";
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
  table = $("#mkt"); tbody = $("#mktBody"); pager = $("#pager");
  wireSort();
  $("#q").addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

  const mkts = await fetchMarkets();
  state.all = Array.isArray(mkts)? mkts : [];
  applyFilterSort();

  initHub();

  // 30초마다 갱신
  setInterval(async ()=>{
    const mkts2 = await fetchMarkets();
    if(Array.isArray(mkts2) && mkts2.length) { state.all = mkts2; applyFilterSort(); }
    initHub();
  }, 30000);
}

/* DOM ready */
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
