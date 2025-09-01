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
