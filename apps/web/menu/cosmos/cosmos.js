/* ===== COSMOS JS — ES5-safe (no ?? / ?.) ===== */

/* --- Locale guards --- */
(function(){
  var origToLS = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locale, opts) {
    if (opts && typeof opts === "object") {
      var min = opts.minimumFractionDigits;
      var max = opts.maximumFractionDigits;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = Object.assign({}, opts,
        (min !== undefined ? { minimumFractionDigits: min } : {}),
        (max !== undefined ? { maximumFractionDigits: max } : {}));
    }
    return origToLS.call(this, locale || "en-US", opts);
  };
  var OrigNF = Intl.NumberFormat;
  Intl.NumberFormat = function (locale, opts) {
    if (opts && typeof opts === "object") {
      var min = opts.minimumFractionDigits;
      var max = opts.maximumFractionDigits;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = Object.assign({}, opts,
        (min !== undefined ? { minimumFractionDigits: min } : {}),
        (max !== undefined ? { maximumFractionDigits: max } : {}));
    }
    return new OrigNF(locale || "en-US", opts);
  };
})();

/* --- helpers --- */
function nz(v, fb){ return (v===undefined || v===null) ? fb : v; }
function clamp(n,a,b){ return Math.min(b, Math.max(a, n)); }
function safeLocale(num,minFD,maxFD){
  var min = Number.isFinite(minFD) ? clamp(minFD,0,20) : 0;
  var max = Number.isFinite(maxFD) ? clamp(maxFD,0,20) : 2;
  if(max<min) max=min;
  try{ return Number(nz(num,0)).toLocaleString('en-US',{minimumFractionDigits:min,maximumFractionDigits:max}); }
  catch(e){ return String(Number(nz(num,0)).toFixed(max)); }
}
function fmtPrice(v){
  if(v==null || Number.isNaN(v)) return "-";
  var d;
  if(v>=100) d=2;
  else if(v>=1) d=4;
  else if(v>0) d=Math.ceil(Math.abs(Math.log10(v)))+2;
  else d=2;
  return safeLocale(v,0,clamp(d,0,8));
}
function fmtNum(v,max){ if(v==null||Number.isNaN(v)) return "-"; return safeLocale(v,0,clamp(nz(max,2),0,8)); }
function fmtPct(v){
  if(v==null||Number.isNaN(v)) return "-";
  var n=Number(v); var sign=n>0?"+":""; var cls=n>0?"up":(n<0?"down":"");
  return '<span class="'+cls+'">'+sign+n.toFixed(2)+'%</span>';
}

function sparklineSVGFilled(arr,w,h){
  if(!arr||arr.length<2) return "-";
  w = w||400; h=h||88;
  var min=Math.min.apply(null,arr), max=Math.max.apply(null,arr), span=(max-min)||1;
  function y(v){ return h-((v-min)/span)*h; }
  var pts=arr.map(function(p,i){ return (i/(arr.length-1))*w+','+y(p); }).join(' ');
  var up=arr[arr.length-1] >= arr[0]; var color=up?"#28e07a":"#ff5b6e";
  return '<svg width="100%" height="100%" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'
    +'<polyline fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" points="'+pts+'"/>'
    +'<polygon points="0,'+h+' '+pts+' '+w+','+h+'" fill="'+color+'" opacity="0.12"/>'
    +'</svg>';
}
function sparklineSVG(arr,w,h){
  if(!arr||arr.length<2) return "-";
  w=w||100; h=h||24;
  var min=Math.min.apply(null,arr), max=Math.max.apply(null,arr), span=(max-min)||1;
  var pts=arr.map(function(p,i){ return (i/(arr.length-1))*w+','+(h-((p-min)/span)*h); }).join(' ');
  var up=arr[arr.length-1] >= arr[0]; var color=up?"#28e07a":"#ff5b6e";
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline fill="none" stroke="'+color+'" stroke-width="2" points="'+pts+'"/></svg>';
}
var $ = function(s,sc){ return (sc||document).querySelector(s); };
var $$ = function(s,sc){ return Array.prototype.slice.call((sc||document).querySelectorAll(s)); };
function safeSetHTML(sel,html){ var el=typeof sel==="string"?$(sel):sel; if(el) el.innerHTML=html; }

/* --- Fetchers: proxy first --- */
async function fetchMarkets(opts){
  opts = opts || {};
  var vs = nz(opts.vs,"usd"), perPage = nz(opts.perPage,200), page = nz(opts.page,1);
  var q='vs_currency='+vs+'&order=market_cap_desc&per_page='+perPage+'&page='+page+'&sparkline=true&price_change_percentage=1h,24h,7d';
  try{
    var r = await fetch('/api/coins/markets?'+q,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();
  }catch(e){
    var r2 = await fetch('https://api.coingecko.com/api/v3/coins/markets?'+q,{cache:'no-store'}); if(!r2.ok) throw new Error('markets failed'); return await r2.json();
  }
}
async function fetchGlobal(){
  try{
    var r = await fetch('/api/global',{cache:'no-store'}); if(!r.ok) throw 0; return await r.json();
  }catch(e){
    var r2 = await fetch('https://api.coingecko.com/api/v3/global',{cache:'no-store'}); if(!r2.ok) throw new Error('global failed'); return await r2.json();
  }
}

/* --- State --- */
var state = { all:[], filtered:[], page:1, perPage:50, sortKey:'market_cap', sortDir:-1 };

/* --- Table Row: no ?? / ?. --- */
function buildRowHTML(c){
  var id = (c && c.id) ? c.id : "";
  var price = fmtPrice(c.current_price);
  var s7Arr = (c && c.sparkline_in_7d && Array.isArray(c.sparkline_in_7d.price)) ? c.sparkline_in_7d.price : null;
  var sym = ((c && c.symbol) ? c.symbol : "").toUpperCase();
  var href = "./chart.html?id=" + encodeURIComponent(id);

  var ch1h = (c && (c.price_change_percentage_1h_in_currency != null
                    ? c.price_change_percentage_1h_in_currency
                    : c.price_change_percentage_1h));
  var ch24 = (c && (c.price_change_percentage_24h_in_currency != null
                    ? c.price_change_percentage_24h_in_currency
                    : c.price_change_percentage_24h));
  var ch7d = (c && c.price_change_percentage_7d_in_currency != null)
              ? c.price_change_percentage_7d_in_currency
              : null;

  return ''+
  '<tr class="row">'+
    '<td class="row-index" data-label="순위">'+ (c && c.market_cap_rank!=null ? c.market_cap_rank : '-') +'</td>'+
    '<td class="coin-cell" data-label="코인">'+
      '<img class="coin-img" src="'+ (c.image||'') +'" alt="'+ sym +'">'+
      '<a class="coin-name" href="'+ href +'" title="전체 차트 보기">'+ sym +'</a>'+
      '<span class="coin-sym">'+ (c.name||'') +'</span>'+
    '</td>'+
    '<td class="text-right" data-label="시세">$'+ price +'</td>'+
    '<td class="text-right" data-label="1시간">'+ fmtPct(ch1h) +'</td>'+
    '<td class="text-right" data-label="24시간">'+ fmtPct(ch24) +'</td>'+
    '<td class="text-right" data-label="7일">'+ fmtPct(ch7d) +'</td>'+
    '<td class="text-right" data-label="시가총액">$'+ fmtNum(c.market_cap,0) +'</td>'+
    '<td class="text-right" data-label="거래량">$'+ fmtNum(c.total_volume,0) +'</td>'+
    '<td class="text-right spark-col" data-label="7일 차트"><span class="spark">'+ (s7Arr ? sparklineSVG(s7Arr) : '-') +'</span></td>'+
  '</tr>';
}
function renderTableSlice(rows){
  var tb=$("#cosmos-tbody"); if(!tb) return;
  var s=(state.page-1)*state.perPage, e=s+state.perPage;
  var slice=rows.slice(s,e);
  safeSetHTML(tb, slice.map(buildRowHTML).join("") || '<tr><td colspan="9" class="text-center">데이터 없음</td></tr>');
}

/* --- Header minis (BTC/USDT from markets) --- */
async function renderHeaderMinis(markets){
  try{
    var btc = markets.find(function(x){ return x.id==="bitcoin"; });
    if (btc && btc.market_cap && btc.current_price && btc.sparkline_in_7d && Array.isArray(btc.sparkline_in_7d.price)) {
      var supplyB = btc.market_cap / btc.current_price;
      var capsB = btc.sparkline_in_7d.price.map(function(p){ return p*supplyB; });
      var elB = $("#mini-btc"); if (elB && capsB.length>1) elB.innerHTML = sparklineSVGFilled(capsB,400,88);
    }
  }catch(e){}
  try{
    var usdt = markets.find(function(x){ return x.id==="tether"; });
    if (usdt && usdt.market_cap && usdt.current_price && usdt.sparkline_in_7d && Array.isArray(usdt.sparkline_in_7d.price)) {
      var supplyU = usdt.market_cap / usdt.current_price;
      var capsU = usdt.sparkline_in_7d.price.map(function(p){ return p*supplyU; });
      var elU = $("#mini-usdt"); if (elU && capsU.length>1) elU.innerHTML = sparklineSVGFilled(capsU,400,88);
    }
  }catch(e){}
}

/* --- KPIs / Lists --- */
function renderKPIs(markets, global){
  var btc = markets.find(function(x){return x.id==="bitcoin";});
  var usdt = markets.find(function(x){return x.id==="tether";});
  var total = (global && global.data && global.data.total_market_cap && global.data.total_market_cap.usd)
    ? global.data.total_market_cap.usd
    : markets.reduce(function(s,c){ return s + (c.market_cap||0); }, 0);
  var btcCap = btc ? btc.market_cap : null;
  var usdtCap = usdt ? usdt.market_cap : null;
  var dom = (btcCap && total) ? (btcCap/total*100) : null;
  safeSetHTML("#kpi-btc-mcap", btcCap ? "$"+fmtNum(btcCap,0) : "-");
  safeSetHTML("#kpi-usdt-mcap", usdtCap ? "$"+fmtNum(usdtCap,0) : "-");
  safeSetHTML("#kpi-dominance", dom!=null ? fmtNum(dom,2)+"%" : "-");
}
function renderRightLists(markets){
  var gainers = markets.filter(function(x){ return Number.isFinite(x.price_change_percentage_24h); })
    .sort(function(a,b){ return b.price_change_percentage_24h - a.price_change_percentage_24h; })
    .slice(0,7);
  safeSetHTML("#list-gainers", gainers.map(function(c,i){
    var sym=(c.symbol||"").toUpperCase();
    var pct=c.price_change_percentage_24h; var cls=pct>=0?"up":"down";
    var price=fmtPrice(c.current_price);
    return '<div class="row"><div class="rank">'+(i+1)+'.</div><div class="sym">'+sym+
           '</div><div class="price">$'+price+'</div><div class="value '+cls+'">'+pct.toFixed(2)+'%</div></div>';
  }).join(""));
  var vol = markets.slice().sort(function(a,b){ return b.total_volume-a.total_volume; }).slice(0,7);
  safeSetHTML("#list-volume", vol.map(function(c,i){
    var sym=(c.symbol||"").toUpperCase();
    return '<div class="row"><div class="rank">'+(i+1)+'.</div><div class="sym">'+sym+
           '</div><div class="price">$'+fmtNum(c.total_volume,0)+'</div><div class="value"></div></div>';
  }).join(""));
}

/* --- Filter/Sort/Paging --- */
function applySortFilter(){
  var q = ( ($("#search").value||"") ).trim().toLowerCase();
  state.filtered = state.all.filter(function(c){
    if(!q) return true;
    var sym=(c.symbol||"").toLowerCase();
    var nm=(c.name||"").toLowerCase();
    return sym.indexOf(q)>-1 || nm.indexOf(q)>-1;
  });
  var k=state.sortKey, dir=state.sortDir;
  function get(c){
    if(k==="market_cap") return c.market_cap!=null?c.market_cap:-1;
    if(k==="price") return c.current_price!=null?c.current_price:-1;
    if(k==="volume") return c.total_volume!=null?c.total_volume:-1;
    if(k==="change1h") return (c.price_change_percentage_1h_in_currency!=null?c.price_change_percentage_1h_in_currency:c.price_change_percentage_1h) || -1;
    if(k==="change24h") return (c.price_change_percentage_24h_in_currency!=null?c.price_change_percentage_24h_in_currency:c.price_change_percentage_24h) || -1;
    if(k==="change7d") return c.price_change_percentage_7d_in_currency!=null?c.price_change_percentage_7d_in_currency:-1;
    if(k==="rank") return c.market_cap_rank!=null?c.market_cap_rank:1e9;
    return 0;
  }
  state.filtered.sort(function(a,b){
    var va=get(a), vb=get(b);
    return (va>vb?1:(va<vb?-1:0))*dir;
  });
  var sel=$("#page");
  var totalPages=Math.max(1, Math.ceil(state.filtered.length/state.perPage));
  sel.innerHTML = Array.from({length:totalPages}, function(_,i){
    var s=i*state.perPage+1, e=Math.min(state.filtered.length,(i+1)*state.perPage);
    return '<option value="'+(i+1)+'">'+s+'~'+e+'</option>';
  }).join("");
  if(state.page>totalPages) state.page=totalPages;
  renderTableSlice(state.filtered);
}

/* --- Stars --- */
function initStars(){
  var cv=$("#starCanvas"), range=$("#starRange"); if(!cv||!range) return;
  var ctx=cv.getContext("2d");
  var W=0,H=0; var BASE=280; var intensity=range.value/100;
  function resize(){ W=cv.width=innerWidth; H=cv.height=innerHeight; }
  resize(); addEventListener("resize", resize);
  var stars=new Array(BASE).fill(0).map(function(){ return {
    x: Math.random()*W, y: Math.random()*H*0.75, r: 0.6 + Math.random()*1.4,
    p: Math.random()*Math.PI*2, s: 0.5 + Math.random()*1.5
  };});
  function draw(t){
    ctx.clearRect(0,0,W,H);
    var active = Math.floor(BASE*(0.2 + 0.8*intensity));
    var baseA  = 0.18 + intensity*0.6;
    cv.style.filter = 'blur(' + ((1-intensity)*3) + 'px)';
    cv.style.opacity = 0.35 + intensity*0.55;
    ctx.globalCompositeOperation="lighter";
    for(var i=0;i<active;i++){
      var st=stars[i]; var tw = 0.5 + 0.5*Math.sin(t*0.001*st.s + st.p); var a = baseA * tw;
      ctx.shadowBlur = 8 + 18*intensity; ctx.shadowColor = "#b9d8ff";
      ctx.fillStyle = "rgba(200,220,255,"+a+")";
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r*(0.7+intensity*0.6), 0, Math.PI*2); ctx.fill();
    }
    ctx.globalCompositeOperation="source-over";
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  range.addEventListener("input", function(){ intensity = clamp(range.value/100,0,1); });
}

/* --- Init --- */
async function init(){
  try{
    var global=null;
    try{ global = await fetchGlobal(); }catch(e){ global=null; }
    var markets = await fetchMarkets();
    state.all = markets;
    renderKPIs(markets, global);
    renderHeaderMinis(markets);
    renderRightLists(markets);
    applySortFilter();
  }catch(e){
    console.error(e);
    safeSetHTML("#cosmos-tbody", '<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>');
  }
}
document.addEventListener("DOMContentLoaded", function(){
  $("#search").addEventListener("input", function(){ state.page=1; applySortFilter(); });
  $("#sortkey").addEventListener("change", function(e){ state.sortKey=e.target.value; applySortFilter(); });
  $("#sortdir").addEventListener("click", function(e){ state.sortDir = state.sortDir===-1 ? 1 : -1; e.currentTarget.textContent = state.sortDir===-1 ? "▼" : "▲"; applySortFilter(); });
  $("#page").addEventListener("change", function(e){ state.page = Number(e.target.value)||1; renderTableSlice(state.filtered); });
  initStars();
  init();
  setInterval(init, 30000);
});
window._cosmos = { state:state, init:init };
