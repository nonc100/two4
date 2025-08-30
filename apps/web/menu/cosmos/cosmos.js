/* ================= COSMOS JS v5 (full) =================
   - Global clamp: Number.toLocaleString + Intl.NumberFormat (모든 스크립트에 적용)
   - Robust <tbody> finder (id 없으면 자동 탐지/생성)
   - CoinGecko direct fetch → proxy(/api/...) 자동 재시도
========================================================= */

// ---- GLOBAL SAFETY CLAMPS ----
(() => {
  // 1) clamp for Number.prototype.toLocaleString
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

  // 2) clamp for Intl.NumberFormat(...).format()
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

// innerHTML 안전 헬퍼 (대상 없으면 조용히 스킵)
window.safeSetHTML = function (selectorOrEl, html) {
  const el = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (el) el.innerHTML = html;
};

// ---- UTILS ----
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
  const n = Number(v).toFixed(2);
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "color-up" : n < 0 ? "color-down" : "";
  return `<span class="${cls}">${sign}${n}%</span>`;
}

// ---- TARGET <tbody> ----
function ensureTbody() {
  // 1) 명시적 id 우선
  let tb = document.getElementById("cosmos-tbody") || document.getElementById("market-table-body");
  if (tb) return tb;

  // 2) 헤더 텍스트로 표 추정
  const tables = Array.from(document.querySelectorAll("table"));
  for (const t of tables) {
    const headText = (t.tHead && t.tHead.innerText) || "";
    if (/시가총액|24시간|7일|거래량|순위|코인/i.test(headText)) {
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
  // 3) 마지막 표라도 사용
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

// ---- FETCH (direct → proxy fallback) ----
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h,7d`;
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

// ---- RENDER ----
function renderTable(rows) {
  const tbody = ensureTbody();
  if (!tbody) return;
  const html = rows.map(c => `
    <tr class="row">
      <td>${c.market_cap_rank ?? "-"}</td>
      <td class="coin-cell">
        <img src="${c.image}" alt="${c.symbol}" class="coin-img" />
        <span class="coin-name">${c.name}</span>
        <span class="coin-sym">${(c.symbol || "").toUpperCase()}</span>
      </td>
      <td class="text-right">$${fmtPrice(c.current_price)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_24h)}</td>
      <td class="text-right">${fmtPct(c.price_change_percentage_7d_in_currency ?? null)}</td>
      <td class="text-right">$${fmtNum(c.market_cap, 0)}</td>
    </tr>
  `).join("");
  window.safeSetHTML(tbody, html);
}

// ---- INIT ----
async function initCosmos() {
  const tbody = ensureTbody();
  if (!tbody) return;
  try {
    const rows = await fetchByMarketCap({ vs: "usd", perPage: 200, page: 1 });
    renderTable(rows);
  } catch (e) {
    console.error(e);
    window.safeSetHTML(tbody, `<tr><td colspan="6" class="text-center">데이터 로딩 실패</td></tr>`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initCosmos();
    setInterval(initCosmos, 30_000);
  }, 50);
});

// 디버깅용 전역 노출
window.fetchByMarketCap = fetchByMarketCap;
window.initCosmos = initCosmos;
console.log("COSMOS JS v5 loaded");
