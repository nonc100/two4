// ===== 공통 유틸 (숫자 포맷 + 에러 방지) =====
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return "-";
  let digits = v >= 100 ? 2 : v >= 1 ? 4 : Math.ceil(Math.abs(Math.log10(v))) + 2;
  digits = clamp(digits, 0, 8); // maximumFractionDigits 안전
  return Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtNum(v, maxDigits = 2) {
  if (v == null || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString("en-US", {
    maximumFractionDigits: clamp(maxDigits, 0, 8),
  });
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return "-";
  const n = Number(v.toFixed(2));
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "color-up" : n < 0 ? "color-down" : "";
  return `<span class="${cls}">${sign}${n}%</span>`;
}

// ===== 데이터 가져오기 (시가총액 내림차순) =====
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  // 직접 CoinGecko 호출. 필요시 프록시로 바꿔도 됨: /api/coins/markets?...
  const url =
    `/api/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h,7d`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("CoinGecko error: " + res.status);
  const data = await res.json();

  // 혹시 모를 순서 문제 대비: 클라이언트에서도 한 번 더 정렬
  data.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  return data;
}

// ===== 렌더링 =====
function getTbody() {
  // 너의 마크업 상황에 따라 두 아이디 중 하나를 사용
  return document.getElementById("market-table-body") || document.getElementById("cosmos-tbody");
}

function renderTable(rows) {
  const tbody = getTbody();
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
  setInterval(initCosmos, 30_000); // 30초마다 갱신
});
