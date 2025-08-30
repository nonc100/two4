// ===== 숫자 포맷 유틸 (자릿수 안전 처리) =====
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function safeLocale(num, minFD = 0, maxFD = 8) {
  // 범위를 무조건 0~20로 보정하고 min<=max 유지
  let min = Number.isFinite(minFD) ? clamp(minFD, 0, 20) : 0;
  let max = Number.isFinite(maxFD) ? clamp(maxFD, 0, 20) : 2;
  if (max < min) max = min;
  return Number(num ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return "-";
  // 가격대에 따라 가변 자릿수 (0~8로 보정)
  let digits =
    v >= 100 ? 2 :
    v >=   1 ? 4 :
    Math.ceil(Math.abs(Math.log10(v || 1e-12))) + 2; // v=0 보호
  return safeLocale(v, 0, clamp(digits, 0, 8));
}

function fmtNum(v, maxDigits = 2) {
  if (v == null || Number.isNaN(v)) return "-";
  return safeLocale(v, 0, clamp(maxDigits, 0, 8));
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return "-";
  const n = Number(v.toFixed(2));
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "color-up" : n < 0 ? "color-down" : "";
  return `<span class="${cls}">${sign}${n}%</span>`;
}

// ===== 표 대상 tbody (id로만 찾기) =====
function getTbody() {
  return document.getElementById("cosmos-tbody");
}

// ===== 데이터 가져오기 (직접 호출 → 실패 시 프록시로 재시도) =====
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h,7d`;
  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`;

  try {
    const r = await fetch(direct);
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    data.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return data;
} catch {
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("Proxy " + r2.status);
    const data2 = await r2.json();
    data2.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return data2;
  }
}

// ===== 렌더링 =====
function renderTable(rows) {
  const tbody = getTbody();
  if (!tbody) return; // id 없으면 렌더 안 함 (A단계에서 id 달아줬는지 확인)
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
  tbody.innerHTML = html;
}

// ===== 초기화 =====
async function initCosmos() {
  const tbody = getTbody();
  if (!tbody) return;
  try {
    const rows = await fetchByMarketCap({ vs: "usd", perPage: 200, page: 1 });
    renderTable(rows);
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">데이터 로딩 실패</td></tr>`;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  initCosmos();
  setInterval(initCosmos, 30_000);
});
