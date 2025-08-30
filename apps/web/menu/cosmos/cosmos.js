/* ===== COSMOS JS – compact ticker, mobile 2/2/2/1, gauges ===== */
(function(){
'use strict';

/* --- locale guards --- */
(function(){
  var origToLS = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locale, opts) {
    if (opts && typeof opts === "object") {
      var min = opts.minimumFractionDigits, max = opts.maximumFractionDigits;
      if (!Number.isFinite(min)) min=undefined; if (!Number.isFinite(max)) max=undefined;
      if (min!==undefined) min=Math.min(20,Math.max(0,min));
      if (max!==undefined) max=Math.min(20,Math.max(0,max));
      if (min!==undefined && max!==undefined && max<min) max=min;
      opts = Object.assign({},opts,(min!==undefined?{minimumFractionDigits:min}:{}) ,(max!==undefined?{maximumFractionDigits:max}:{}) );
    }
    return origToLS.call(this, locale || "en-US", opts);
  };
})();

/* --- utils --- */
function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
function safeLocale(num,minFD,maxFD){
  var min=Number.isFinite(minFD)?clamp(minFD,0,20):0;
  var max=Number.isFinite(maxFD)?clamp(maxFD,0,20):2;
  if(max<min) max=min;
  try{return Number(num??0).toLocaleString('en-US',{minimumFractionDigits:min,maximumFractionDigits:max});}
  catch{return String(Number(num??0).toFixed(max));}
}
function fmtPrice(v){
  if(v==null||Number.isNaN(v)) return "-";
  var d; if(v>=100)d=2; else if(v>=1)d=4; else if(v>0)d=Math.ceil(Math.abs(Math.log10(v)))+2; else d=2;
  return safeLocale(v,0,clamp(d,0,8));
}
function abbrUSD(n){
  n=Number(n||0); var a=Math.abs(n);
  if(a>=1e12) return (n/1e12).toFixed(2)+'T';
  if(a>=1e9) return (n/1e9).toFixed(2)+'B';
  if(a>=1e6) return (n/1e6).toFixed(2)+'M';
  if(a>=1e3) return (n/1e3).toFixed(2)+'K';
  return safeLocale(n,0,0);
}
function fmtNum(v,max){ if(v==null||Number.isNaN(v)) return "-"; return safeLocale(v,0,clamp(max??2,0,8)); }
function fmtPct(v){
  if(v==null||Number.isNaN(v)) return "-";
  var n=Number(v); var sign=n>0?"+":""; var cls=n>0?"up":n<0?"down":"";
  return '<span class="'+cls+'">'+sign+n.toFixed(2)+'%</span>';
}
function sparklineSVGFilled(arr,w,h){
  if(!arr||arr.length<2) return "-"; w=w||420; h=h||90;
  var min=Math.min.apply(null,arr), max=Math.max.apply(null,arr), span=(max-min)||1;
  function y(v){return h-((v-min)/span)*h;}
  var pts=arr.map(function(p,i){return (i/(arr.length-1))*w+','+y(p);}).join(' ');
  var up=arr[arr.length-1]>=arr[0]; var color=up?"#28e07a":"#ff5b6e";
  return '<svg width="100%" height="100%" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
    '<polyline fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" points="'+pts+'"/>'+
    '<polygon points="0,'+h+' '+pts+' '+w+','+h+'" fill="'+color+'" opacity=".12"/></svg>';
}
function sparklineSVG(arr,w,h){
  if(!arr||arr.length<2) return "-"; w=w||100; h=h||24;
  var min=Math.min.apply(null,arr), max=Math.max.apply(null,arr), span=(max-min)||1;
  var pts=arr.map(function(p,i){return (i/(arr.length-1))*w+','+(h-((p-min)/span)*h);}).join(' ');
  var up=arr[arr.length-1]>=arr[0]; var color=up?"#28e07a":"#ff5b6e";
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline fill="none" stroke="'+color+'" stroke-width="2" points="'+pts+'"/></svg>';
}
var $=function(s,sc){return (sc||document).querySelector(s);}
var $$=function(s,sc){return Array.from((sc||document).querySelectorAll(s));}
function safeSetHTML(sel,html){var el=typeof sel==="string"?$(sel):sel; if(el) el.innerHTML=html;}

/* --- fetchers (직접우선 → 프록시백업) --- */
async function fetchMarkets({vs="usd",perPage=200,page=1}={}){
  const q=`vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  try{const r=await fetch(`https://api.coingecko.com/api/v3/coins/markets?${q}`,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();}
  catch{const r2=await fetch(`/api/coins/markets?${q}`,{cache:'no-store'}); if(!r2.ok) throw new Error("markets failed"); return await r2.json();}
}
async function fetchGlobal(){
  try{const r=await fetch('https://api.coingecko.com/api/v3/global',{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();}
  catch{const r2=await fetch('/api/global',{cache:'no-store'}); if(!r2.ok) throw new Error("global failed"); return await r2.json();}
}
async function fetchFNG(){
  try{const r=await fetch('https://api.alternative.me/fng/?limit=1&format=json&date_format=iso',{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();}
  catch{try{const r2=await fetch('/api/fng',{cache:'no-store'}); if(!r2.ok) throw 0; return await r2.json();}catch(e){return null;}}
}
async function fetchLongShort(){
  const qs='symbol=BTCUSDT&period=1h&limit=1';
  try{const r=await fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?'+qs,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();}
  catch{try{const r2=await fetch('/api/binance/globalLongShortAccountRatio?'+qs,{cache:'no-store'}); if(!r2.ok) throw 0; return await r2.json();}catch(e){return null;}}
}

/* --- state --- */
var state={all:[],filtered:[],page:1,perPage:50,sortKey:'market_cap',sortDir:-1};

/* --- table row (티커만) --- */
function buildRowHTML(c){
  var id=c.id; var price=fmtPrice(c.current_price);
  var s7=(c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  var sym=(c.symbol||"").toUpperCase(); var href=`./chart.html?id=${encodeURIComponent(id)}`;

  var ch1h=(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null);
  var ch24=(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null);
  var ch7d=(c.price_change_percentage_7d_in_currency ?? null);

  return `<tr class="row">
    <td class="row-index" data-label="순위">${c.market_cap_rank ?? "-"}</td>
    <td class="coin-cell coin-sticky" data-label="코인">
      <img class="coin-img" src="${c.image}" alt="${sym}">
      <a class="coin-name" href="${href}" title="${sym} 전체 차트">${sym}</a>
    </td>
    <td class="text-right" data-label="시세">$${price}</td>
    <td class="text-right" data-label="1시간">${fmtPct(ch1h)}</td>
    <td class="text-right" data-label="24시간">${fmtPct(ch24)}</td>
    <td class="text-right" data-label="7일">${fmtPct(ch7d)}</td>
    <td class="text-right" data-label="시가총액">${abbrUSD(c.market_cap)}</td>
    <td class="text-right" data-label="거래량">${abbrUSD(c.total_volume)}</td>
    <td class="text-right spark-col" data-label="7일 차트"><span class="spark">${s7 ? sparklineSVG(s7) : "-"}</span></td>
  </tr>`;
}
function renderTableSlice(rows){
  var tbody=$("#cosmos-tbody"); if(!tbody) return;
  var start=(state.page-1)*state.perPage, end=start+state.perPage;
  var slice=rows.slice(start,end);
  safeSetHTML(tbody, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);
}

/* --- sort/filter/paging --- */
function applySortFilter(){
  var q=($("#search").value||"").trim().toLowerCase();
  state.filtered=state.all.filter(function(c){
    if(!q) return true;
    var sym=(c.symbol||"").toLowerCase(), nm=(c.name||"").toLowerCase();
    return sym.includes(q)||nm.includes(q);
  });
  var dir=state.sortDir, k=state.sortKey;
  var get=function(c){
    switch(k){
      case "market_cap": return c.market_cap ?? -1;
      case "price": return c.current_price ?? -1;
      case "volume": return c.total_volume ?? -1;
      case "change1h": return c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? -1;
      case "change24h": return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? -1;
      case "change7d": return c.price_change_percentage_7d_in_currency ?? -1;
      case "rank": return c.market_cap_rank ?? 1e9;
      default: return 0;
    }
  };
  state.filtered.sort(function(a,b){var va=get(a), vb=get(b); return (va>vb?1:va<vb?-1:0)*dir;});
  var sel=$("#page"); var totalPages=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  sel.innerHTML=Array.from({length:totalPages},function(_,i){var s=i*state.perPage+1, e=Math.min(state.filtered.length,(i+1)*state.perPage); return `<option value="${i+1}">${s}~${e}</option>`;}).join("");
  if(state.page>totalPages) state.page=totalPages;
  renderTableSlice(state.filtered);
}

/* --- KPI & lists --- */
function setFNGStyle(val){
  var card=$("#card-fng"); if(!card) return;
  card.classList.remove('low','mid','high');
  if(val<=40) card.classList.add('low');
  else if(val<=60) card.classList.add('mid');
  else card.classList.add('high');
}
function updateLongShortGauge(longPct, shortPct){
  var g=$("#ls-gauge"); if(!g) return;
  g.querySelector('.long').style.width = clamp(longPct,0,100)+'%';
  g.querySelector('.short').style.width= clamp(shortPct,0,100)+'%';
}
function updateFngGauge(val){
  var f=$("#fng-fill"); if(f) f.style.width = clamp(val,0,100)+'%';
  setFNGStyle(val);
}

function renderKPIs(markets, global, fng, longshort){
  var btc = markets.find(function(x){return x.id==="bitcoin";});
  var usdt= markets.find(function(x){return x.id==="tether";});
  var total = (global&&global.data&&global.data.total_market_cap&&global.data.total_market_cap.usd) ? global.data.total_market_cap.usd : null;

  safeSetHTML("#kpi-btc-mcap", btc&&btc.market_cap ? "$"+abbrUSD(btc.market_cap) : "-");
  safeSetHTML("#kpi-usdt-mcap", usdt&&usdt.market_cap ? "$"+abbrUSD(usdt.market_cap) : "-");
  var dom = (btc&&btc.market_cap&&total) ? (btc.market_cap/total*100) : null;
  safeSetHTML("#kpi-dominance", dom!=null ? fmtNum(dom,2)+"%" : "-");

  // fear & greed
  if(fng && fng.data && fng.data[0]){
    var v=fng.data[0], val=Number(v.value||0);
    safeSetHTML("#kpi-fng", `${val} / ${v.value_classification||""}`);
    safeSetHTML("#kpi-fng-sub", `Alternative.me · ${v.timestamp || v.time_until_update || ""}`);
    updateFngGauge(val);
  }else{
    safeSetHTML("#kpi-fng","연동 예정"); safeSetHTML("#kpi-fng-sub","Alternative.me");
  }

  // long/short
  var ratio = null;
  if(longshort && Array.isArray(longshort) && longshort[0] && longshort[0].longShortRatio){
    ratio = Number(longshort[0].longShortRatio);
  }else if(longshort && longshort.data && longshort.data[0] && longshort.data[0].longShortRatio){
    ratio = Number(longshort.data[0].longShortRatio);
  }
  if(ratio!=null && isFinite(ratio)){
    var longPct = ratio/(1+ratio)*100, shortPct = 100-longPct;
    safeSetHTML("#kpi-longshort", `${longPct.toFixed(1)}% / ${shortPct.toFixed(1)}%`);
    safeSetHTML("#kpi-longshort-sub", `BTCUSDT · ratio ${ratio.toFixed(2)}`);
    updateLongShortGauge(longPct, shortPct);
  }else{
    safeSetHTML("#kpi-longshort","-"); safeSetHTML("#kpi-longshort-sub","Binance 공개지표");
  }
}

function renderRightLists(markets){
  // TOP 10 gainers (24h)
  var gainers = markets.filter(function(x){return Number.isFinite(x.price_change_percentage_24h);})
    .sort(function(a,b){return b.price_change_percentage_24h - a.price_change_percentage_24h;})
    .slice(0,10);
  safeSetHTML("#list-gainers", gainers.map(function(c,i){
    var sym=(c.symbol||"").toUpperCase();
    var pct=c.price_change_percentage_24h; var cls=pct>=0?"up":"down";
    return '<div class="row" style="display:grid;grid-template-columns:2.2em 4.4em 1fr;align-items:center;font-size:13.5px;">'
      +'<div class="rank" style="text-align:right;opacity:.7;font-weight:700">'+(i+1)+'.</div>'
      +'<div class="sym" style="font-weight:800;letter-spacing:.02em">'+sym+'</div>'
      +'<div class="value '+cls+'" style="justify-self:end;font-weight:700">'+pct.toFixed(2)+'%</div>'
      +'</div>';
  }).join(""));

  // volume ranking TOP 10
  var vol = markets.slice().sort(function(a,b){return (b.total_volume||0)-(a.total_volume||0);}).slice(0,10);
  safeSetHTML("#list-volume", vol.map(function(c,i){
    var sym=(c.symbol||"").toUpperCase();
    return '<div class="row" style="display:grid;grid-template-columns:2.2em 4.4em 1fr;align-items:center;font-size:13.5px;">'
      +'<div class="rank" style="text-align:right;opacity:.7;font-weight:700">'+(i+1)+'.</div>'
      +'<div class="sym" style="font-weight:800;letter-spacing:.02em">'+sym+'</div>'
      +'<div class="value" style="justify-self:end;font-weight:700">$'+abbrUSD(c.total_volume)+'</div>'
      +'</div>';
  }).join(""));
}

/* --- header mini charts --- */
async function renderHeaderMinis(markets){
  try{
    var btc = markets.find(function(x){return x.id==="bitcoin";});
    if(btc && btc.market_cap && btc.current_price && btc.sparkline_in_7d && Array.isArray(btc.sparkline_in_7d.price)){
      var supply=btc.market_cap/btc.current_price;
      var caps=btc.sparkline_in_7d.price.map(function(p){return p*supply;});
      var el=$("#mini-btc"); if(el) el.innerHTML=sparklineSVGFilled(caps,420,90);
    }
  }catch(e){}
  try{
    var usdt = markets.find(function(x){return x.id==="tether";});
    if(usdt && usdt.market_cap && usdt.current_price && usdt.sparkline_in_7d && Array.isArray(usdt.sparkline_in_7d.price)){
      var supply=usdt.market_cap/usdt.current_price;
      var caps=usdt.sparkline_in_7d.price.map(function(p){return p*supply;});
      var el=$("#mini-usdt"); if(el) el.innerHTML=sparklineSVGFilled(caps,420,90);
    }
  }catch(e){}
}

/* --- init --- */
async function init(){
  try{
    const [markets, global, fng, longshort] = await Promise.all([
      fetchMarkets(), fetchGlobal(), fetchFNG(), fetchLongShort()
    ]);
    state.all=markets;
    renderKPIs(markets, global, fng, longshort);
    renderHeaderMinis(markets);
    renderRightLists(markets);
    applySortFilter();
  }catch(e){
    console.error(e);
    safeSetHTML("#cosmos-tbody", `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", function(){
  $("#search").addEventListener("input", function(){ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", function(e){ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", function(e){
    state.sortDir = state.sortDir===-1 ? 1 : -1;
    e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲";
    applySortFilter();
  });
  $("#page").addEventListener("change", function(e){ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });

  init();
  setInterval(init, 30000);
});

window._cosmos={state,init};
})();
