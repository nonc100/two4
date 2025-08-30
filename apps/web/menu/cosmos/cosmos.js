/* ================= COSMOS JS v7 (full) =================
   - sparkline=true & price_change_percentage=1h,24h,7d
   - 검색(q) + 정렬(key/order) + "변동률(24h) 내림차순" 버튼
   - 기본 정렬: 시가총액 내림차순
========================================================= */

// ---- GLOBAL SAFETY CLAMPS (자릿수 에러 방지) ----
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

// innerHTML 안전 헬퍼
window.safeSetHTML = function (selectorOrEl, html) {
  const el = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (el) el.innerHTML = html;
};

// ---- UTILS ----
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const debounce = (fn, ms=250) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };

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
  if (v == null || !isFinite(v)) return "-";
  const n = Number(v).toFixed(2);
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "color-up" : n < 0 ? "color-down" : "";
  return `<span class="${cls}">${sign}${n}%</span>`;
}

// ---- TARGET <tbody> ----
function ensureTbody() {
  let tb = document.getElementById("cosmos-tbody") || document.getElementById("market-table-body");
  if (tb) return tb;
  const tables = Array.from(document.querySelectorAll("table"));
  for (const t of tables) {
    const headText = (t.tHead && t.tHead.innerText) || "";
    if (/시가총액|24시간|7일|거래량|순위|코인|1시간/i.test(headText)) {
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

// ---- Sparkline SVG ----
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

// ---- FETCH (sparkline=true, 1h/24h/7d 포함) ----
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q =
    `vs_currency=${vs}` +
    `&order=market_cap_desc&per_page=${perPage}&page=${page}` +
    `&sparkline=true&price_change_percentage=1h,24h,7d`;

  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`;

  try {
    const r = await fetch(direct);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    d.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return d;
  } catch {
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("Proxy " + r2.status);
    const d2 = await r2.json();
    d2.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return d2;
  }
}

// ---- 상태 + 정렬 보조 ----
let RAW_ROWS = [];
const STATE = {
  q: "",
  sortKey: "market_cap",
  sortOrder: "desc", // 'asc' | 'desc'
};

function pickValue(c, key) {
  switch (key) {
    case "price":     return c.current_price;
    case "volume":    return c.total_volume;
    case "change1h":  return c.price_change_percentage_1h_in_currency;
    case "change24h": return c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h;
    case "change7d":  return c.price_change_percentage_7d_in_currency;
    case "market_cap":
    default:          return c.market_cap;
  }
}

function applyAndRender() {
  const dir = STATE.sortOrder === "asc" ? 1 : -1;
  const q = STATE.q.trim().toLowerCase();

  let rows = RAW_ROWS.slice();
  if (q) {
    rows = rows.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.symbol || "").toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    const av = pickValue(a, STATE.sortKey);
    const bv = pickValue(b, STATE.sortKey);
    const aa = (av == null || !isFinite(av)) ? -Infinity : av;
    const bb = (bv == null || !isFinite(bv)) ? -Infinity : bv;
    return (aa > bb ? 1 : aa < bb ? -1 : 0) * dir;
  });

  renderTable(rows);
}

// ---- RENDER (열 9개) ----
function renderTable(rows) {
  const tbody = ensureTbody();
  if (!tbody) return;

  const ICON = (window.innerWidth <= 620 ? 18 : 22);

  const html = rows.map(c => `
    <tr class="row">
      <td>${c.market_cap_rank ?? "-"}</td>
      <td class="coin-cell" style="display:flex;align-items:center;gap:8px;">
        <img
          src="${c.image}" alt="${c.symbol}" class="coin-img"
          style="
            width:${ICON}px !important;height:${ICON}px !important;
            min-width:${ICON}px !important;min-height:${ICON}px !important;
            max-width:${ICON}px !important;max-height:${ICON}px !important;
            border-radius:50%;object-fit:contain;display:inline-block;"
        />
               <span class="coin-name">
          <a href="./chart.html?id=${c.id}"
             style="color:#9ecbff;text-decoration:underline;text-underline-offset:3px;">
             ${c.name}
          </a>
        </span>
        <span class="coin-sym">${(c.symbol || "").toUpperCase()}</span>
      </td>

      <td class="text-right">$${fmtPrice(c.current_price)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_1h_in_currency)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_7d_in_currency)}</td>
      <td class="text-right">$${fmtNum(c.market_cap, 0)}</td>
      <td class="text-right">$${fmtNum(c.total_volume, 0)}</td>
      <td class="text-right">${sparklineSVG(c.sparkline_in_7d && c.sparkline_in_7d.price)}</td>
    </tr>
  `).join("");

  window.safeSetHTML(tbody, html);
}

// ---- 컨트롤 초기화 ----
function initControls() {
  const elQ = document.getElementById("cosmos-q");
  const elKey = document.getElementById("cosmos-sort-key");
  const elOrd = document.getElementById("cosmos-sort-order");
  const elBtn = document.getElementById("cosmos-btn-topchange");

  if (elQ)   elQ.addEventListener("input", debounce(e => { STATE.q = e.target.value; applyAndRender(); }, 150));
  if (elKey) elKey.addEventListener("change", e => { STATE.sortKey = e.target.value; applyAndRender(); });
  if (elOrd) elOrd.addEventListener("change", e => { STATE.sortOrder = e.target.value; applyAndRender(); });
  if (elBtn) elBtn.addEventListener("click", () => {
    STATE.sortKey = "change24h";
    STATE.sortOrder = "desc";
    if (elKey) elKey.value = "change24h";
    if (elOrd) elOrd.value = "desc";
    applyAndRender();
  });
}

// ---- INIT ----
async function initCosmos() {
  initControls();
  const tbody = ensureTbody();
  if (!tbody) return;
  try {
    RAW_ROWS = await fetchByMarketCap({ vs: "usd", perPage: 200, page: 1 });
    // 기본: 시총 내림차순
    STATE.sortKey = "market_cap"; STATE.sortOrder = "desc";
    applyAndRender();
  } catch (e) {
    console.error(e);
    window.safeSetHTML(tbody, `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initCosmos();
    setInterval(async () => {
      try {
        RAW_ROWS = await fetchByMarketCap({ vs: "usd", perPage: 200, page: 1 });
        applyAndRender(); // 현재 필터/정렬 유지한 채 갱신
      } catch (e) { console.error(e); }
    }, 30_000);
  }, 50);
});

// 전역 노출(디버그)
window.fetchByMarketCap = fetchByMarketCap;
window.initCosmos = initCosmos;
console.log("COSMOS JS v7 loaded");
