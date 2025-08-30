/* ================= COSMOS JS (no-key dashboards) =================
   ✅ 외부키 없이 즉시 동작하는 카드 5개
      - 등락률 Top7(24h), 거래량 순위, BTC 시총, Global 시총, BTC Dominance
   ✅ 표: 시가총액 순(기본), 검색, 헤더 클릭 정렬(▲/▼), 50개 페이징, 7d 스파크라인
   ✅ CoinGecko 직접 호출 실패 시 /api/* 프록시 자동 재시도
=================================================================== */

/* ---------- GLOBAL CLAMPS (Locale 안전 가드) ---------- */
(() => {
  const origToLS = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locale, opts) {
    if (opts && typeof opts === "object") {
      let { minimumFractionDigits: min, maximumFractionDigits: max } = opts;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = {
        ...opts,
        ...(min !== undefined ? { minimumFractionDigits: min } : {}),
        ...(max !== undefined ? { maximumFractionDigits: max } : {}),
      };
    }
    return origToLS.call(this, locale || "en-US", opts);
  };
  const OrigNF = Intl.NumberFormat;
  Intl.NumberFormat = function (locale, opts) {
    if (opts && typeof opts === "object") {
      let { minimumFractionDigits: min, maximumFractionDigits: max } = opts;
      if (!Number.isFinite(min)) min = undefined;
      if (!Number.isFinite(max)) max = undefined;
      if (min !== undefined) min = Math.min(20, Math.max(0, min));
      if (max !== undefined) max = Math.min(20, Math.max(0, max));
      if (min !== undefined && max !== undefined && max < min) max = min;
      opts = {
        ...opts,
        ...(min !== undefined ? { minimumFractionDigits: min } : {}),
        ...(max !== undefined ? { maximumFractionDigits: max } : {}),
      };
    }
    return new OrigNF(locale || "en-US", opts);
  };
})();

/* ---------- HELPERS ---------- */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function safeLocale(num, minFD = 0, maxFD = 2) {
  let min = Number.isFinite(minFD) ? clamp(minFD, 0, 20) : 0;
  let max = Number.isFinite(maxFD) ? clamp(maxFD, 0, 20) : 2;
  if (max < min) max = min;
  try {
    return Number(num ?? 0).toLocaleString("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  } catch {
    return String(Number(num ?? 0).toFixed(max));
  }
}
function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return "-";
  let d;
  if (v >= 100) d = 2;
  else if (v >= 1) d = 4;
  else if (v > 0) d = Math.ceil(Math.abs(Math.log10(v))) + 2;
  else d = 2;
  return safeLocale(v, 0, clamp(d, 0, 8));
}
function fmtNum(v, maxDigits = 2) {
  if (v == null || Number.isNaN(v)) return "-";
  return safeLocale(v, 0, clamp(maxDigits, 0, 8));
}
function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const s = n.toFixed(2);
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "up" : n < 0 ? "down" : "";
  return `<span class="${cls}">${sign}${s}%</span>`;
}
function $(sel) { return document.querySelector(sel); }
function safeSetHTML(selectorOrEl, html) {
  const el = typeof selectorOrEl === "string" ? $(selectorOrEl) : selectorOrEl;
  if (el) el.innerHTML = html;
}

/* ---------- TARGET <tbody> ---------- */
function ensureTbody() {
  let tb = document.getElementById("cosmos-tbody");
  if (tb) return tb;
  const tables = Array.from(document.querySelectorAll("table"));
  for (const t of tables) {
    const headText = (t.tHead && t.tHead.innerText) || "";
    if (/시가총액|거래량|순위|코인|24시간|7일/i.test(headText)) {
      if (t.tBodies && t.tBodies[0]) {
        t.tBodies[0].id ||= "cosmos-tbody";
        return t.tBodies[0];
      }
      const created = document.createElement("tbody");
      created.id = "cosmos-tbody";
      t.appendChild(created);
      return created;
    }
  }
  const last = tables.at(-1);
  if (last) {
    if (last.tBodies && last.tBodies[0]) {
      last.tBodies[0].id ||= "cosmos-tbody";
      return last.tBodies[0];
    }
    const created = document.createElement("tbody");
    created.id = "cosmos-tbody";
    last.appendChild(created);
    return created;
  }
  return null;
}

/* ---------- SPARKLINE (7d) ---------- */
function sparklineSVG(prices, w = 80, h = 24) {
  if (!prices || prices.length < 2) return "-";
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? "#28e07a" : "#ff5b6e";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/>
  </svg>`;
}

/* ---------- FETCHERS (direct → proxy fallback) ---------- */
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`;
  try {
    const r = await fetch(direct);
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("fetch coins failed");
    return await r2.json();
  }
}
async function fetchGlobal(){
  try{
    const r = await fetch("https://api.coingecko.com/api/v3/global");
    if(!r.ok) throw 0;
    return await r.json();
  }catch{
    const r2 = await fetch("/api/global");
    if(!r2.ok) throw new Error("fetch global failed");
    return await r2.json();
  }
}

/* ---------- STATE ---------- */
const state = {
  rows: [],
  filtered: [],
  sortKey: 'market_cap', // 초기: 시가총액 기준
  sortDir: 'desc',
  page: 1,
  perPage: 50,
};

/* ---------- TABLE RENDER ---------- */
function buildRowHTML(c) {
  return `
    <tr class="row">
      <td>${c.market_cap_rank ?? "-"}</td>
      <td>
        <a class="coin-link" href="#" data-coin-id="${c.id}">
          <img src="${c.image}" alt="${c.symbol}"
            style="width:22px;height:22px;min-width:22px;min-height:22px;border-radius:50%;object-fit:contain;display:inline-block;">
          <span class="coin-ticker">${(c.symbol||"").toUpperCase()}</span>
          <span class="coin-name"> · ${c.name}</span>
        </a>
      </td>
      <td class="text-right">$${fmtPrice(c.current_price)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? null)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_7d_in_currency ?? null)}</td>
      <td class="text-right">$${fmtNum(c.market_cap, 0)}</td>
      <td class="text-right">$${fmtNum(c.total_volume, 0)}</td>
      <td class="text-right">${sparklineSVG(c.sparkline_in_7d && c.sparkline_in_7d.price)}</td>
    </tr>
  `;
}
function renderTableSlice(rows) {
  const tbody = ensureTbody();
  if (!tbody) return;
  const start = (state.page - 1) * state.perPage;
  const end = start + state.perPage;
  const slice = rows.slice(start, end);
  safeSetHTML(tbody, slice.map(buildRowHTML).join("") || `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`);
}
function renderPager(rows) {
  const host = $("#cosmos-pager");
  if (!host) return;
  const pages = Math.max(1, Math.ceil(rows.length / state.perPage));
  const btns = [];
  for (let p = 1; p <= pages; p++) {
    btns.push(`<button data-p="${p}" class="${p===state.page?'active':''}">${p}</button>`);
  }
  host.innerHTML = btns.join("");
  host.querySelectorAll("button").forEach(b=>{
    b.onclick = () => {
      state.page = Number(b.dataset.p)||1;
      renderTableSlice(state.filtered);
      renderPager(state.filtered);
    };
  });
}

/* ---------- SEARCH & SORT ---------- */
function applySearchSort() {
  const q = ($("#cosmos-q")?.value || "").trim().toLowerCase();
  let arr = [...state.rows];
  if (q) {
    arr = arr.filter(c =>
      (c.name||"").toLowerCase().includes(q) ||
      (c.symbol||"").toLowerCase().includes(q)
    );
  }
  const keyMap = {
    price:      c => c.current_price,
    change1h:   c => c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h,
    change24h:  c => c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency,
    change7d:   c => c.price_change_percentage_7d_in_currency,
    market_cap: c => c.market_cap,
    volume:     c => c.total_volume,
  };
  if (state.sortKey && keyMap[state.sortKey]) {
    const get = keyMap[state.sortKey];
    arr.sort((a,b)=>{
      const va = get(a) ?? -Infinity;
      const vb = get(b) ?? -Infinity;
      return state.sortDir === 'asc' ? va - vb : vb - va;
    });
  }
  state.filtered = arr;
  state.page = 1; // 검색/정렬 시 첫 페이지로
  renderTableSlice(arr);
  renderPager(arr);
}
function bindSortHeaders() {
  document.querySelectorAll("th[data-sort]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.getAttribute("data-sort");
      // 토글 asc/desc
      if (state.sortKey === key) {
        state.sortDir = (state.sortDir === 'asc') ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'desc'; // 기본 내림차순
      }
      // 헤더 아이콘 클래스 갱신
      document.querySelectorAll("th[data-sort]").forEach(h=>h.classList.remove("asc","desc"));
      th.classList.add(state.sortDir);
      applySearchSort();
    });
  });
}
function bindSearch() {
  const inp = $("#cosmos-q");
  if (inp) inp.addEventListener("input", ()=> applySearchSort());
}

/* ---------- DASHBOARD CARDS (NO-KEY) ---------- */
function renderDashboard(rows){
  // 1) 24h 등락률 상위 TOP 7 (티커만, 순위+값)
  const gainers = [...rows]
    .sort((a,b)=>(b.price_change_percentage_24h ?? b.price_change_percentage_24h_in_currency ?? 0) -
                  (a.price_change_percentage_24h ?? a.price_change_percentage_24h_in_currency ?? 0))
    .slice(0,7)
    .map((c,i)=>{
      const sym = (c.symbol||'').toUpperCase();
      const chg = (c.price_change_percentage_24h ?? c.price_change_percentage_24h_in_currency ?? 0);
      return `<div class="row">
        <span class="rank">${i+1}.</span>
        <span class="sym">${sym}</span>
        <span class="sep">-</span>
        <span class="value ${chg>=0?'up':'down'}">${chg.toFixed(2)}%</span>
      </div>`;
    }).join("");
  safeSetHTML("#k-gainers", gainers || "<div class='sub'>데이터 없음</div>");

  // 2) 거래량 순위 (티커만, 순위+금액)
  const volumes = [...rows]
    .sort((a,b)=>(b.total_volume||0)-(a.total_volume||0))
    .slice(0,7)
    .map((c,i)=>{
      const sym = (c.symbol||'').toUpperCase();
      return `<div class="row">
        <span class="rank">${i+1}.</span>
        <span class="sym">${sym}</span>
        <span class="sep">-</span>
        <span class="value">$${fmtNum(c.total_volume, 0)}</span>
      </div>`;
    }).join("");
  safeSetHTML("#k-volume", volumes || "<div class='sub'>데이터 없음</div>");

  // 3) BTC 시총
  const btc = rows.find(x => (x.symbol||"").toLowerCase()==="btc" || x.id==="bitcoin");
  $("#k-btc-mcap") && ($("#k-btc-mcap").textContent = btc ? "$"+fmtNum(btc.market_cap,0) : "-");
}
async function renderGlobalCards(){
  try{
    const g = await fetchGlobal();
    const data = g.data || g;
    const dom = data.market_cap_percentage?.btc;
    const total = data.total_market_cap?.usd;
    $("#k-dominance") && ($("#k-dominance").textContent = (dom!=null) ? (dom.toFixed(2)+"%") : "-");
    $("#k-total-mcap") && ($("#k-total-mcap").textContent = total!=null ? "$"+fmtNum(total,0) : "-");
  }catch(e){
    console.warn("global fetch fail", e);
  }
}

/* ---------- INIT ---------- */
async function initCosmos() {
  const tbody = ensureTbody();
  if (!tbody) return;

  try {
    // 200개 받아 두고, 표는 50개씩 페이징
    const rows = await fetchByMarketCap({ vs: "usd", perPage: 200, page: 1 });
    state.rows = Array.isArray(rows) ? rows : [];
    bindSearch();
    bindSortHeaders();
    applySearchSort();      // table + pager
    renderDashboard(state.rows);
    renderGlobalCards();
  } catch (e) {
    console.error(e);
    safeSetHTML(tbody, `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

// 자동 새로고침(30초)
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initCosmos();
    setInterval(initCosmos, 30_000);
  }, 50);
});

// 디버깅용
window.fetchByMarketCap = fetchByMarketCap;
window.initCosmos = initCosmos;
console.log("COSMOS JS (no-key dashboards) loaded");
