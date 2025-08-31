/* ===== Helpers ===== */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const $=(s,sc=document)=>sc.querySelector(s);
const $$=(s,sc=document)=>Array.from(sc.querySelectorAll(s));
const setHTML=(el,html)=>{(typeof el==="string"?$(el):el).innerHTML=html};
const fmtK=(v)=>v==null||Number.isNaN(v)?"-":"$"+Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const fmtPct=(v)=>{if(v==null||Number.isNaN(v))return "-"; const n=Number(v); return (n>0?"+":"")+n.toFixed(2)+"%";};
const pctClass=(v)=>v>0?"up":v<0?"down":"";
const fmtCap=(v)=>{ if(v==null) return "-"; const a=Math.abs(v);
  if(a>=1e12) return "$"+(v/1e12).toFixed(2)+"T";
  if(a>=1e9)  return "$"+(v/1e9 ).toFixed(2)+"B";
  if(a>=1e6)  return "$"+(v/1e6 ).toFixed(2)+"M";
  return fmtK(v);
};
const sparklineSVG=(arr,w=120,h=28)=>{
  if(!arr||arr.length<2) return "";
  const min=Math.min(...arr),max=Math.max(...arr),span=(max-min)||1;
  const pts=arr.map((p,i)=>`${(i/(arr.length-1))*w},${h-((p-min)/span)*h}`).join(" ");
  const up=arr.at(-1)>=arr[0], st=up?"#22c55e":"#ef4444";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="${st}" stroke-width="2" points="${pts}"/>
  </svg>`;
};

/* ===== DOM Cache ===== */
const table=document.getElementById('mkt');
const tbody=document.getElementById('mktBody');

/* ===== Star field (canvas) ===== */
const StarField=(()=>{
  let cv,ctx,stars=[],W=0,H=0,dpr=1, density=0.8, anim=null;
  const rand=(a,b)=>a+Math.random()*(b-a);
  function build(){
    const target=Math.floor((W*H)/(1200*800)*1000*density);
    if(stars.length<target){
      for(let i=stars.length;i<target;i++) stars.push({x:Math.random()*W,y:Math.random()*H,r:rand(.3,1.1)*dpr,a:rand(.4,.9),tw:rand(.002,.006),ph:Math.random()*Math.PI*2});
    }else if(stars.length>target) stars.splice(target);
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    for(const s of stars){
      s.ph+=s.tw; const a=s.a*(.8+.2*Math.sin(s.ph));
      ctx.globalAlpha=a; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fillStyle="#fff"; ctx.fill();
    }
    ctx.globalAlpha=1;
    anim=requestAnimationFrame(draw);
  }
  function resize(){
    if(!cv) return;
    dpr=window.devicePixelRatio||1;
    const vw=innerWidth,vh=innerHeight; W=Math.floor(vw*dpr); H=Math.floor(vh*dpr);
    cv.width=W; cv.height=H; cv.style.width=vw+"px"; cv.style.height=vh+"px"; build();
  }
  return {
    init(){
      cv=$("#starCanvas"); if(!cv) return; ctx=cv.getContext("2d"); resize(); addEventListener("resize",resize);
      if(!anim) anim=requestAnimationFrame(draw);
      const sr=$("#starRange"); if(sr){ const v=(Number(sr.value)||70)/100; density=clamp(v,0,1); }
    },
    set(v){ density=clamp(v,0,1); build(); }
  };
})();

/* ===== Fetchers with CDN->proxy fallback ===== */
async function fetchJSON(url, alt){
  try{ const r=await fetch(url); if(!r.ok) throw 0; return await r.json(); }
  catch{ if(!alt) throw new Error("fetch failed"); const r2=await fetch(alt); if(!r2.ok) throw new Error("fallback failed"); return await r2.json(); }
}
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){
  const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  return fetchJSON(`https://api.coingecko.com/api/v3/coins/markets?${q}`, `/api/coins/markets?${q}`);
}
async function fetchGlobal(){
  return fetchJSON(`https://api.coingecko.com/api/v3/global`, `/api/global`);
}
async function fetchFNG(){
  return fetchJSON(`https://api.alternative.me/fng/?limit=2`, `/api/fng`);
}
async function fetchBinanceLS(period='1h'){
  const sym='BTCUSDT', q=`symbol=${sym}&period=${period}&limit=1`;
  return fetchJSON(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${q}`, `/api/binance/globalLongShortAccountRatio?${q}`);
}
async function fetchMarketChart(id,days=7){
  const q=`vs_currency=usd&days=${days}`;
  return fetchJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`, `/api/coins/${encodeURIComponent(id)}/market_chart?${q}`);
}

/* ===== State ===== */
const ST={ all:[], filtered:[], page:1, perPage:50, sortKey:"market_cap", sortDir:-1, filterQ:"", lsPeriod:"1h" };

/* ===== Donut (Hub) ===== */
(function Hub(){
  const svg=$("#hubSvg"), centerW=$("#centerW"), centerG=$("#centerG"), panelTitle=$("#panelTitle"), panelContent=$("#panelContent");
  const TAU=Math.PI*2;
  const arcPath=(cx,cy,r0,r1,a0,a1)=>{const p=(r,a)=>[cx+r*Math.cos(a),cy+r*Math.sin(a)], [x0,y0]=p(r1,a0), [x1,y1]=p(r1,a1), [x2,y2]=p(r0,a1), [x3,y3]=p(r0,a0), laf=(a1-a0)>Math.PI?1:0; return `M ${x0} ${y0} A ${r1} ${r1} 0 ${laf} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${laf} 0 ${x3} ${y3} Z`; };

  function setCenter(w,g){ centerW.textContent=w; centerG.textContent=g; }
  function openPanel(title, html){ panelTitle.textContent=title; panelContent.innerHTML=html; }

  function gaugeSVG(pct){ // 0..1
    const a0=Math.PI, a1=0, a=a0+(a1-a0)*pct; // semicircle
    return `
    <div class="gauge">
      <svg viewBox="0 0 200 120">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#ef4444"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/>
          </linearGradient>
        </defs>
        <path d="M20,110 A90,90 0 0 1 180,110" stroke="url(#g1)" stroke-width="16" fill="none" stroke-linecap="round"/>
        <g transform="translate(100,110)">
          <line class="needle" x1="0" y1="0" x2="${80*Math.cos(a-Math.PI)}" y2="${80*Math.sin(a-Math.PI)}" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="8" fill="#fff"/>
        </g>
      </svg>
    </div>`;
  }

  function build(sections){
    svg.innerHTML="";
    const cx=500,cy=500,rI=260,rO=470, segAng=TAU/sections.length, start=-Math.PI/2;

    sections.forEach((s,i)=>{
      const a0=start+segAng*i+0.014, a1=start+segAng*(i+1)-0.014;

      const path=document.createElementNS(svg.namespaceURI,'path');
      path.setAttribute('d', arcPath(cx,cy,rI,rO,a0,a1));
      path.setAttribute('fill', `url(#grad${i})`);
      path.classList.add('hub-seg'); svg.appendChild(path);

      // gradient per sector
      const defs=svg.querySelector('defs') || svg.insertBefore(document.createElementNS(svg.namespaceURI,'defs'), svg.firstChild);
      const grad=document.createElementNS(svg.namespaceURI,'linearGradient'); grad.id=`grad${i}`; grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','1'); grad.setAttribute('y2','1');
      const st1=document.createElementNS(svg.namespaceURI,'stop'); st1.setAttribute('offset','0%'); st1.setAttribute('stop-color', '#7c3aed'); st1.setAttribute('stop-opacity','.58');
      const st2=document.createElementNS(svg.namespaceURI,'stop'); st2.setAttribute('offset','100%'); st2.setAttribute('stop-color','#06b6d4'); st2.setAttribute('stop-opacity','.46');
      grad.appendChild(st1); grad.appendChild(st2); defs.appendChild(grad);

      // big label (no glow, 2x size)
      const mid=(a0+a1)/2, rx=(rI+rO)/2, tx=cx+(rx-28)*Math.cos(mid), ty=cy+(rx-28)*Math.sin(mid)+6;
      const text=document.createElementNS(svg.namespaceURI,'text');
      text.setAttribute('x',tx); text.setAttribute('y',ty); text.setAttribute('text-anchor','middle');
      text.setAttribute('class','hub-badge'); text.textContent=s.badge; svg.appendChild(text);

      const activate=()=>{ $$('.hub-seg',svg).forEach(el=>el.classList.remove('active')); path.classList.add('active'); setCenter(s.centerW, s.centerG); openPanel(s.title, s.panelHTML); };
      path.addEventListener('mouseenter',()=>setCenter(s.centerW, s.centerG));
      path.addEventListener('click',activate); text.addEventListener('click',activate);
    });
  }

  function listHTML(items, kind){
    return `<div style="display:flex;flex-direction:column;gap:6px">` + items.map((c,i)=>{
      const sym=(c.symbol||"").toUpperCase();
      const pc = kind==="vol" ? fmtCap(c.total_volume) : fmtPct(c.price_change_percentage_24h);
      const cls= kind==="vol" ? "" : pctClass(c.price_change_percentage_24h);
      return `<div style="display:grid;grid-template-columns:1.6em 1fr auto;gap:8px;align-items:center">
        <div style="opacity:.7;font-weight:800;text-align:right">${i+1}</div>
        <div style="font-weight:900">${sym}</div>
        <div style="text-align:right" class="${cls}">${pc}</div>
      </div>`;
    }).join("") + `</div>`;
  }

  async function init(){
    try{
      const [markets, global, fngRaw, ls1h, btcChart, usdtChart] = await Promise.all([
        fetchMarkets(), fetchGlobal(), fetchFNG(), fetchBinanceLS('1h'),
        fetchMarketChart('bitcoin', 7), fetchMarketChart('tether', 7)
      ]);

      // datasets
      ST.all = markets;
      const byId = Object.fromEntries(markets.map(m=>[m.id,m]));
      const btc=byId.bitcoin, usdt=byId.tether;
      const dominance = (global?.data?.market_cap_percentage?.btc)||0;

      const gainers = markets.filter(x=>Number.isFinite(x.price_change_percentage_24h)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,10);
      const byVol   = markets.slice().sort((a,b)=> (b.total_volume||0)-(a.total_volume||0)).slice(0,10);

      // long/short
      const lastLS = Array.isArray(ls1h) && ls1h.length ? ls1h.at(-1) : null;
      let longPct=50,shortPct=50,ratio=1;
      if(lastLS && lastLS.longShortRatio){
        ratio=Number(lastLS.longShortRatio)||1;
        shortPct = 100/(1+ratio); longPct=100-shortPct;
      }

      // market cap sparklines
      const btcCapArr = (btcChart?.market_caps||[]).map(x=>x[1]);
      const usdtCapArr= (usdtChart?.market_caps||[]).map(x=>x[1]);

      // sections
      const secs=[
        {
          title:"Long / Short (1H)",
          badge:`${Math.round(longPct)}%`,
          centerW:`${longPct.toFixed(1)} / ${shortPct.toFixed(1)}%`,
          centerG:"롱/숏 (1H)",
          panelHTML: `
            <div>BTCUSDT 포지션 비율</div>
            <div style="margin:10px 0 8px;height:10px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden">
              <div style="width:${clamp(longPct,0,100)}%;height:100%;background:#22c55e"></div>
            </div>
            <div style="display:flex;justify-content:space-between"><div>Long ${longPct.toFixed(1)}%</div><div>Short ${shortPct.toFixed(1)}% · ratio ${ratio.toFixed(2)}</div></div>`
        },
        {
          title:"BTC Dominance",
          badge:`${Math.round(dominance)}%`,
          centerW:`${dominance.toFixed(1)}%`,
          centerG:"BTC 도미넌스",
          panelHTML:`<div>BTC Dominance</div><div style="margin-top:6px">${dominance.toFixed(2)}%</div>`
        },
        {
          title:"Fear & Greed",
          badge: (fngRaw?.data?.[0]?.value) || "—",
          centerW: fngRaw?.data?.[0]?.value || "—",
          centerG: (fngRaw?.data?.[0]?.value_classification) || "F&G",
          panelHTML: `
            <div>Fear &amp; Greed Index</div>
            ${gaugeSVG( Math.max(0, Math.min(1, Number(fngRaw?.data?.[0]?.value||50)/100 )) )}
          `
        },
        {
          title:"BTC Market Cap",
          badge: btc?fmtCap(btc.market_cap):"—",
          centerW: btc?fmtCap(btc.market_cap):"—",
          centerG:"BTC Market Cap",
          panelHTML: `
            <div>BTC Market Cap</div>
            <div style="margin-top:6px">${btc?fmtCap(btc.market_cap):"—"}</div>
            <div style="margin-top:10px">${btcCapArr?.length? sparklineSVG(btcCapArr,300,40):""}</div>
          `
        },
        {
          title:"USDT Market Cap",
          badge: usdt?fmtCap(usdt.market_cap):"—",
          centerW: usdt?fmtCap(usdt.market_cap):"—",
          centerG:"USDT Market Cap",
          panelHTML: `
            <div>USDT Market Cap</div>
            <div style="margin-top:6px">${usdt?fmtCap(usdt.market_cap):"—"}</div>
            <div style="margin-top:10px">${usdtCapArr?.length? sparklineSVG(usdtCapArr,300,40):""}</div>
          `
        },
        {
          title:"24H % TOP10 [USDT]",
          badge:"+24H",
          centerW:"+24H Gainers",
          centerG:"상승률",
          panelHTML:`${listHTML(gainers,'pct')}`
        },
        {
          title:"Volume TOP10",
          badge:"VOL",
          centerW:"Volume Top10",
          centerG:"거래량",
          panelHTML:`${listHTML(byVol,'vol')}`
        }
      ];

      build(secs);
      setCenter("—","COSMOS");
    }catch(e){
      console.error(e);
      setCenter("—","COSMOS");
      openPanel("Error","데이터 로딩 실패");
    }
  }

  Hub.init = init;
})();

/* ===== Market Table ===== */
(function Table(){
  const pagerSel=document.getElementById('pagerSel');
  const getVal=(c,k)=>{
    switch(k){
      case "market_cap": return c.market_cap??-1;
      case "price": return c.current_price??-1;
      case "volume": return c.total_volume??-1;
      case "change1h": return c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? -1;
      case "change24h":return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? -1;
      case "change7d": return c.price_change_percentage_7d_in_currency ?? -1;
      case "rank": return c.market_cap_rank ?? 1e9;
      case "symbol": return (c.symbol||"").toUpperCase();
      default: return 0;
    }
  };
  function rowHTML(c){
    const s7=(c.sparkline_in_7d?.price)||null;
    const sym=(c.symbol||"").toUpperCase();
    return `<tr data-id="${c.id}">
      <td class="rank">${c.market_cap_rank ?? "-"}</td>
      <td class="col coin-cell">
        <img src="${c.image}" alt="${sym}"><span class="coin-sym">${sym}</span><span class="coin-name">${c.name||""}</span>
      </td>
      <td class="right">${fmtK(c.current_price)}</td>
      <td class="right ${pctClass(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h)}">${fmtPct(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h)}</td>
      <td class="right ${pctClass(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h)}">${fmtPct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h)}</td>
      <td class="right ${pctClass(c.price_change_percentage_7d_in_currency)}">${fmtPct(c.price_change_percentage_7d_in_currency)}</td>
      <td class="right">${fmtCap(c.market_cap)}</td>
      <td class="right">${fmtCap(c.total_volume)}</td>
      <td class="right spark">${s7?sparklineSVG(s7,100,28):""}</td>
    </tr>`;
  }
  function render(){
    const s=(ST.page-1)*ST.perPage, e=s+ST.perPage, slice=ST.filtered.slice(s,e);
    setHTML(tbody, slice.map(rowHTML).join("") || `<tr><td colspan="9" class="right">No data</td></tr>`);
  }
  function repage(){
    const pages=Math.max(1, Math.ceil(ST.filtered.length/ST.perPage));
    let html=""; for(let p=1;p<=pages;p++) html+=`<option value="${p}" ${p===ST.page?"selected":""}>${p}</option>`;
    pagerSel.innerHTML=html;
  }
  function resort(){
    const dir=ST.sortDir, k=ST.sortKey;
    const get=c=>getVal(c,k);
    ST.filtered.sort((a,b)=>{const va=get(a), vb=get(b);
      const r=(typeof va==="string" && typeof vb==="string") ? va.localeCompare(vb) : (va>vb?1:va<vb?-1:0); return r*dir;});
  }
  function refilter(){
    const q=ST.filterQ.trim().toLowerCase();
    let arr=ST.all.filter(c=> !q || (c.symbol||"").toLowerCase().includes(q) || (c.name||"").toLowerCase().includes(q));
    ST.filtered=arr; resort(); ST.page=1; render(); repage();
  }

  // wiring
  $("#search").addEventListener("input",(e)=>{ ST.filterQ=e.target.value; refilter(); });
  $("#sortkey").addEventListener("change",(e)=>{ ST.sortKey=e.target.value; refilter(); });
  $("#sortdir").addEventListener("click", (e)=>{ ST.sortDir=ST.sortDir===-1?1:-1; e.currentTarget.textContent=ST.sortDir===-1?"▼":"▲"; refilter(); });
  pagerSel.addEventListener("change",(e)=>{ ST.page=Number(e.target.value)||1; render(); });

  table.querySelector("thead").addEventListener("click",(e)=>{
    const th=e.target.closest("th[data-key]"); if(!th) return;
    const key=th.dataset.key; if(!key) return; if(ST.sortKey===key) ST.sortDir=ST.sortDir===-1?1:-1; else {ST.sortKey=key; ST.sortDir=-1;}
    refilter();
  });

  // row click -> chart page
tbody.addEventListener("click",(e)=>{
    const tr=e.target.closest("tr[data-id]"); if(!tr) return;
    const id=tr.dataset.id; location.href=`./chart.html?id=${encodeURIComponent(id)}`;
  });

  Table.initData = async function(){
    try{
      const [markets] = await Promise.all([fetchMarkets()]);
      ST.all = markets; refilter();
  }catch(e){ console.error(e); setHTML(tbody, `<tr><td colspan="9">Load failed</td></tr>`); }
  };
})();

/* ===== Boot ===== */
async function init(){
  // star field
  StarField.init();
    const sr=$("#starRange");
  StarField.set((Number(sr.value)||70)/100);
  sr.addEventListener("input", e=> StarField.set((Number(e.target.value)||0)/100));

  // data
  await Table.initData();
  await Hub.init();

  // periodic refresh (markets)
  let vis=document.visibilityState==="visible";
  document.addEventListener("visibilitychange",()=>vis=document.visibilityState==="visible");
  setInterval(async ()=>{ if(!vis) return; try{
    const mkts=await fetchMarkets(); ST.all=mkts; // refresh table only
    const ev=new Event("input"); $("#search").dispatchEvent(ev); // re-filter
  }catch{} }, 30000);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", init);
}else{
  init();
}
