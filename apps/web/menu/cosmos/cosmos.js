/* =========================
   COSMOS CORE (safe build)
   ========================= */

/* DOM refs */
let table=null, tbody=null, pager=null;

/* utils */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

const fmtPrice = n => (n==null||isNaN(n))?'-':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const fmtCap   = n => {
  if(n==null||isNaN(n)) return '-';
  const a=Math.abs(n);
  if(a>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
  if(a>=1e9)  return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6)  return '$'+(n/1e6).toFixed(2)+'M';
  return '$'+Number(n).toLocaleString('en-US');
};
const fmtPct = n => {
  if(n==null||isNaN(n)) return '-';
  const s = n>=0?'up':'down';
  return `<span class="pct ${s}">${(n>=0?'+':'')+n.toFixed(2)}%</span>`;
};
const fmtMoney = n => {
  if(n==null||isNaN(n)) return '-';
  const a=Math.abs(n);
  if(a>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
  if(a>=1e9)  return '$'+(n/1e9).toFixed(2)+'B';
  if(a>=1e6)  return '$'+(n/1e6).toFixed(2)+'M';
  return '$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
};

/* state */
const state = {
  all: [],
  filtered: [],
  sortKey: "market_cap",
  sortDir: -1,
  page: 1,
  perPage: 50
};

/* star controller */
(function starCtl(){
  const r = $("#starRange");
  if(!r) return;
  const apply=v=>document.documentElement.style.setProperty("--starVis", String(clamp(v/100,0,1)));
  r.addEventListener("input", e=>apply(e.target.value));
  apply(r.value);
})();

/* data fetchers (public endpoints; consider proxy in prod) */
async function fetchMarkets(){
  try{
    const url="https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&price_change_percentage=1h,24h,7d&per_page=250&page=1";
    const rs=await fetch(url);
    if(!rs.ok) throw new Error("coingecko blocked");
    return await rs.json();
  }catch(e){ console.warn("fetchMarkets fail:",e.message); return []; }
}
async function fetchGlobal(){
  try{
    const rs=await fetch("https://api.coingecko.com/api/v3/global");
    if(!rs.ok) throw new Error("global blocked");
    return await rs.json();
  }catch(e){ return null; }
}
async function fetchFNG(){
  try{
    const rs=await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    if(!rs.ok) throw new Error("fng blocked");
    return await rs.json();
  }catch(e){ return null; }
}

/* ===== Hub (donut) ===== */
function buildHub(sections){
  const svg=$("#hubSvg"); svg.innerHTML="";
  const cx=500, cy=500, rI=260, rO=470, TAU=Math.PI*2, seg=TAU/sections.length, start=-Math.PI/2;

  sections.forEach((s,i)=>{
    const a0=start+seg*i+0.014, a1=start+seg*(i+1)-0.014;
    const p=(r,a)=>[cx+r*Math.cos(a), cy+r*Math.sin(a)];
    const arcPath=(r0,r1,b0,b1)=>{
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
    text.textContent=s.badge;
    svg.appendChild(text);

    const activate=()=>{
      svg.querySelectorAll(".seg").forEach(el=>el.classList.remove("active"));
      path.classList.add("active");
      $("#cBig").textContent=s.centerTop;
      $("#cSub").textContent=s.centerSub;
      $("#pTitle").textContent=s.title;
      $("#pBody").innerHTML=s.html;
    };
    path.addEventListener("click", activate);
    text.addEventListener("click", activate);
  });
}

function gaugeHTML(val){
  const v=clamp(val,0,100), deg=-90+(v/100)*180;
  return `
  <svg viewBox="0 0 300 160" class="gauge" aria-label="Fear & Greed gauge">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/>
      </linearGradient>
    </defs>
    <path d="M30,140 A120,120 0 0 1 270,140" class="g-arc" stroke="url(#g1)"/>
    <g transform="translate(150,140)">
      <line x1="0" y1="0" x2="0" y2="-90" stroke="#000" stroke-opacity=".25" stroke-width="10"/>
      <g transform="rotate(${deg})"><line x1="0" y1="0" x2="0" y2="-90" class="needle"/></g>
      <circle cx="0" cy="0" r="10" fill="#fff" fill-opacity=".9"/>
    </g>
  </svg>`;
}

async function initHub(){
  const [mkts,global,fng]=await Promise.all([fetchMarkets(),fetchGlobal(),fetchFNG()]);
  const topBy=(arr,key,n=10)=>arr.slice().sort((a,b)=>(b[key]??0)-(a[key]??0)).slice(0,n);
  const list = (items, kind)=>`
    <div class="list">
      ${items.map((c,i)=>{
        const tk=(c.symbol||"").toUpperCase();
        const px=fmtMoney(c.current_price);
        const pc=kind==='vol' ? fmtMoney(c.total_volume) :
                 (c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency);
        const cls=kind==='vol'?'':((pc||0)>=0?'up':'down');
        const pct = kind==='vol' ? pc : (pc!=null? (pc>=0?`+${pc.toFixed(2)}%`:`${pc.toFixed(2)}%`) : '-');
        return `<div class="row"><div class="rk">${i+1}</div><div class="tk">${tk}</div><div class="px">${px}</div><div class="pc ${cls}">${pct}</div></div>`;
      }).join("")}
    </div>`;

  const btc = mkts.find(x=>x.id==="bitcoin");
  const usdt= mkts.find(x=>x.id==="tether");
  const dom = global?.data?.market_cap_percentage?.btc ?? null;
  const fngVal=Number((fng?.data?.[0]?.value) ?? NaN);

  const secs=[
    {badge:"VOL",  title:"Volume TOP10",      centerTop:"Volume Top10", centerSub:"거래량",  html:list(topBy(mkts,"total_volume"),"vol")},
    {badge:"+24H", title:"24H % TOP10 [USDT]", centerTop:"+24H Gainers", centerSub:"상승률", html:list(topBy(mkts,"price_change_percentage_24h"),"pct")},
    {badge:"F&G",  title:"Fear & Greed",       centerTop:isFinite(fngVal)?String(fngVal):"—", centerSub:"index",
      html:`<div style="margin-bottom:6px">Fear & Greed Index</div>${isFinite(fngVal)?gaugeHTML(fngVal):"—"}`},
    {badge:"BTC",  title:"BTC Market Cap",     centerTop:btc?fmtMoney(btc.market_cap):"—", centerSub:"Market Cap",
      html:`<div>BTC Market Cap</div><div style="margin-top:6px">${btc?fmtMoney(btc.market_cap):"—"}</div>`},
    {badge:"USDT", title:"USDT Market Cap",    centerTop:usdt?fmtMoney(usdt.market_cap):"—", centerSub:"Market Cap",
      html:`<div>USDT Market Cap</div><div style="margin-top:6px">${usdt?fmtMoney(usdt.market_cap):"—"}</div>`},
    {badge:"DOM",  title:"BTC Dominance",      centerTop:dom!=null?dom.toFixed(2)+"%":"—", centerSub:"dominance",
      html:`<div>BTC Dominance</div><div style="margin-top:6px">${dom!=null?dom.toFixed(2)+"%":"—"}</div>`},
  ];
  buildHub(secs);
  $("#cBig").textContent="COSMOS"; $("#cSub").textContent="—";
}

/* ===== Market Table ===== */
function rowHTML(c, idx){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;

  const sym=(c.symbol||'').toUpperCase();
  const rank=c.market_cap_rank ?? (idx+1);

  // name cell clickable → chart.html
  const nameHTML = `
    <div class="mkt-name" data-symbol="${sym}">
      <img src="${c.image}" alt="${sym}">
      <span class="sym">${sym}</span><span class="full">${c.name ?? ''}</span>
    </div>`;

  return `<tr>
    <td class="sticky-rank num">${rank}</td>
    <td class="sticky-name">${nameHTML}</td>
    <td class="num">${fmtPrice(c.current_price)}</td>
    <td class="num hide-m">${fmtPct(p1h)}</td>
    <td class="num">${fmtPct(p24)}</td>
    <td class="num hide-m">${fmtPct(p7d)}</td>
    <td class="num hide-m">${fmtCap(c.market_cap)}</td>
    <td class="num hide-m">${fmtCap(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-id="${c.id}"></canvas></td>
  </tr>`;
}

function drawSparkline(canvas, arr){
  if(!canvas || !Array.isArray(arr) || arr.length<2) return;
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  const min=Math.min(...arr), max=Math.max(...arr);
  const pad=2, sx=w/(arr.length-1);
  ctx.clearRect(0,0,w,h);
  // stroke color: last change up/down
  const up = arr[arr.length-1] >= arr[0];
  ctx.lineWidth=2; ctx.strokeStyle = up ? '#22c55e' : '#ef4444';
  ctx.beginPath();
  arr.forEach((v,i)=>{
    const x=i*sx, y=h-pad - ( (v-min)/(max-min||1) )*(h-pad*2);
    i? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  });
  ctx.stroke();
}

function wireNameClicks(){
  $$("#mkt .mkt-name").forEach(el=>{
    el.addEventListener("click", ()=>{
      const sym = (el.dataset.symbol||"").toUpperCase();
      if(sym) location.href = `/menu/cosmos/chart.html?symbol=${encodeURIComponent(sym)}`;
    });
  });
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
    if(typeof va==="string" && typeof vb==="string") return dir*va.localeCompare(vb);
    return dir*((va??-1)-(vb??-1));
  });

  state.filtered = arr;
  if((state.page-1)*state.perPage >= arr.length) state.page=1;
  renderTable(); renderPager();
}

function renderTable(){
  if(!tbody) return;
  const start=(state.page-1)*state.perPage;
  const items=state.filtered.slice(start,start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join("");

  // sparks
  items.forEach(c=>{
    const el = tbody.querySelector(`canvas[data-id="${c.id}"]`);
    const series = c.sparkline_in_7d?.price || [];
    drawSparkline(el, series);
  });

  // name→chart
  wireNameClicks();
}

function renderPager(){
  if(!pager) return;
  const n=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur=state.page;
  const btn=(i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html="";
  for(let i=1;i<=n;i++){
    if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur); }
    else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; }
  }
  pager.innerHTML=html;
  pager.querySelectorAll("button[data-pg]").forEach(b=>{
    b.addEventListener("click", ()=>{ state.page=Number(b.dataset.pg)||1; renderTable(); renderPager(); });
  });
}

/* header sort */
function wireSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.style.cursor="pointer";
    th.addEventListener("click", ()=>{
      const k=th.dataset.key; if(!k) return;
      if(state.sortKey===k) state.sortDir*=-1; else {state.sortKey=k; state.sortDir=-1;}
      applyFilterSort();
    });
  });
}

/* init */
async function init(){
  table=$("#mkt"); tbody=$("#mktBody"); pager=$("#pager");
  wireSort();
  $("#q").addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

  // initial data
  const mkts=await fetchMarkets();
  state.all = Array.isArray(mkts)? mkts : [];
  applyFilterSort();

  // hub
  initHub();

  // 30s refresh; keep sort/filter/page
  setInterval(async ()=>{
    const mkts2=await fetchMarkets();
    if(Array.isArray(mkts2) && mkts2.length){ state.all=mkts2; applyFilterSort(); }
    initHub();
  }, 30000);
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
