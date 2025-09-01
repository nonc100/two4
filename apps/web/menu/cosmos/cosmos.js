/* =========================
   TWO4 COSMOS - safe cosmos.js
   (메인/차트 페이지 공용: 요소 존재 체크 가드 포함)
   ========================= */

/* ---- 전역 DOM 캐시 ---- */
let table=null, tbody=null, pager=null;

/* ---- 유틸 ---- */
const $  = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const safeNum = v => (v==null || isNaN(v)) ? null : Number(v);

function fmtMoney(n){
  const v=safeNum(n); if(v==null) return "-";
  const a=Math.abs(v);
  if(a>=1e12) return "$"+(v/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(v/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(v/1e6).toFixed(2)+"M";
  return "$"+v.toLocaleString("en-US",{maximumFractionDigits:2});
}
function fmtCap(n){ return fmtMoney(n); }
function fmtPrice(n){
  const v=safeNum(n); if(v==null) return "-";
  if(v>=1000) return "$"+v.toLocaleString("en-US",{maximumFractionDigits:0});
  if(v>=1)    return "$"+v.toLocaleString("en-US",{maximumFractionDigits:2,minimumFractionDigits:2});
  return "$"+v.toLocaleString("en-US",{maximumFractionDigits:6,minimumFractionDigits:2});
}
function fmtPct(n){
  const v=safeNum(n); if(v==null) return '-';
  const cls = v>=0 ? 'up' : 'down';
  const sign = v>=0 ? '+' : '';
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

/* ---- 별 컨트롤러 (없으면 패스) ---- */
(function starCtl(){
  const r = $("#starRange");
  if(!r) return;
  const apply = v => document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  r.addEventListener("input", e=>apply(e.target.value));
  apply(r.value);
})();

/* ---- 데이터 페치 ---- */
// CoinGecko: 250개 + sparkline + 1h/24h/7d 변동
async function fetchMarkets(){
  try{
    const url = "https://api.coingecko.com/api/v3/coins/markets"
      + "?vs_currency=usd&per_page=250&page=1"
      + "&sparkline=true&price_change_percentage=1h,24h,7d";
    const rs = await fetch(url,{cache:"no-store"});
    if(!rs.ok) throw new Error("coingecko blocked");
    return await rs.json();
  }catch(e){
    console.warn("fetchMarkets fail:", e.message);
    return [];
  }
}
async function fetchGlobal(){
  try{
    const rs = await fetch("https://api.coingecko.com/api/v3/global",{cache:"no-store"});
    if(!rs.ok) throw new Error("global blocked");
    return await rs.json();
  }catch(e){ return null; }
}
async function fetchFNG(){
  try{
    const rs = await fetch("https://api.alternative.me/fng/?limit=1&format=json",{cache:"no-store"});
    if(!rs.ok) throw new Error("fng blocked");
    return await rs.json();
  }catch(e){ return null; }
}

/* ---- HUB(도넛) ---- */
function buildHub(sections){
  const svg = $("#hubSvg");
  if(!svg) return;                // 페이지에 허브가 없으면 패스
  svg.innerHTML = "";

  const cx=500, cy=500, rI=260, rO=470;
  const TAU = Math.PI*2, seg = TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;

    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const pathD=(r0,r1,b0,b1)=>{
      const [x0,y0]=p(r1,b0), [x1,y1]=p(r1,b1), [x2,y2]=p(r0,b1), [x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0;
      return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
    };

    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d', pathD(rI,rO,a0,a1));
    path.setAttribute('fill', i%2? "#334155" : "#1f2a44");
    path.setAttribute('opacity', ".42");      // 투명도 ↑
    path.classList.add("seg");
    svg.appendChild(path);

    // 라벨(2배, 글로우 제거)
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
      const cBig=$("#cBig"), cSub=$("#cSub"), pTitle=$("#pTitle"), pBody=$("#pBody");
      if(cBig) cBig.textContent = s.centerTop;
      if(cSub) cSub.textContent = s.centerSub;
      if(pTitle) pTitle.textContent = s.title;
      if(pBody)  pBody.innerHTML = s.html;
    };
    path.addEventListener("click", activate);
    text.addEventListener("click", activate);
  });
}

/* Fear & Greed 게이지 */
function gaugeHTML(val){
  const v = clamp(safeNum(val) ?? 0,0,100);
  const deg = -90 + (v/100)*180; // -90 ~ +90
  // 색상대: 0~25 red, 25~75 yellow, 75~100 green
  let color = v<25 ? "#ef4444" : (v<75 ? "#f59e0b" : "#22c55e");
  return `
  <div style="text-align:center;font-weight:900;margin-bottom:6px;color:${color}">${v}</div>
  <svg viewBox="0 0 300 160" class="gauge" aria-label="Fear & Greed gauge">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="50%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <path d="M30,140 A120,120 0 0 1 270,140" class="g-arc" stroke="url(#g1)" stroke-width="16" fill="none" stroke-linecap="round"/>
    <g transform="translate(150,140)">
      <line x1="0" y1="0" x2="0" y2="-90" stroke="#000" stroke-opacity=".2" stroke-width="10" />
      <g transform="rotate(${deg})">
        <line x1="0" y1="0" x2="0" y2="-90" class="needle" />
      </g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>
  <div style="text-align:center;margin-top:6px;color:${color};font-weight:700">
    ${v<=20?'Extreme Fear':v<=45?'Fear':v<55?'Neutral':v<80?'Greed':'Extreme Greed'}
  </div>`;
}

/* HUB 데이터 */
async function initHub(){
  const svg = $("#hubSvg");
  if(!svg) return; // 허브 없는 페이지면 패스

  const [mkts, global, fng] = await Promise.all([fetchMarkets(), fetchGlobal(), fetchFNG()]);

  const listTop = (arr, by, n=10)=>arr.slice().sort((a,b)=> (b[by]??0) - (a[by]??0)).slice(0,n);
  const toList = (items,kind)=>`
    <div class="list">
      ${items.map((c,i)=>{
        const tk=(c.symbol||"").toUpperCase();
        const px=fmtMoney(c.current_price);
        const pc=kind==='vol' ? fmtMoney(c.total_volume) : (c.price_change_percentage_24h==null?'-':(c.price_change_percentage_24h>=0?'+':'')+c.price_change_percentage_24h.toFixed(2)+'%');
        const cls=kind==='vol'?'':((c.price_change_percentage_24h||0)>=0?'up':'down');
        return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${pc}</div></div>`;
      }).join("")}
    </div>`;

  const btc = mkts.find(x=>x.id==="bitcoin");
  const usdt= mkts.find(x=>x.id==="tether");
  const dom = global?.data?.market_cap_percentage?.btc ?? null;
  const fngVal = Number((fng?.data?.[0]?.value) ?? NaN);

  const secs = [
    { badge:"VOL", title:"Volume TOP10", centerTop:"Volume Top10", centerSub:"거래량",
      html: toList(listTop(mkts,"total_volume"),"vol") },
    { badge:"+24H", title:"24H % TOP10 [USDT]", centerTop:"+24H Gainers", centerSub:"상승률",
      html: toList(listTop(mkts,"price_change_percentage_24h"),"pct") },
    { badge:"F&G", title:"Fear & Greed", centerTop: isFinite(fngVal)? String(fngVal) : "—", centerSub:"index",
      html:isFinite(fngVal)?gaugeHTML(fngVal):"—" },
    { badge:"BTC", title:"BTC Market Cap", centerTop: btc?fmtMoney(btc.market_cap):"—", centerSub:"Market Cap",
      html:`<div>BTC 마켓캡</div><div style="margin-top:6px">${btc?fmtMoney(btc.market_cap):"—"}</div>` },
    { badge:"USDT", title:"USDT Market Cap", centerTop: usdt?fmtMoney(usdt.market_cap):"—", centerSub:"Market Cap",
      html:`<div>테더(USDT) 마켓캡</div><div style="margin-top:6px">${usdt?fmtMoney(usdt.market_cap):"—"}</div>` },
    { badge:"DOM", title:"BTC Dominance", centerTop: dom!=null? dom.toFixed(2)+"%":"—", centerSub:"dominance",
      html:`<div>비트코인 도미넌스</div><div style="margin-top:6px">${dom!=null? dom.toFixed(2)+"%":"—"}</div>` },
  ];
  buildHub(secs);

  const cBig=$("#cBig"), cSub=$("#cSub");
  if(cBig) cBig.textContent="COSMOS";
  if(cSub) cSub.textContent="—";
}

/* ---- 테이블 (시장표) ---- */
function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;

  // Binance 차트 링크 (예: BTC -> BTCUSDT)
  const sym = (c.symbol||'').toUpperCase();
  const chartHref = `chart.html?symbol=${encodeURIComponent(sym)}USDT`;

  // sparkline 데이터(7d) 전달
  const spark = Array.isArray(c.sparkline_in_7d?.price) ? c.sparkline_in_7d.price : null;
  const sparkDataAttr = spark ? `"${spark.join(',')}"` : `""`;

  return `<tr>
    <td class="sticky-rank num">${c.market_cap_rank ?? (i+1)}</td>
    <td class="sticky-name">
      <a class="no-link" href="${chartHref}" title="Open chart">
        <div class="mkt-name">
          <img src="${c.image}" alt="${sym}">
          <span class="sym">${sym}</span>
          <span class="full">${c.name ?? ''}</span>
        </div>
      </a>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPct(p1h)}</td>
    <td class="num">${fmtPct(p24)}</td>
    <td class="num hide-m">${fmtPct(p7d)}</td>
    <td class="num hide-m">${fmtCap(c.market_cap)}</td>
    <td class="num hide-m">${fmtCap(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-points=${sparkDataAttr}></canvas></td>
  </tr>`;
}

function drawSparks(){
  $$("#mkt canvas[data-points]").forEach(cv=>{
    const raw = cv.dataset.points||"";
    if(!raw) return;
    const pts = raw.split(",").map(Number).filter(x=>isFinite(x));
    if(pts.length<3) return;

    const ctx = cv.getContext("2d");
    const W=cv.width, H=cv.height;
    ctx.clearRect(0,0,W,H);

    // 정규화
    let min=Math.min(...pts), max=Math.max(...pts);
    if(min===max){ min*=0.99; max*=1.01; }
    const sx = (i)=> i*(W/(pts.length-1));
    const sy = (v)=> H - ( (v-min)/(max-min) )*H;

    // 상승/하락 색
    const color = pts[pts.length-1] >= pts[0] ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.lineWidth=2; ctx.strokeStyle=color;
    pts.forEach((v,i)=>{
      const x=sx(i), y=sy(v);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  });
}

function applyFilterSort(){
  const q = ($("#q")?.value||"").toLowerCase();
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
  if(!tbody) return;
  const start = (state.page-1)*state.perPage;
  const items = state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');
  drawSparks();
}

function renderPager(){
  if(!pager) return;
  const n = Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur = state.page;
  const btn = (i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html = "";
  for(let i=1;i<=n;i++){ if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur);} else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; } }
  pager.innerHTML = html;
  $$("button[data-pg]", pager).forEach(b=>{
    b.addEventListener("click", ()=>{ state.page = Number(b.dataset.pg)||1; renderTable(); renderPager(); });
  });
}

/* 정렬 헤더 연결(있을 때만) */
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

/* (이전 테이블 구조 혼선 방지) 안전 보정 */
function normalizeMarketTable(){
  if(!$("#mkt")) return;
  const thCount = $("#mkt thead tr")?.children.length || 0;
  $$("#mkt tbody tr").forEach(tr=>{
    const tds = tr.children;
    if (thCount && tds.length > thCount) {
      // 잘못 들어간 보조칸 제거 시나리오
      const extra = tds[1];
      const nameTd = tds[2];
      if(extra && nameTd){
        nameTd.innerHTML = `<div class="mkt-name">${extra.innerHTML}${nameTd.innerHTML}</div>`;
        extra.remove();
      }
    }
    if(tds[0]) tds[0].classList.add('sticky-rank','num');
    if(tds[1]) tds[1].classList.add('sticky-name');
  });
}

/* ---- 초기화 (페이지 감지형) ---- */
async function init(){
  const hasTable = !!$("#mkt");
  const hasHub   = !!$("#hubSvg");

  if(hasTable){
    table = $("#mkt"); tbody = $("#mktBody"); pager = $("#pager");
    wireSort();

    const q = $("#q");
    if(q) q.addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

    const mkts = await fetchMarkets();
    state.all = Array.isArray(mkts) ? mkts : [];
    applyFilterSort();
    normalizeMarketTable();
  }

  if(hasHub){
    await initHub();
  }

  if(hasTable || hasHub){
    setInterval(async ()=>{
      if(hasTable){
        const mkts2 = await fetchMarkets();
        if(Array.isArray(mkts2) && mkts2.length){ state.all = mkts2; applyFilterSort(); }
      }
      if(hasHub) initHub();
    }, 30000);
  }
}

/* DOM ready */
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
