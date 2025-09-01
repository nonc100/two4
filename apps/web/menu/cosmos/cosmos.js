/* =========================
   COSMOS CORE (CoinGecko + Hub + Table)
   ========================= */

/* DOM refs */
const $  = (s,sc=document)=>sc.querySelector(s);
const $$ = (s,sc=document)=>Array.from(sc.querySelectorAll(s));

/* ---------- Utils ---------- */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const safeNum = v => (v==null || Number.isNaN(+v)) ? null : +v;

function fmtMoney(n){
  if(n==null || isNaN(n)) return "-";
  const a=Math.abs(n);
  if(a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
}
function fmtPrice(n){
  return (n==null||isNaN(n))? "-"
    : "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
}
function fmtPctSpan(n){
  if(n==null || isNaN(n)) return '<span class="pct">-</span>';
  const up = n>=0; const s = (up?'+':'')+n.toFixed(2)+'%';
  return `<span class="pct ${up?'up':'down'}">${s}</span>`;
}
function sparkline(ctx, data, color){
  if(!ctx || !data || data.length<2) return;
  const w=ctx.canvas.width, h=ctx.canvas.height;
  const min=Math.min(...data), max=Math.max(...data), span=(max-min)||1;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle=color;
  data.forEach((v,i)=>{
    const x=(i/(data.length-1))*w;
    const y=h-((v-min)/span)*h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

/* ---------- Star controller ---------- */
(function starCtl(){
  const r=$("#starRange");
  if(!r) return;
  const apply = v => document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  r.addEventListener("input", e=>apply(e.target.value));
  apply(r.value);
})();

/* ---------- Data fetch (CoinGecko + Fallback /api) ---------- */
async function tryFetch(url){
  const rs = await fetch(url);
  if(!rs.ok) throw new Error(String(rs.status));
  return rs.json();
}
async function cgOrProxy(primary, proxy){
  try{ return await tryFetch(primary); }
  catch{ return await tryFetch(proxy); }
}

async function fetchMarkets(){
  const q="vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d";
  const primary=`https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  =`/api/coins/markets?${q}`;
  try{ return await cgOrProxy(primary, proxy); }catch{ return []; }
}
async function fetchGlobal(){
  try{ return await cgOrProxy("https://api.coingecko.com/api/v3/global", "/api/global"); }
  catch{ return null; }
}
async function fetchFNG(){
  try{
    return await cgOrProxy("https://api.alternative.me/fng/?limit=1&format=json", "/api/fng?limit=1");
  }catch{ return null; }
}
async function fetchMarketChart(id,days=7){
  const q=`vs_currency=usd&days=${days}`;
  try{
    return await cgOrProxy(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`,
      `/api/coins/${encodeURIComponent(id)}/market_chart?${q}`
    );
  }catch{ return null; }
}

/* ---------- State ---------- */
const state = {
  all: [],
  filtered: [],
  sortKey: "market_cap",
  sortDir: -1,
  page: 1,
  perPage: 50
};

/* ---------- HUB (Donut) ---------- */
function arcPath(cx, cy, r0, r1, a0, a1){
  const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
  const [x0,y0]=p(r1,a0), [x1,y1]=p(r1,a1), [x2,y2]=p(r0,a1), [x3,y3]=p(r0,a0);
  const laf=(a1-a0)>Math.PI?1:0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;
}
function setCenter(lbl,val){ $("#hubLbl").textContent=lbl; $("#hubVal").textContent=val; }

function fngGaugeHTML(v){
  const val = clamp(+v||0,0,100);
  const deg = -90 + (val/100)*180;
  // 색 구간: 0-25 빨강, 25-60 노랑, 60-100 초록
  let status = "Neutral", color = "#f59e0b";
  if(val<=25){ status="Extreme Fear"; color="#ef4444"; }
  else if(val<=45){ status="Fear"; color="#f59e0b"; }
  else if(val<60){ status="Neutral"; color="#f59e0b"; }
  else if(val<80){ status="Greed"; color="#22c55e"; }
  else { status="Extreme Greed"; color="#22c55e"; }
  const label = `${val} · ${status}`;
  return `
  <div style="margin-bottom:8px;font-weight:800">${label}</div>
  <svg viewBox="0 0 300 160" class="gauge" aria-label="Fear & Greed gauge">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#ef4444"/>
        <stop offset="50%"  stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <path d="M30,140 A120,120 0 0 1 270,140" class="g-arc" stroke="url(#g1)"/>
    <g transform="translate(150,140)">
      <g transform="rotate(${deg})"><line x1="0" y1="0" x2="0" y2="-90" class="needle"/></g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>`;
}

function buildHub(sections){
  const svg=$("#hubSvg"); svg.innerHTML="";
  const cx=500, cy=500, rI=260, rO=470, TAU=Math.PI*2;
  const segA = TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+segA*i+0.014, a1=start+segA*(i+1)-0.014;
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('d', arcPath(cx,cy,rI,rO,a0,a1));
    path.setAttribute('fill','rgba(255,255,255,.10)');  // 투명 섹터
    path.setAttribute('opacity','.95');
    path.classList.add('seg');
    svg.appendChild(path);

    const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-30)*Math.cos(mid), ty=cy+(rx-30)*Math.sin(mid)+6;
    const text=document.createElementNS(svg.namespaceURI,'text');
    text.setAttribute('x',tx); text.setAttribute('y',ty);
    text.setAttribute('text-anchor','middle');
    text.classList.add('seg-label');
    text.textContent=s.badge;
    svg.appendChild(text);

    const act=()=>{
      svg.querySelectorAll('.seg').forEach(el=>el.classList.remove('active'));
      path.classList.add('active');
      setCenter(s.centerLabel, s.centerValue);
      const panel=$("#hubPanel"), t=$("#hubTitle"), c=$("#hubContent");
      t.textContent = s.titleKo;          // 상세는 한글 표기
      c.innerHTML = s.html;
    };
    path.addEventListener('click',act);
    text.addEventListener('click',act);
  });
}

/* ---------- Table ---------- */
function rowHTML(c, i){
  const p1h=c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24=c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d=c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
  const sym=(c.symbol||'').toUpperCase();
  return `<tr data-sym="${sym}">
    <td class="sticky-rank num">${c.market_cap_rank ?? (i+1)}</td>
    <td class="sticky-name">
      <div class="mkt-name">
        <img src="${c.image}" alt="${sym}">
        <span class="sym">${sym}</span>
        <span class="full">${c.name ?? ''}</span>
      </div>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPctSpan(safeNum(p1h))}</td>
    <td class="num">${fmtPctSpan(safeNum(p24))}</td>
    <td class="num hide-m">${fmtPctSpan(safeNum(p7d))}</td>
    <td class="num hide-m">${fmtMoney(c.market_cap)}</td>
    <td class="num hide-m">${fmtMoney(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-id="${c.id}"></canvas></td>
  </tr>`;
}

function drawRowSparks(rows){
  rows.forEach(c=>{
    const cv = document.querySelector(`canvas[data-id="${c.id}"]`);
    if(!cv) return;
    const arr=(c.sparkline_in_7d && c.sparkline_in_7d.price)||null;
    if(!arr) return;
    sparkline(cv.getContext('2d'), arr, (arr.at(-1)>=arr[0])? "#22c55e" : "#ef4444");
  });
}

function applySortFilter(){
  const q = ($("#search").value||"").trim().toLowerCase();
  let arr = state.all.filter(x=>
    !q || (x.symbol||"").toLowerCase().includes(q) || (x.name||"").toLowerCase().includes(q)
  );

  const k=state.sortKey, dir=state.sortDir;
  const get=c=>({
    rank: c.market_cap_rank ?? 1e9,
    name: (c.name||"").toLowerCase(),
    price: c.current_price ?? -1,
    change1h: c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? 0,
    change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    change7d: c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0,
    market_cap: c.market_cap ?? -1,
    volume: c.total_volume ?? -1
  }[k] ?? 0);
  arr.sort((a,b)=>{
    const va=get(a), vb=get(b);
    let r = (typeof va==="string" && typeof vb==="string") ? va.localeCompare(vb) : (va - vb);
    return r*dir;
  });

  state.filtered=arr;
  if((state.page-1)*state.perPage>=arr.length) state.page=1;
  renderTable(); renderPager();
}

function renderTable(){
  const tbody=$("#mktBody"); if(!tbody) return;
  const start=(state.page-1)*state.perPage;
  const rows=state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = rows.map((c,i)=>rowHTML(c,start+i)).join("");
  drawRowSparks(rows);

  // 행 클릭 → Binance 차트 페이지로 이동
  tbody.querySelectorAll("tr").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const sym = tr.dataset.sym || "";
      const pair = (sym ? sym.toUpperCase() : "BTC") + "USDT";
      location.href = `/menu/cosmos/chart.html?symbol=${encodeURIComponent(pair)}`;
    });
  });
}

function renderPager(){
  const root=$("#pager"); if(!root) return;
  const total=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur=state.page;
  const btn=(i,lab=String(i),on=false)=>`<button data-p="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${on?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html="";
  for(let p=1;p<=total;p++){
    if(p<=7 || p>total-2 || Math.abs(p-cur)<=2) html+=btn(p,String(p), p===cur);
    else if(!html.endsWith("…")) html+=`<span style="opacity:.6;padding:0 6px">…</span>`;
  }
  root.innerHTML=html;
  root.querySelectorAll("button[data-p]").forEach(b=>{
    b.addEventListener("click", ()=>{ state.page=+b.dataset.p||1; renderTable(); renderPager(); });
  });
}

/* ---------- Header sort ---------- */
function wireHeaderSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.style.cursor="pointer";
    th.addEventListener("click", ()=>{
      const k=th.dataset.key; if(!k) return;
      if(state.sortKey===k) state.sortDir*=-1; else { state.sortKey=k; state.sortDir=-1; }
      applySortFilter();
    });
  });
}

/* ---------- HUB data & render ---------- */
function listHTML(items,kind){
  return `<div class="list">`+items.map((c,i)=>{
    const tk=(c.symbol||"").toUpperCase(), px=fmtMoney(c.current_price);
    const pc=kind==='vol'? fmtMoney(c.total_volume) : ((c.price_change_percentage_24h!=null)? ( (c.price_change_percentage_24h>=0?'+':'')+c.price_change_percentage_24h.toFixed(2)+'%' ) : '-');
    const cls=kind==='vol'?'': ((c.price_change_percentage_24h||0)>=0?'up':'down');
    return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${pc}</div></div>`;
  }).join("")+`</div>`;
}

async function initHubAndCards(markets, global, fng){
  const byId=Object.fromEntries(markets.map(m=>[m.id,m]));
  const btc=byId.bitcoin||null, usdt=byId.tether||null;

  // 미니 스파크 데이터 (BTC/USDT 시총)
  const [btcChart, usdtChart] = await Promise.all([
    fetchMarketChart('bitcoin', 7),
    fetchMarketChart('tether', 7)
  ]);
  const btcCapArr = Array.isArray(btcChart?.market_caps)? btcChart.market_caps.map(x=>x[1]) : null;
  const usdtCapArr= Array.isArray(usdtChart?.market_caps)? usdtChart.market_caps.map(x=>x[1]) : null;

  const totalCap = safeNum(global?.data?.total_market_cap?.usd);
  const dom = safeNum(global?.data?.market_cap_percentage?.btc);
  const gainers = markets.slice().filter(x=>Number.isFinite(x.price_change_percentage_24h))
                    .sort((a,b)=>b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0,10);
  const byVol = markets.slice().sort((a,b)=>(b.total_volume||0)-(a.total_volume||0)).slice(0,10);

  // HUB 섹션 구성 (배지 텍스트는 큰 글자, 상세 패널은 한글)
  const secs = [
    {
      badge:'BTC CAP',
      centerLabel:'BTC Market Cap',
      centerValue: btc?fmtMoney(btc.market_cap):'—',
      titleKo:'비트코인 시가총액',
      html:`<div>비트코인 시가총액</div>
            <div style="margin:6px 0 10px">${btc?fmtMoney(btc.market_cap):'—'}</div>
            <canvas id="btcMini" width="180" height="44" style="width:180px;height:44px"></canvas>`
    },
    {
      badge:'USDT CAP',
      centerLabel:'USDT Market Cap',
      centerValue: usdt?fmtMoney(usdt.market_cap):'—',
      titleKo:'테더 시가총액',
      html:`<div>테더(Tether) 시가총액</div>
            <div style="margin:6px 0 10px">${usdt?fmtMoney(usdt.market_cap):'—'}</div>
            <canvas id="usdtMini" width="180" height="44" style="width:180px;height:44px"></canvas>`
    },
    {
      badge:'BTC DOM',
      centerLabel:'BTC Dominance',
      centerValue: dom!=null? dom.toFixed(2)+'%':'—',
      titleKo:'비트코인 도미넌스',
      html:`<div>비트코인 도미넌스</div><div style="margin-top:6px">${dom!=null? dom.toFixed(2)+'%':'—'}</div>`
    },
    {
      badge:'+24H',
      centerLabel:'+24H Gainers',
      centerValue:'TOP10',
      titleKo:'24시간 상승률 TOP10 [USDT]',
      html: listHTML(gainers,'pct')
    },
    {
      badge:'VOL',
      centerLabel:'Volume Top10',
      centerValue:'TOP10',
      titleKo:'거래량 TOP10',
      html: listHTML(byVol,'vol')
    },
    {
      badge:'F&G',
      centerLabel:'Fear & Greed',
      centerValue: (fng?.data?.[0]?.value ?? '—'),
      titleKo:'공포/탐욕 지수',
      html: (fng?.data?.[0]?.value!=null) ? fngGaugeHTML(+fng.data[0].value) : '—'
    }
  ];

  buildHub(secs);
  setCenter('COSMOS','—');

  // 패널 내 미니 스파크 그리기 (섹션 클릭 후 보이도록 즉시 준비)
  const btcCv = $("#btcMini"); if(btcCv && btcCapArr) sparkline(btcCv.getContext('2d'), btcCapArr, "#22c55e");
  const usdtCv= $("#usdtMini"); if(usdtCv && usdtCapArr) sparkline(usdtCv.getContext('2d'), usdtCapArr, "#60a5fa");
}

/* ---------- Init ---------- */
async function init(){
  // Header sort
  wireHeaderSort();

  // Search
  $("#search").addEventListener("input", ()=>{ state.page=1; applySortFilter(); });

  // Data bootstrap
  try{
    const [mkts, global, fng] = await Promise.all([fetchMarkets(), fetchGlobal(), fetchFNG()]);
    state.all = Array.isArray(mkts)? mkts : [];
    applySortFilter();
    // HUB
    initHubAndCards(state.all, global, fng);
  }catch(e){
    console.error(e);
    state.all = [];
    applySortFilter();
    $("#hubTitle").textContent="데이터 로딩 실패";
    $("#hubContent").textContent="네트워크 상태를 확인하세요.";
  }

  // 30초마다 갱신
  setInterval(async ()=>{
    try{
      const mkts = await fetchMarkets();
      if(Array.isArray(mkts) && mkts.length){
        state.all = mkts; applySortFilter();
      }
    }catch{}
  }, 30000);
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
