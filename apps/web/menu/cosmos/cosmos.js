/* =========================
   COSMOS CORE (safe build)
   ========================= */

/* ---- 전역 DOM ---- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

/* 숫자 포맷 */
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
function fmtPctVal(n){
  if(n==null || isNaN(n)) return '-';
  const s=n>=0?'up':'down';
  return `<span class="pct ${s}">${(n>=0?'+':'')+n.toFixed(2)}%</span>`;
}
function fmtPctRaw(n){
  if(n==null || isNaN(n)) return '-';
  const s=n>=0?'+':'';
  return s + n.toFixed(2) + '%';
}

/* 상태 */
const state = {
  all: [],
  filtered: [],
  sortKey: "market_cap",
  sortDir: -1,
  page: 1,
  perPage: 50,
};

/* ⭐ 별 컨트롤러 */
(function starCtl(){
  const r = $("#starRange");
  if(!r) return;
  const apply = v => document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  r.addEventListener("input", e=>{ apply(e.target.value); localStorage.setItem("starVis", e.target.value); });
  const saved = Number(localStorage.getItem("starVis"));
  if(Number.isFinite(saved)){ r.value = saved; }
  apply(r.value);
})();

/* 데이터 페치 */
async function fetchMarkets(){
  try{
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=1h,24h,7d&per_page=250&page=1";
    const rs = await fetch(url);
    if(!rs.ok) throw 0;
    return await rs.json();
  }catch(e){ console.warn("fetchMarkets fail", e); return []; }
}
async function fetchGlobal(){
  try{
    const rs = await fetch("https://api.coingecko.com/api/v3/global");
    if(!rs.ok) throw 0;
    return await rs.json();
  }catch{ return null; }
}
async function fetchFNG(){
  try{
    const rs = await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    if(!rs.ok) throw 0;
    return await rs.json();
  }catch{ return null; }
}
async function fetchMarketChart(id,days=7){
  try{
    const q=`vs_currency=usd&days=${days}`;
    const rs = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`);
    if(!rs.ok) throw 0;
    return await rs.json();
  }catch{ return null; }
}

/* 스파크 SVG(허브/표 공용) */
function sparkSVG(arr,w=180,h=44,stroke="#22c55e"){
  if(!Array.isArray(arr)||arr.length<2) return "";
  const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
  const pts=arr.map((p,i)=>{
    const x=(i/(arr.length-1))*w, y=h-((p-min)/span)*h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = arr[arr.length-1] >= arr[0];
  const color = up ? "#22c55e" : "#ef4444";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/>
  </svg>`;
}

/* Fear & Greed 게이지 */
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
      <line x1="0" y1="0" x2="0" y2="-90" stroke="#000" stroke-opacity=".2" stroke-width="10"/>
      <g transform="rotate(${deg})"><line x1="0" y1="0" x2="0" y2="-90" class="needle"/></g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>`;
}

/* ===== 허브(도넛) ===== */
function buildHub(sections){
  const svg = $("#hubSvg");
  svg.innerHTML = "";
  const cx=500, cy=500, rI=260, rO=470, TAU=Math.PI*2, seg=TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const arcPath=(r0,r1,b0,b1)=>{
      const [x0,y0]=p(r1,b0),[x1,y1]=p(r1,b1),[x2,y2]=p(r0,b1),[x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0;
      return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
    };
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d',arcPath(rI,rO,a0,a1));
    path.setAttribute('fill', i%2? "#334155" : "#1f2a44");
    path.setAttribute('opacity',".92");
    path.classList.add("seg");
    svg.appendChild(path);

    const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-28)*Math.cos(mid), ty=cy+(rx-28)*Math.sin(mid)+6;
    const text=document.createElementNS(svg.namespaceURI,'text');
    text.setAttribute("x",tx); text.setAttribute("y",ty);
    text.setAttribute("text-anchor","middle");
    text.classList.add("seg-label");
    text.textContent=s.badge;
    svg.appendChild(text);

    const activate=()=>{ $$(".seg").forEach(el=>el.classList.remove("active")); path.classList.add("active");
      $("#cBig").textContent = s.centerTop; $("#cSub").textContent = s.centerSub;
      $("#pTitle").textContent=s.title; $("#pBody").innerHTML=s.html; };
    path.addEventListener("click",activate); text.addEventListener("click",activate);
  });
}

async function initHub(){
  const [mkts, global, fng] = await Promise.all([fetchMarkets(), fetchGlobal(), fetchFNG()]);
  const by = (arr, key) => arr.slice().sort((a,b)=> (b[key]??0) - (a[key]??0));
  const topN = (arr,n)=>arr.slice(0,n);

  const listHTML = (items,kind)=>`<div class="list">${
    items.map((c,i)=>{
      const tk=(c.symbol||"").toUpperCase(), px=fmtMoney(c.current_price);
      const pc=kind==='vol'? fmtMoney(c.total_volume) : fmtPctRaw(c.price_change_percentage_24h);
      const cls=kind==='vol'?'':((c.price_change_percentage_24h||0)>=0?'up':'down');
      return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${pc}</div></div>`;
    }).join("")
  }</div>`;

  const btc = mkts.find(x=>x.id==="bitcoin");
  const usdt= mkts.find(x=>x.id==="tether");
  const dom = global?.data?.market_cap_percentage?.btc ?? null;
  const fval = Number(fng?.data?.[0]?.value ?? NaN);

  // BTC/USDT 스파크: 클릭 시 패널에서 보여주도록 지연 로딩
  async function capPanelHTML(id,label,cap){
    const chart = await fetchMarketChart(id,7);
    const arr = Array.isArray(chart?.market_caps) ? chart.market_caps.map(x=>x[1]) : null;
    return `<div>${label} Market Cap</div>
            <div style="margin-top:6px">${cap?fmtMoney(cap):"—"}</div>
            <div style="margin-top:8px">${arr? sparkSVG(arr,260,48): ""}</div>`;
  }

  const secs = [
    { badge:"VOL",  title:"Volume TOP10",            centerTop:"Volume Top10", centerSub:"거래량",  html:listHTML(topN(by(mkts,"total_volume"),10),"vol") },
    { badge:"+24H", title:"24H % TOP10 [USDT]",      centerTop:"+24H Gainers", centerSub:"상승률",  html:listHTML(topN(by(mkts,"price_change_percentage_24h"),10),"pct") },
    { badge:"F&G",  title:"Fear & Greed",            centerTop: Number.isFinite(fval)? String(fval):"—", centerSub:"index",
      html:`<div style="margin-bottom:6px">Fear & Greed Index</div>${Number.isFinite(fval)?gaugeHTML(fval):"—"}` },
    { badge:"BTC",  title:"BTC Market Cap",          centerTop: btc?fmtMoney(btc.market_cap):"—", centerSub:"Market Cap",
      html:`<div id="btcCapBox">로딩 중…</div>`,
      _after: async()=>{ $("#btcCapBox").innerHTML = await capPanelHTML("bitcoin","BTC",btc?.market_cap) } },
    { badge:"USDT", title:"USDT Market Cap",         centerTop: usdt?fmtMoney(usdt.market_cap):"—", centerSub:"Market Cap",
      html:`<div id="usdtCapBox">로딩 중…</div>`,
      _after: async()=>{ $("#usdtCapBox").innerHTML = await capPanelHTML("tether","USDT",usdt?.market_cap) } },
    { badge:"DOM",  title:"BTC Dominance",           centerTop: dom!=null? dom.toFixed(2)+"%":"—", centerSub:"dominance",
      html:`<div>BTC Dominance</div><div style="margin-top:6px">${dom!=null? dom.toFixed(2)+"%":"—"}</div>` },
  ];

  buildHub(secs);
  // 첫 섹션 활성화처럼 after 훅 실행(캡 패널 스파크 채우기)
  secs.forEach(s=>{ if(s._after) s._after().catch(()=>{}); });
}

/* ===== 마켓 테이블 ===== */
function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
  const s7  = c.sparkline_in_7d?.price;

  return `<tr data-id="${c.id}">
    <td class="sticky-rank num">${c.market_cap_rank ?? (i+1)}</td>
    <td class="sticky-name">
      <div class="mkt-name">
        <img src="${c.image}" alt="${c.symbol}">
        <span class="sym">${(c.symbol||'').toUpperCase()}</span>
        <span class="full">${c.name ?? ''}</span>
      </div>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num">${fmtPctVal(p1h)}</td>
    <td class="num">${fmtPctVal(p24)}</td>
    <td class="num">${fmtPctVal(p7d)}</td>
    <td class="num">${fmtMoney(c.market_cap)}</td>
    <td class="num">${fmtMoney(c.total_volume)}</td>
    <td class="spark">${Array.isArray(s7)? sparkSVG(s7,120,28) : ''}</td>
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

function renderTable(){
  const tbody = $("#mktBody");
  if(!tbody) return;
  const start = (state.page-1)*state.perPage;
  const items = state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');

  // 행 클릭 → chart.html (상대경로)
  tbody.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id = tr.getAttribute("data-id");
      if(id) location.href = "./chart.html?id=" + encodeURIComponent(id);
    });
  });
}

function renderPager(){
  const el=$("#pager"); if(!el) return;
  const n=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur=state.page;
  const btn=(i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-p="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html=""; for(let i=1;i<=n;i++){ if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur);} else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; } }
  el.innerHTML=html;
  el.querySelectorAll("button[data-p]").forEach(b=>{
    b.addEventListener("click", ()=>{ state.page=Number(b.dataset.p)||1; renderTable(); renderPager(); });
  });
}

/* 헤더 클릭 정렬 */
function wireSort(){
  $$("#mkt thead th[data-key]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const k = th.dataset.key;
      if(state.sortKey===k) state.sortDir *= -1; else { state.sortKey=k; state.sortDir=-1; }
      applyFilterSort();
    });
  });
}

/* 초기화 */
async function init(){
  wireSort();
  $("#q")?.addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

  const mkts = await fetchMarkets();
  state.all = Array.isArray(mkts)? mkts : [];
  applyFilterSort();

  initHub();

  // 30초마다 갱신
  setInterval(async ()=>{
    const m2 = await fetchMarkets();
    if(Array.isArray(m2) && m2.length){ state.all=m2; applyFilterSort(); }
    initHub();
  }, 30000);
}

/* DOM ready */
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
