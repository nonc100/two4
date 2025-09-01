/* =========================
   COSMOS CORE (stable)
   ========================= */

/* ---- DOM refs ---- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---- Number utils ---- */
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const fmtMoney=n=>{
  if(n==null||isNaN(n))return"-";
  const a=Math.abs(n);
  if(a>=1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
};
const fmtPrice=n=> n==null||isNaN(n) ? '-' : '$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const fmtPct =n=>{
  if(n==null||isNaN(n)) return '-';
  const s=n>=0?'up':'down';
  const t=(n>=0?'+':'')+n.toFixed(2)+'%';
  return `<span class="pct ${s}">${t}</span>`;
};

/* ---- State ---- */
const state={
  all:[], filtered:[],
  sortKey:"market_cap", sortDir:-1,
  page:1, perPage:50
};

/* =========================
   ⭐ StarField (canvas)
   ========================= */
const StarField=(()=>{
  let cv,ctx,stars=[],intensity=.8,animId=null,W=0,H=0,dpr=1;
  const D=260, TW_MIN=.002, TW_MAX=.006, R_MIN=.6, R_MAX=1.8;
  const rand=(a,b)=>a+Math.random()*(b-a);
  function resize(){
    if(!cv) return; dpr=window.devicePixelRatio||1;
    const vw=innerWidth, vh=innerHeight;
    W=Math.floor(vw*dpr); H=Math.floor(vh*dpr);
    cv.width=W; cv.height=H; cv.style.width=vw+"px"; cv.style.height=vh+"px";
    build();
  }
  function build(){
    const area=(W*H)/(dpr*dpr);
    const target=Math.floor(area/100000*D*intensity); // 면적 비례 별 수
    const cur=stars.length;
    if(cur<target){
      for(let i=cur;i<target;i++){
        stars.push({x:Math.random()*W,y:Math.random()*H,r:rand(R_MIN,R_MAX)*dpr,a:rand(.5,.95),tw:rand(TW_MIN,TW_MAX),ph:Math.random()*Math.PI*2});
      }
    }else if(cur>target){ stars.splice(target); }
  }
  function loop(){
    if(!ctx) return;
    ctx.clearRect(0,0,W,H);
    const base=intensity;
    for(const s of stars){
      s.ph+=s.tw;
      const a=base*(.85+.15*Math.sin(s.ph));
      ctx.globalAlpha=a*s.a;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle="#fff"; ctx.fill();
    }
    ctx.globalAlpha=1;
    animId=requestAnimationFrame(loop);
  }
  function setIntensity(v){
    intensity=Math.max(0,Math.min(1,v));
    build();
    if(intensity>0&&!animId) animId=requestAnimationFrame(loop);
    if(intensity===0&&animId){ cancelAnimationFrame(animId); animId=null; ctx.clearRect(0,0,W,H); }
  }
  function init(){
    cv=$("#whiteStars"); if(!cv) return;
    ctx=cv.getContext("2d"); resize(); addEventListener("resize",resize);
  }
  return {init,setIntensity};
})();

/* ---- Star slider wiring ---- */
(function(){
  const r=$("#starRange");
  if(!r) return;
  const apply=v=>{ const n=clamp(v/100,0,1); document.documentElement.style.setProperty("--starVis", String(n)); StarField.setIntensity(n); };
  r.addEventListener("input",e=>apply(e.target.value));
})();

/* =========================
   Data fetchers
   ========================= */
async function fetchMarkets(page=1,per=250){
  const base="https://api.coingecko.com/api/v3/coins/markets";
  const q=`vs_currency=usd&order=market_cap_desc&per_page=${per}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  try{
    const r=await fetch(`${base}?${q}`);
    if(!r.ok) throw 0;
    return await r.json();
  }catch(e){ console.warn("markets fail p"+page); return []; }
}
async function fetchAllMarkets(){
  const [p1,p2]=await Promise.all([fetchMarkets(1,250), fetchMarkets(2,250)]);
  return [...p1,...p2]; // 최대 500개
}
async function fetchGlobal(){
  try{ const r=await fetch("https://api.coingecko.com/api/v3/global");
    if(!r.ok) throw 0; return await r.json();
  }catch{ return null; }
}
async function fetchFNG(){
  try{ const r=await fetch("https://api.alternative.me/fng/?limit=1&format=json");
    if(!r.ok) throw 0; return await r.json();
  }catch{ return null; }
}

/* =========================
   HUB (Donut)
   ========================= */
function gaugeHTML(val){
  const v=clamp(Number(val)||0,0,100);
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
    path.setAttribute("fill","rgba(255,255,255,.12)"); // 투명 섹터
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
  const mkts = state.all;
  if(!mkts || !mkts.length){ // 초기 데이터 없으면 한 번 더 시도
    $("#hubBig").textContent="COSMOS"; $("#hubSub").textContent="—";
    $("#hubTitle").textContent="—"; $("#hubBody").textContent="Loading…";
    return;
  }
  const [global,fng]=await Promise.all([fetchGlobal(),fetchFNG()]);
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
  const byId=Object.fromEntries(mkts.map(m=>[m.id,m])); const btc=byId.bitcoin||null, usdt=byId.tether||null;
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

/* =========================
   Table
   ========================= */
function rowHTML(c, i){
  const p1h = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h;
  const p24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
  const p7d = c.price_change_percentage_7d_in_currency ?? c.price_change_percentage_7d;
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
    <td class="num hide-m">${fmtPct(p1h)}</td>
    <td class="num">${fmtPct(p24)}</td>
    <td class="num hide-m">${fmtPct(p7d)}</td>
    <td class="num hide-m">${fmtMoney(c.market_cap)}</td>
    <td class="num hide-m">${fmtMoney(c.total_volume)}</td>
    <td class="spark"><canvas width="120" height="28" data-spark-id="${c.id}"></canvas></td>
  </tr>`;
}
function applyFilterSort(){
  const q = ($("#q").value||"").toLowerCase();
  let arr = state.all.filter(c=> !q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
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
  state.filtered=arr;
  if((state.page-1)*state.perPage >= arr.length) state.page=1;
  renderTable(); renderPager();
}
function renderTable(){
  const tbody=$("#mktBody");
  const start=(state.page-1)*state.perPage;
  const items=state.filtered.slice(start, start+state.perPage);
  tbody.innerHTML = items.map((c,i)=>rowHTML(c,start+i)).join('');
  // sparklines
  drawSparks(items);
  // 행 클릭 → chart.html
  tbody.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.addEventListener("click", ()=>{
      const id=tr.getAttribute("data-id");
      if(id) location.href=`/menu/cosmos/chart.html?id=${encodeURIComponent(id)}`;
    });
  });
}
function renderPager(){
  const el=$("#pager"); if(!el) return;
  const n=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  const cur=state.page;
  const btn=(i,lab=String(i),dis=false,sel=false)=>`<button ${dis?"disabled":""} data-pg="${i}" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:${sel?"rgba(255,255,255,.16)":"rgba(255,255,255,.06)"};color:#e8eefc">${lab}</button>`;
  let html=""; for(let i=1;i<=n;i++){ if(i<=8 || i>n-2 || Math.abs(i-cur)<=2){ html+=btn(i,String(i),false,i===cur);} else if(!html.endsWith("…")){ html+="<span style='opacity:.6;padding:0 6px'>…</span>"; } }
  el.innerHTML=html;
  el.querySelectorAll("button[data-pg]").forEach(b=> b.addEventListener("click",()=>{ state.page=Number(b.dataset.pg)||1; renderTable(); renderPager(); }));
}
/* header sort */
(function wireSort(){
  $$("#mkt thead th.th-sort").forEach(th=>{
    th.style.cursor="pointer";
    th.addEventListener("click", ()=>{
      const k=th.dataset.key; if(!k) return;
      if(state.sortKey===k) state.sortDir*=-1; else { state.sortKey=k; state.sortDir=-1; }
      applyFilterSort();
    });
  });
})();
/* sparkline */
function drawSparks(items){
  items.forEach(c=>{
    const cv = document.querySelector(`canvas[data-spark-id="${c.id}"]`);
    const arr=(c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
    if(!cv || !arr || arr.length<2) return;
    const ctx=cv.getContext("2d"); const w=cv.width, h=cv.height;
    ctx.clearRect(0,0,w,h);
    const min=Math.min(...arr), max=Math.max(...arr), span=(max-min)||1;
    const up = arr[arr.length-1] >= arr[0]; ctx.lineWidth=2; ctx.strokeStyle = up?"#22c55e":"#ef4444";
    ctx.beginPath();
    arr.forEach((v,i)=>{
      const x=(i/(arr.length-1))*w, y=h-((v-min)/span)*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  });
}

/* =========================
   Init
   ========================= */
async function init(){
  StarField.init(); // ⭐ 별 시작

  $("#q").addEventListener("input", ()=>{ state.page=1; applyFilterSort(); });

  // 데이터 로드
  const mkts = await fetchAllMarkets();
  state.all = Array.isArray(mkts)? mkts : [];
  applyFilterSort();

  // 허브 초기 렌더/갱신
  await initHub();
  setInterval(async ()=>{
    const mkts2 = await fetchAllMarkets();
    if(Array.isArray(mkts2) && mkts2.length){ state.all=mkts2; applyFilterSort(); }
    initHub();
  }, 30000);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
else init();
