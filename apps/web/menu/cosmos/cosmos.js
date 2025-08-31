/* ===== COSMOS.JS (robust build) ===== */

/* ---- Locale clamps (safety) ---- */
(() => {
  const orig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) {
    if (o && typeof o === "object") {
      let { minimumFractionDigits: mi, maximumFractionDigits: ma } = o;
      if (!Number.isFinite(mi)) mi = undefined;
      if (!Number.isFinite(ma)) ma = undefined;
      if (mi !== undefined) mi = Math.min(20, Math.max(0, mi));
      if (ma !== undefined) ma = Math.min(20, Math.max(0, ma));
      if (mi !== undefined && ma !== undefined && ma < mi) ma = mi;
      o = { ...o, ...(mi !== undefined ? { minimumFractionDigits: mi } : {}), ...(ma !== undefined ? { maximumFractionDigits: ma } : {}) };
    }
    return orig.call(this, l || "en-US", o);
  };
})();

/* ---- Utils ---- */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const $ = (s, sc = document) => sc.querySelector(s);
const $$ = (s, sc = document) => Array.from(sc.querySelectorAll(s));
const setHTML = (sel, html) => {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.innerHTML = html;
};
const safeNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const safeLocale = (num, minFD = 0, maxFD = 2) => {
  let m = Number.isFinite(minFD) ? clamp(minFD, 0, 20) : 0;
  let x = Number.isFinite(maxFD) ? clamp(maxFD, 0, 20) : 2;
  if (x < m) x = m;
  try {
    return Number(num ?? 0).toLocaleString("en-US", { minimumFractionDigits: m, maximumFractionDigits: x });
  } catch {
    return String(Number(num ?? 0).toFixed(x));
  }
};
const fmtPrice = (v) =>
  v == null || Number.isNaN(v)
    ? "-"
    : "$" + safeLocale(v, 0, clamp(v >= 100 ? 2 : v >= 1 ? 4 : v > 0 ? Math.ceil(Math.abs(Math.log10(v))) + 2 : 2, 0, 8));
const fmtPctHTML = (v) => {
  if (v == null || Number.isNaN(v)) return '<span class="neutral">-</span>';
  const n = Number(v),
    cls = n > 0 ? "up" : n < 0 ? "down" : "neutral",
    sign = n > 0 ? "+" : "";
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
};
const fmtNumSuffix = (v) => {
  if (v == null || Number.isNaN(v)) return "-";
  const n = Number(v),
    a = Math.abs(n);
  if (a >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
  return "$" + safeLocale(n, 0, 2);
};

/* ---- Sticky header auto-offset (겹침 방지) ---- */
function setStickyOffset() {
  // 상단 브랜드/허브 영역 높이를 합산해서 CSS 변수로 반영
  const brand = $(".brand");
  const controller = $(".star-ctl");
  const extra = 10;
  const h = (brand ? brand.getBoundingClientRect().height : 0) + (controller ? controller.getBoundingClientRect().height : 0) + extra;
  document.documentElement.style.setProperty("--toolbar-h", `${Math.max(58, Math.round(h))}px`);
}
window.addEventListener("resize", setStickyOffset);

/* ---- Fetch helpers (CORS + 429 방어) ---- */
async function fetchJSON(direct, proxy) {
  try {
    const r = await fetch(direct, { cache: "no-store" });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    try {
      const r2 = await fetch(proxy, { cache: "no-store" });
      if (!r2.ok) throw 0;
      return await r2.json();
    } catch {
      return null;
    }
  }
}
async function fetchMarkets({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  return await fetchJSON(
    `https://api.coingecko.com/api/v3/coins/markets?${q}`,
    `/api/coins/markets?${q}`
  );
}
async function fetchGlobal() {
  return await fetchJSON(`https://api.coingecko.com/api/v3/global`, `/api/global`);
}
async function fetchFNG() {
  return await fetchJSON(`https://api.alternative.me/fng/?limit=2`, `/api/fng`);
}
async function fetchBinanceLS(period = "1h") {
  const sym = "BTCUSDT",
    q = `symbol=${sym}&period=${period}&limit=1`;
  return await fetchJSON(
    `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?${q}`,
    `/api/binance/globalLongShortAccountRatio?${q}`
  );
}
// 차트는 실패해도 치명적이지 않도록 null 반환
async function fetchMarketChart(id, days = 7) {
  const q = `vs_currency=usd&days=${days}`;
  return await fetchJSON(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?${q}`,
    `/api/coins/${encodeURIComponent(id)}/market_chart?${q}`
  );
}

/* ---- State ---- */
const state = {
  all: [],
  filtered: [],
  page: 1,
  perPage: 50,
  sortKey: "market_cap",
  sortDir: -1, // -1 desc, 1 asc
  lsPeriod: "1h",
  filterQ: "",
};
const STABLE_IDS = new Set([
  "tether",
  "usd-coin",
  "dai",
  "first-digital-usd",
  "true-usd",
  "frax",
  "usdd",
  "paypal-usd",
  "lusd",
  "usde",
  "usdx",
]);

/* ---- Sparklines ---- */
function sparklineSVG(arr, w = 100, h = 24) {
  if (!arr || arr.length < 2) return "";
  const min = Math.min(...arr),
    max = Math.max(...arr),
    span = max - min || 1;
  const pts = arr
    .map((p, i) => {
      const x = (i / (arr.length - 1)) * w,
        y = h - ((p - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = arr.at(-1) >= arr[0];
  const color = up ? "#22c55e" : "#ef4444";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/></svg>`;
}

/* ---- Table ---- */
function buildRowHTML(c) {
  const s7 = (c.sparkline_in_7d && c.sparkline_in_7d.price) || null;
  const sym = (c.symbol || "").toUpperCase();
  const name = c.name || "";
  const rank = c.market_cap_rank ?? "-";
  const price = fmtPrice(c.current_price);
  const ch1 = c.price_change_percentage_1h_in_currency ?? c.price_change_percentage_1h ?? null;
  const ch24 = c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null;
  const ch7 = c.price_change_percentage_7d_in_currency ?? null;
  const mcap = fmtNumSuffix(c.market_cap);
  const vol = fmtNumSuffix(c.total_volume);

  // 링크/밑줄/보라색 방지: <a> 사용하지 않고 클릭은 tr에 이벤트 위임
  return `<tr class="row" data-id="${c.id}">
    <td class="row-index">${rank}</td>
    <td class="coin-cell">
      <img class="coin-img" src="${c.image}" alt="${sym}">
      <span class="coin-name">${sym}</span>
      <span class="coin-sym">${name}</span>
    </td>
    <td class="text-right"><span class="cell-price">${price}</span></td>
    <td class="text-right">${fmtPctHTML(ch1)}</td>
    <td class="text-right">${fmtPctHTML(ch24)}</td>
    <td class="text-right">${fmtPctHTML(ch7)}</td>
    <td class="text-right"><span class="cell-mcap">${mcap}</span></td>
    <td class="text-right"><span class="cell-vol">${vol}</span></td>
    <td class="text-right">${s7 ? sparklineSVG(s7) : ""}</td>
  </tr>`;
}

const ensureTbody = () => $("#cosmos-tbody");

function renderTableSlice(rows) {
  const tbody = ensureTbody();
  if (!tbody) return;
  const s = (state.page - 1) * state.perPage,
    e = s + state.perPage;
  const slice = rows.slice(s, e);
  setHTML(
    tbody,
    slice.map(buildRowHTML).join("") ||
      `<tr><td colspan="9" class="text-center">데이터 없음</td></tr>`
  );
}

/* ---- Pager ---- */
function pageRange(total, current, max = innerWidth <= 767 ? 5 : 9) {
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half),
    end = start + max - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - max + 1);
  }
  return { start, end };
}
function renderPager(total) {
  const el = $("#pager");
  if (!el) return;
  const cur = state.page,
    { start, end } = pageRange(total, cur);
  const btn = (label, pg, cls = "") =>
    `<button data-p="${pg}" class="${cls}">${label}</button>`;
  let html = "";
  html += btn("«", 1);
  html += btn("‹", Math.max(1, cur - 1));
  if (start > 1) html += `<span>…</span>`;
  for (let p = start; p <= end; p++)
    html += btn(p, p, p === cur ? "on" : "");
  if (end < total) html += `<span>…</span>`;
  html += btn("›", Math.min(total, cur + 1));
  html += btn("»", total);
  el.innerHTML = html;
  el
    .querySelectorAll("button[data-p]")
    .forEach((b) =>
      (b.onclick = () => {
        const p = Number(b.dataset.p) || 1;
        if (p !== state.page) {
          state.page = p;
          renderTableSlice(state.filtered);
          renderPager(total);
        }
      })
    );
}

/* ---- Filter + sort ---- */
function applyFilterSort() {
  const q = (state.filterQ || "").toLowerCase();
  let arr = Array.isArray(state.all)
    ? state.all.filter(
        (c) =>
          !q ||
          (c.symbol || "").toLowerCase().includes(q) ||
          (c.name || "").toLowerCase().includes(q)
      )
    : [];

  const dir = state.sortDir,
    k = state.sortKey,
    get = (c) => {
      switch (k) {
        case "market_cap":
          return c.market_cap ?? -1;
        case "price":
          return c.current_price ?? -1;
        case "volume":
          return c.total_volume ?? -1;
        case "change1h":
          return (
            c.price_change_percentage_1h_in_currency ??
            c.price_change_percentage_1h ??
            -1
          );
        case "change24h":
          return (
            c.price_change_percentage_24h_in_currency ??
            c.price_change_percentage_24h ??
            -1
          );
        case "change7d":
          return c.price_change_percentage_7d_in_currency ?? -1;
        case "rank":
          return c.market_cap_rank ?? 1e9;
        case "symbol":
          return (c.symbol || "").toUpperCase();
        default:
          return 0;
      }
    };

  arr.sort((a, b) => {
    const va = get(a),
      vb = get(b);
    const r =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb)
        : va > vb
        ? 1
        : va < vb
        ? -1
        : 0;
    return r * dir;
  });

  state.filtered = arr;

  // 헤더 표시 (오름/내림 텍스트)
  $$("#mkt thead th[data-key]").forEach((th) => {
    const k = th.dataset.key;
    const dirEl = th.querySelector(".dir");
    if (dirEl)
      dirEl.textContent =
        k === state.sortKey ? (state.sortDir === -1 ? "▼" : "▲") : "";
  });

  const totalPages = Math.max(
    1,
    Math.ceil(state.filtered.length / state.perPage)
  );
  if (state.page > totalPages) state.page = totalPages;

  renderTableSlice(state.filtered);
  renderPager(totalPages);
}

/* ---- Header click sort ---- */
function wireHeaderSort() {
  $$("#mkt thead th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir = state.sortDir === -1 ? 1 : -1;
      else {
        state.sortKey = key;
        state.sortDir = -1;
      }
      applyFilterSort();
    });
  });
}

/* ---- KPIs & lists (좌우 카드 데이터) ---- */
function renderKPIs(markets, global) {
  const btc = markets?.find((x) => x.id === "bitcoin");
  const tether = markets?.find((x) => x.id === "tether");
  const total = global?.data?.total_market_cap?.usd ?? null;
  const btcCap = btc?.market_cap ?? null;
  const dom =
    btcCap && total
      ? (btcCap / total) * 100
      : global?.data?.market_cap_percentage?.btc ?? null;

  setHTML("#kpi-btc-mcap", btcCap ? fmtNumSuffix(btcCap) : "-");
  setHTML("#kpi-usdt-mcap", tether?.market_cap ? fmtNumSuffix(tether.market_cap) : "-");
  setHTML("#kpi-dominance", dom != null ? Number(dom).toFixed(2) + "%" : "-");
}
function renderRightLists(markets) {
  if (!Array.isArray(markets) || markets.length === 0) {
    setHTML("#list-gainers", "");
    setHTML("#list-volume", "");
    return;
  }
  const gainers = markets
    .slice()
    .filter((x) => Number.isFinite(x.price_change_percentage_24h))
    .sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h
    )
    .slice(0, 10);
  setHTML(
    "#list-gainers",
    gainers
      .map((c, i) => {
        const sym = (c.symbol || "").toUpperCase(),
          val = c.price_change_percentage_24h ?? 0,
          cls = val >= 0 ? "up" : "down";
        return `<div class="row"><div class="rank">${i + 1}.</div><div class="sym">${sym}</div><div class="price">${fmtPrice(
          c.current_price
        )}</div><div class="pct ${cls}">${
          val >= 0 ? "+" : ""
        }${val.toFixed(2)}%</div></div>`;
      })
      .join("")
  );

  const vol = markets
    .slice()
    .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
    .slice(0, 10);
  setHTML(
    "#list-volume",
    vol
      .map((c, i) => {
        const sym = (c.symbol || "").toUpperCase(),
          pct = c.price_change_percentage_24h ?? 0,
          cls = pct >= 0 ? "up" : "down";
        return `<div class="row"><div class="rank">${i + 1}.</div><div class="sym">${sym}</div><div class="price">${fmtPrice(
          c.current_price
        )}</div><div class="pct ${cls}">${
          pct >= 0 ? "+" : ""
        }${pct.toFixed(2)}%</div></div>`;
      })
      .join("")
  );
}

/* ---- FNG ---- */
function renderFNGCard(data) {
  try {
    const item = Array.isArray(data?.data) ? data.data[0] : null;
    if (!item) {
      setHTML("#fng-title", "- / -");
      setHTML("#fng-gauge", "");
      return;
    }
    const value = Number(item.value),
      cls = value <= 40 ? "risk" : value <= 60 ? "neutral" : "safe",
      label =
        item.value_classification ||
        (value <= 40 ? "Fear" : value <= 60 ? "Neutral" : "Greed");

    setHTML("#fng-title", `${value} / ${label}`);

    const dt = item.timestamp
      ? new Date(Number(item.timestamp) * 1000)
      : new Date();
    setHTML(
      "#fng-date",
      `Alternative.me · ${dt.getFullYear()}. ${String(
        dt.getMonth() + 1
      ).padStart(2, "0")}. ${String(dt.getDate()).padStart(2, "0")}`
    );

    const badge = $("#fng-badge");
    if (badge) {
      badge.className = `badge ${cls}`;
      badge.textContent = label;
    }

    const pct = Math.max(0, Math.min(1, value / 100)),
      start = -Math.PI,
      end = 0,
      ang = start + (end - start) * pct,
      r = 56,
      cx = 80,
      cy = 86;
    const arc = (a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`,
      nx = cx + (r - 8) * Math.cos(ang),
      ny = cy + (r - 8) * Math.sin(ang);
    const svg = `<svg width="160" height="100" viewBox="0 0 160 100">
      <defs>
        <linearGradient id="seg1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ef4444"/><stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
        <linearGradient id="seg2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#22c55e"/>
        </linearGradient>
      </defs>
      <path d="M ${arc(start)} A ${r} ${r} 0 0 1 ${arc(-Math.PI/2)}" stroke="url(#seg1)" stroke-width="12" fill="none" opacity=".9"/>
      <path d="M ${arc(-Math.PI/2)} A ${r} ${r} 0 0 1 ${arc(end)}" stroke="url(#seg2)" stroke-width="12" fill="none" opacity=".9"/>
      <circle cx="${cx}" cy="${cy}" r="2.8" fill="#fff" opacity=".9"/>
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
    setHTML("#fng-gauge", svg);
  } catch {
    setHTML("#fng-title", "- / -");
    setHTML("#fng-gauge", "");
  }
}

/* ---- Mini caps (sparks) ---- */
function renderMiniCaps(btc, usdt) {
  const arr = (d) =>
    Array.isArray(d?.market_caps) ? d.market_caps.map((x) => x[1]) : null;
  setHTML(
    "#kpi-btc-spark",
    arr(btc) ? sparklineSVG(arr(btc), 180, 44) : ""
  );
  setHTML(
    "#kpi-usdt-spark",
    arr(usdt) ? sparklineSVG(arr(usdt), 180, 44) : ""
  );
}

/* ---- Long/Short ---- */
function renderLongShort(period, arr) {
  const last = Array.isArray(arr) ? arr.at(-1) : null;
  if (!last) {
    setHTML("#ls-long", "-");
    setHTML("#ls-short", "-");
    setHTML("#ls-ratio", "-");
    return;
  }
  const ratio = Number(last.longShortRatio || last.longShortRatio?.toString() || 0);
  let longPct, shortPct;
  if (last.longAccount && last.shortAccount) {
    const la = Number(last.longAccount),
      sa = Number(last.shortAccount),
      sum = la + sa || 1;
    longPct = (la / sum) * 100;
    shortPct = (sa / sum) * 100;
  } else if (ratio) {
    shortPct = 100 / (1 + ratio);
    longPct = 100 - shortPct;
  } else {
    longPct = shortPct = 50;
  }
  setHTML("#ls-long", `${longPct.toFixed(1)}%`);
  setHTML("#ls-short", `${shortPct.toFixed(1)}%`);
  setHTML("#ls-ratio", ratio ? ratio.toFixed(2) : `${(longPct / shortPct).toFixed(2)}`);
  const bar = $("#ls-longbar");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, longPct))}%`;
  $$(".ls-ctl button").forEach((b) =>
    b.classList.toggle("active", b.dataset.period === period)
  );
}

/* ---- Init wiring ---- */
function wireUI() {
  // 행 클릭 → chart.html
  $("#cosmos-tbody")?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.row");
    if (!tr) return;
    const id = tr.dataset.id;
    if (id) location.href = `./chart.html?id=${encodeURIComponent(id)}`;
  });

  // 롱/숏 버튼
  $$(".ls-ctl button").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const p = e.currentTarget.dataset.period;
      state.lsPeriod = p;
      try {
        const d = await fetchBinanceLS(p);
        renderLongShort(p, d || []);
      } catch {}
    })
  );

  // 검색
  $("#search")?.addEventListener("input", (e) => {
    state.page = 1;
    state.filterQ = e.target.value || "";
    applyFilterSort();
  });

  wireHeaderSort();

  // Star controller -> CSS 변수만 제어 (별 배경은 CSS 애니메이션)
  const range = $("#starRange");
  if (range) {
    const saved = Number(localStorage.getItem("two4_star") || 65);
    range.value = String(clamp(saved, 0, 100));
    const apply = (v) =>
      document.documentElement.style.setProperty("--starVis", String(v / 100));
    apply(Number(range.value));
    range.addEventListener("input", (e) => {
      const v = clamp(Number(e.target.value || 0), 0, 100);
      apply(v);
      localStorage.setItem("two4_star", String(v));
    });
  }

  setStickyOffset();
}

/* ---- Data init ---- */
async function initData() {
  try {
    const [markets, global, fng, ls, btcChart, usdtChart] = await Promise.allSettled([
      fetchMarkets(),
      fetchGlobal(),
      fetchFNG(),
      fetchBinanceLS(state.lsPeriod),
      fetchMarketChart("bitcoin", 7),
      fetchMarketChart("tether", 7),
    ]);

    const M = markets.status === "fulfilled" && Array.isArray(markets.value) ? markets.value : [];
    const G = global.status === "fulfilled" ? global.value : null;
    const F = fng.status === "fulfilled" ? fng.value : null;
    const L = ls.status === "fulfilled" ? ls.value : null;
    const BTC = btcChart.status === "fulfilled" ? btcChart.value : null;
    const USDT = usdtChart.status === "fulfilled" ? usdtChart.value : null;

    state.all = M;

    renderKPIs(M, G);
    renderRightLists(M);
    applyFilterSort();
    if (F) renderFNGCard(F);
    if (L) renderLongShort(state.lsPeriod, L);
    renderMiniCaps(BTC, USDT);
  } catch (e) {
    console.error(e);
    setHTML(
      "#cosmos-tbody",
      `<tr><td colspan="9" class="text-center">데이터 로딩 실패</td></tr>`
    );
  }
}

/* ---- Boot ---- */
document.addEventListener("DOMContentLoaded", () => {
  wireUI();
  initData();

  // 가시성 기반 폴링
  let vis = document.visibilityState === "visible";
  document.addEventListener("visibilitychange", () => {
    vis = document.visibilityState === "visible";
  });

  // 60초마다 시장/지표 업데이트
  setInterval(async () => {
    if (!vis) return;
    try {
      const [markets, global] = await Promise.allSettled([
        fetchMarkets(),
        fetchGlobal(),
      ]);
      const M = markets.status === "fulfilled" && Array.isArray(markets.value) ? markets.value : null;
      const G = global.status === "fulfilled" ? global.value : null;
      if (M) {
        state.all = M;
        renderKPIs(M, G);
        renderRightLists(M);
        applyFilterSort();
      }
    } catch {}
  }, 60000);

  // FNG는 1시간 주기
  setInterval(async () => {
    if (!vis) return;
    try {
      const d = await fetchFNG();
      if (d) renderFNGCard(d);
    } catch {}
  }, 60 * 60 * 1000);
});

// debug
window._cosmos = { state, applyFilterSort, initData };
