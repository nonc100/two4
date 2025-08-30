// ===== 숫자 포맷 유틸 (maximumFractionDigits 오류 방지) =====
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function fmtPrice(v) {
  if (v == null || Number.isNaN(v)) return "-";
  let digits = v >= 100 ? 2 : v >= 1 ? 4 : Math.ceil(Math.abs(Math.log10(v))) + 2;
  digits = clamp(digits, 0, 8);
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

// ===== 표 대상 tbody 찾기 (ID 없어도 자동 탐지/생성) =====
function ensureTbody() {
  // 1) 명시적 ID가 있으면 그걸 사용
  let tb = document.getElementById("market-table-body") || document.getElementById("cosmos-tbody");
  if (tb) return tb;

  // 2) 헤더 문구로 대상 표 추정(시가총액/24시간/7일 중 하나 포함)
  const tables = Array.from(document.querySelectorAll("table"));
  for (const t of tables) {
    const headText = (t.tHead && t.tHead.innerText) ? t.tHead.innerText : "";
    if (/시가총액|24시간|7일|거래량/i.test(headText)) {
      if (t.tBodies && t.tBodies[0]) return (t.tBodies[0].id ||= "market-table-body", t.tBodies[0]);
      const created = document.createElement("tbody");
      created.id = "market-table-body";
      t.appendChild(created);
      return created;
    }
  }

  // 3) 마지막 표의 tbody를 사용(없으면 생성)
  const last = tables.at(-1);
  if (last) {
    if (last.tBodies && last.tBodies[0]) return (last.tBodies[0].id ||= "market-table-body", last.tBodies[0]);
    const created = document.createElement("tbody");
    created.id = "market-table-body";
    last.appendChild(created);
    return created;
  }
  return null;
}

// ===== 데이터 가져오기 (직접 호출 → 실패 시 프록시로 재시도) =====
async function fetchByMarketCap({ vs = "usd", perPage = 200, page = 1 } = {}) {
  const q = `vs_currency=${vs}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h,7d`;
  const direct = `https://api.coingecko.com/api/v3/coins/markets?${q}`;
  const proxy  = `/api/coins/markets?${q}`; // (server.js에 프록시 넣으면 사용됨)

  // 1차: 직접 호출
  try {
    const r = await fetch(direct);
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    data.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    return data;
  } catch (_) {
    // 2차: 프록시 호출
    try {
      const r2 = await fetch(proxy);
      if (!r2.ok) throw new Error(String(r2.status));
      const data2 = await r2.json();
      data2.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
      return data2;
    } catch (e2) {
      throw e2;
    }
  }
}

// ===== 렌더링 =====
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
  tbody.innerHTML = html;
}

// ===== 초기화 =====
async function initCosmos() {
  const tbody = ensureTbody();
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
