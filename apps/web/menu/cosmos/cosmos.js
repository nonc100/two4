/* ===== COSMOS TABLE (left-sticky + mobile compact + stars) ===== */

/* DOM */
const $  = (s,sc=document)=>sc.querySelector(s);
const $$ = (s,sc=document)=>Array.from(sc.querySelectorAll(s));
let tbody = null, pager = null;

/* Utils */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const safeNum=v=>Number.isFinite(+v)?+v:null;

function fmtMoney(n){
  if(n==null || isNaN(n)) return "-";
  const a=Math.abs(n);
  if(a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
}
function fmtPrice(n){
  if(n==null || isNaN(n)) return "-";
  const x=+n;
  if(x>=100) return "$"+x.toLocaleString("en-US",{maximumFractionDigits:2});
  if(x>=1)   return "$"+x.toLocaleString("en-US",{maximumFractionDigits:3});
  const dp = Math.min(8, Math.ceil(Math.abs(Math.log10(x)))+2);
  return "$"+x.toLocaleString("en-US",{maximumFractionDigits:dp});
}
function fmtPctHTML(v){
  if(v==null || isNaN(v)) return '<span class="pct">-</span>';
  const n=+v, cls=n>0?'up':n<0?'down':'';
  const sign=n>0?'+':'';
  return `<span class="pct ${cls}">${sign}${n.toFixed(2)}%</span>`;
}

/* Star controller */
(function(){
  const r=$("#starRange");
  if(!r) return;
  const saved = Number(localStorage.getItem("two4_starVis")||r.value);
  r.value = String(clamp(saved,0,100));
  const apply=v=>document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  apply(saved);
  r.addEventListener("input", e=>{
    const v=Number(e.target.value||0);
    apply(v);
    localStorage.setItem("two4_starVis", String(v));
  });
})();

/* Data fetchers (CoinGecko) */
async function fetchMarketsPage(page=1, perPage=250){
  const q = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: String(perPage),
    page: String(page),
    sparkline: "true",
    price_change_percentage: "1h,24h,7d"
  });
  const url = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("coingecko failed "+r.status);
  return r.json();
}
async function fetchMarketsAll(){
  try{
    // 500개까지 (2페이지)
    const [p1,p2] = await Promise.allSettled([fetchMarketsPage(1,250), fetchMarketsPage(2,250)]);
    const a = (p1.status==='fulfilled'?p1.value:[]).concat(p2.status==='fulfilled'?p2.value:[]);
    return a;
  }catch(e){ console.error(e); return []; }
}

/* State */
const state={
  all: [],
  filtered: [],
  page: 1,
  perPage: 50,
  sortKey: "market_cap",
  sortDir: -1, // desc
};

/* Sparkline */
function drawSpark(canvas, arr){
  if(!canvas || !Array.isArray(arr) || arr.length<2) return;
  const ctx=canvas.getContext("2d");
  const W=canvas.width, H=canvas.height;
  const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
  ctx.clearRect(0,0,W,H);
  // line
  ctx.beginPath();
  arr.forEach((v,i)=>{
    const x = (i/(arr.length-1))*W;
    const y = H - ((v-min)/span)*H;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  const up = arr[arr.length-1]>=arr[0];
  ctx.lineWidth=2;
  ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
  ctx.stroke();
}

/* Row */
function rowHTML(c, idx){
  const sym=(c.symbol||"").toUpperCase();
  const ch1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const ch24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const ch7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
  return `<tr data-id="${c.id}">
    <td class="sticky-rank num">${c.market_cap_rank ?? (idx+1)}</td>
    <td class="sticky-name">
      <div class="mkt-name">
        <img src="${c.image}" alt="${sym}"><span class="sym">${sym}</span><span class="full">${c.name||""}</span>
      </div>
    </td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPctHTML(safeNum(ch1h))}</td>
    <td class="num">${fmtPctHTML(safeNum(ch24))}</td>
    <td class="num hide-m">${fmtPctHTML(safeNum(ch7d))}</td>
    <td class="num hide-m">${fmtMoney(c.market_cap)}</td>
    <td class="num hide-m">${fmtMoney(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-spark="${c.id}"></canvas></td>
  </tr>`;
}

/* Render */
function renderTable(){
  const start=(state.page-1)*state.perPage;
  const rows=state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = rows.map((c,i)=>rowHTML(c,start+i)).join("") || `<tr><td colspan="9" class="text-right" style="text-align:center">No data</td></tr>`;

  // draw sparks
  rows.forEach(c=>{
    const el = $(`canvas[data-spark="${c.id}"]`, tbody);
    const arr = (c.sparkline_in_7d && c.sparkline_in_7d.price) ? c.sparkline_in_7d.price : null;
    if(el && arr) drawSpark(el, arr);
  });
}
function renderPager(){
  const total = Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur = state.page;
  const btn=(p,txt=String(p),on=false)=>`<button data-p="${p}" class="${on?'on':''}">${txt}</button>`;
  const L=[];
  // simple 1..N (cap at 12 with gaps)
  for(let p=1;p<=total;p++){
    if(p<=6 || p>total-2 || Math.abs(p-cur)<=1) L.push(btn(p,String(p),p===cur));
    else if(L[L.length-1]!=="…") L.push("…");
  }
  pager.innerHTML = L.map(x=>x==="…"?`<span style="opacity:.6">…</span>`:x).join("");
  $$("button[data-p]", pager).forEach(b=>b.onclick=()=>{state.page=Number(b.dataset.p)||1; renderTable(); renderPager();});
}

/* Filter + sort */
function applyFilterSort(){
  const q=($("#search").value||"").trim().toLowerCase();
  let arr = state.all.filter(c=>{
    const sym=(c.symbol||"").toLowerCase(), nm=(c.name||"").toLowerCase();
    return !q || sym.includes(q) || nm.includes(q);
  });
  const get=(c)=>{
    switch(state.sortKey){
      case "rank": return c.market_cap_rank ?? 1e9;
      case "symbol": return (c.symbol||"").toUpperCase();
      case "price": return c.current_price ?? -1;
      case "change1h": return c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? 0;
      case "change24h": return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
      case "change7d": return c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d ?? 0;
      case "market_cap": return c.market_cap ?? -1;
      case "volume": return c.total_volume ?? -1;
      default: return 0;
    }
  };
  arr.sort((a,b)=>{
    const va=get(a), vb=get(b);
    const r = (typeof va==="string" && typeof vb==="string") ? va.localeCompare(vb) : (va-vb);
    return r * state.sortDir;
  });
  state.filtered = arr;
  if((state.page-1)*state.perPage >= state.filtered.length) state.page = 1;
  renderTable(); renderPager();
}

/* Header sort click */
function wireHeaderSort(){
  $$("#mkt thead th[data-key]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const k=th.dataset.key;
      if(!k) return;
      if(state.sortKey===k) state.sortDir*=-1; else { state.sortKey=k; state.sortDir = (k==="rank")?-1:-1; }
      applyFilterSort();
    });
  });
}

/* Row click → chart */
function wireRowClick(){
  $("#mktBody").addEventListener("click", (e)=>{
    const tr=e.target.closest("tr[data-id]");
    if(!tr) return;
    const id=tr.dataset.id;
    location.href = `/menu/cosmos/chart.html?id=${encodeURIComponent(id)}`;
  });
}

/* Init */
async function init(){
  tbody=$("#mktBody"); pager=$("#pager");
  wireHeaderSort();
  wireRowClick();
  $("#search").addEventListener("input", ()=>{state.page=1; applyFilterSort();});

  try{
    const data = await fetchMarketsAll(); // up to 500
    state.all = Array.isArray(data)? data : [];
  }catch{ state.all = []; }

  applyFilterSort();

  // auto refresh every 30s (best effort)
  setInterval(async ()=>{
    try{
      const fresh = await fetchMarketsAll();
      if(Array.isArray(fresh) && fresh.length) { state.all=fresh; applyFilterSort(); }
    }catch{}
  }, 30000);
}

/* Kick */
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
/* ===== HUB (Donut) ===== */
async function fetchGlobal(){
  try{
    const r=await fetch("https://api.coingecko.com/api/v3/global");
    if(!r.ok) throw 0; return await r.json();
  }catch{ return null; }
}
async function fetchFNG(){
  try{
    const r=await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    if(!r.ok) throw 0; return await r.json();
  }catch{ return null; }
}
function gaugeHTML(val){
  const v=Math.max(0,Math.min(100, Number(val)||0));
  const deg=-90+(v/100)*180;
  const color = v<=40 ? "#ef4444" : v<=60 ? "#f59e0b" : "#22c55e";
  const label = v<=20?"Extreme Fear":v<=40?"Fear":v<=60?"Neutral":v<=80?"Greed":"Extreme Greed";
  return `<div style="display:flex;flex-direction:column;gap:6px">
    <svg viewBox="0 0 300 160" style="width:100%;height:120px">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs>
      <path d="M30,140 A120,120 0 0 1 270,140" stroke="url(#g1)" stroke-width="14" fill="none" stroke-linecap="round"/>
      <g transform="translate(150,140) rotate(${deg})"><line x1="0" y1="0" x2="0" y2="-88" stroke="${color}" stroke-width="8" stroke-linecap="round"/></g>
      <circle cx="150" cy="140" r="9" fill="#fff" fill-opacity=".9"/>
    </svg>
    <div style="display:flex;justify-content:space-between;font-weight:800">
      <span>${v}</span><span style="color:${color}">${label}</span>
    </div>
  </div>`;
}
function buildHub(sections){
  const svg=$("#hubSvg"); if(!svg) return; svg.innerHTML="";
  const cx=500,cy=500,rI=260,rO=470, TAU=Math.PI*2, seg=TAU/sections.length, start=-Math.PI/2;
  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)];
    const arc=(r0,r1,b0,b1)=>{const [x0,y0]=p(r1,b0),[x1,y1]=p(r1,b1),[x2,y2]=p(r0,b1),[x3,y3]=p(r0,b0);
      const laf=(b1-b0)>Math.PI?1:0; return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`;};
    const path=document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute("d", arc(rI,rO,a0,a1));
    path.setAttribute("class","seg");
    path.setAttribute("fill","rgba(255,255,255,.12)");
    svg.appendChild(path);
    const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-30)*Math.cos(mid), ty=cy+(rx-30)*Math.sin(mid)+6;
    const label=document.createElementNS(svg.namespaceURI,'text');
    label.setAttribute("x",tx); label.setAttribute("y",ty); label.setAttribute("text-anchor","middle");
    label.setAttribute("class","seg-label"); label.textContent=s.badge; svg.appendChild(label);
    const act=()=>{svg.querySelectorAll(".seg").forEach(e=>e.classList.remove("active")); path.classList.add("active");
      $("#hubBig").textContent=s.centerTop; $("#hubSub").textContent=s.centerSub;
      $("#hubTitle").textContent=s.title; $("#hubBody").innerHTML=s.html;};
    path.addEventListener("click", act); label.addEventListener("click", act);
  });
}
async function initHub(){
  const [mkts, global, fng] = await Promise.all([ Promise.resolve(state.all), fetchGlobal(), fetchFNG() ]);
  const listTop=(by,n=10)=> mkts.slice().sort((a,b)=> (b[by]??0)-(a[by]??0)).slice(0,n);
  const toList=(arr,kind)=>`<div style="display:flex;flex-direction:column;gap:6px">`+arr.map((c,i)=>{
    const sym=(c.symbol||"").toUpperCase();
    const px=fmtPrice(c.current_price);
    const pct=(c.price_change_percentage_24h||0); const cls=pct>=0?'up':'down';
    const vol=fmtMoney(c.total_volume);
    return `<div style="display:grid;grid-template-columns:1.6em 1fr auto auto;gap:8px;align-items:center">
      <div style="opacity:.7;text-align:right;font-weight:800">${i+1}</div>
      <div style="font-weight:900">${sym}</div>
      <div style="opacity:.9;text-align:right">${px}</div>
      <div class="${kind==='vol'?'':'pct '+cls}" style="text-align:right">${kind==='vol'?vol:((pct>=0?'+':'')+pct.toFixed(2)+'%')}</div>
    </div>`;}).join("")+`</div>`;
  const btc=mkts.find(x=>x.id==="bitcoin"), usdt=mkts.find(x=>x.id==="tether");
  const dom = global?.data?.market_cap_percentage?.btc ?? null;
  const f = Number(fng?.data?.[0]?.value ?? NaN);
  const secs=[
    {badge:"VOL", title:"거래량 TOP10", centerTop:"Volume Top10", centerSub:"거래량", html: toList(listTop("total_volume"),"vol")},
    {badge:"+24H", title:"24H % TOP10 [USDT]", centerTop:"+24H Gainers", centerSub:"상승률", html: toList(listTop("price_change_percentage_24h"),"pct")},
    {badge:"F&G", title:"공포/탐욕 지수", centerTop: isFinite(f)? String(f):"—", centerSub:"Index", html: isFinite(f)?gaugeHTML(f):"—"},
    {badge:"BTC MC", title:"비트코인 시가총액", centerTop: btc?fmtMoney(btc.market_cap):"—", centerSub:"Market Cap", html:`<div>비트코인 시가총액</div><div style="margin-top:6px">${btc?fmtMoney(btc.market_cap):'—'}</div>`},
    {badge:"USDT MC", title:"테더 시가총액", centerTop: usdt?fmtMoney(usdt.market_cap):"—", centerSub:"Market Cap", html:`<div>테더 시가총액</div><div style="margin-top:6px">${usdt?fmtMoney(usdt.market_cap):'—'}</div>`},
    {badge:"BTC DOM", title:"비트코인 도미넌스", centerTop: dom!=null?dom.toFixed(2)+"%":"—", centerSub:"Dominance", html:`<div>비트코인 도미넌스</div><div style="margin-top:6px">${dom!=null?dom.toFixed(2)+"%":"—"}</div>`},
  ];
  buildHub(secs);
  $("#hubBig").textContent="COSMOS"; $("#hubSub").textContent="—";
}
