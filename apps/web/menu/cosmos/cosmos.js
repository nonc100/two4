// COSMOS JS v4 – safe format + robust tbody finder + proxy fallback
console.log("COSMOS JS v4 loaded");

// ---------- Number formatting (bulletproof) ----------
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
    // 최후 보루
    return String(Number(num ?? 0).toFixed(max));
  }
}

function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return "-";
  let d;
  if (v >= 100) d = 2;
  else if (v >= 1) d = 4;
  else if (v > 0) d = Math.ceil(Math.abs(Math.log10(v))) + 2;
  else d = 2; // 0 또는 음수 보호
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

// ---------- tbody target (id 없어도 자동 탐지/생성) ----------
function ensureTbody() {
  // 우선 명시적 id
  let tb = document.getElementById("cosmos-tbody") || document.getElementById("market-table-body");
  if (tb) return tb;

  // thead가 있는 표를 우선
  const tables = Array.from(document.querySelectorAll("table"));
  for (const t of tables) {
    const headText = (t.tHead && t.tHead.innerText) || "";
    if (/시가총액|24시간|7일|거래량|순위|코인/i.test(headText)) {
      if (t.tBodies && t.tBodies[0]) return (t.tBodies[0].id ||= "cosmos-tbody", t.tBodies[0]);
      const created = document.createElement("tbody");
      created.id = "cosmos-tbody";
      t.appendChild(created);
      return created;
    }
  }
  // 마지막 표라도 사용
  const last = tables.at(-1);
  if (last) {
    if (last.tBodies && last.tBodies[0]) return (last.tBodies[0].id ||= "cosmos-tbody", last.tBodies[0]);
    const created = document.createElement("tbody");
    created.id = "cosmos-tbody";
    last.appendChild(created);
    return created;
  }
  return null;
}

// ---------- data fetch (direct → proxy fallback) ----------
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h,7d`;
  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`;
  // 1차: 직접
  try {
    const r = await fetch(direct);
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    d.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return d;
  } catch {
    // 2차: 프록시
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("Proxy " + r2.status);
    const d2 = await r2.json();
    d2.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return d2;
  }
}

// ---------- render ----------
function renderTable(rows) {
  const tbody = ensureTbody();
  if (!tbody) return; // 대상 못 찾으면 조용히 종료
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
  try { tbody.innerHTML = html; } catch { /* no-op */ }
}

// ---------- i
