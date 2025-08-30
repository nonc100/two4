/* TWO4 • Cosmos dashboard logic
Proxy endpoints
- /api/coins/markets
- /api/global
- /api/coins/:id/market_chart (expects ?vs_currency=usd&days=...)
*/


(() => {
const API = {
markets: '/api/coins/markets',
global: '/api/global',
chart: (id) => `/api/coins/${id}/market_chart`,
};


const state = {
coins: [],
filtered: [],
page: 1,
perPage: 50,
sortKey: 'market_cap_rank',
sortDir: 'asc',
observer: null,
chart: null,
chartCoin: null,
currency: 'usd',
};


// Utils
const nf0 = new Intl.NumberFormat('en-US');
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const currencyFmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });


const qs = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => [...el.querySelectorAll(s)];


const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : `${(v >= 0 ? '+' : '') + nf2.format(v)}%`;
const pctClass = (v) => (v === null || v === undefined || Number.isNaN(v)) ? '' : (v >= 0 ? 'num-up' : 'num-dn');


const clamp = (n, a, b) => Math.max(a, Math.min(b, n));


function setSortIndicator() {
qsa('thead th').forEach(th => th.classList.remove('sorted-asc','sorted-desc'));
const th = qs(`thead th[data-key="${state.sortKey}"]`);
if (th) th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
}


// Fetch data
async function fetchMarkets() {
const url = `${API.markets}?vs_currency=${state.currency}&order=market_cap_desc&per_page=250&sparkline=true&price_change_percentage=1h,24h,7d`;
const res = await fetch(url);
if (!res.ok) throw new Error('markets fetch failed');
const data = await res.json();
return data;
}


async function fetchGlobal() {
const res = await fetch(API.global);
if (!res.ok) throw new Error('global fetch failed');
const data = await res.json();
return data;
}


function renderHeaderCards({ coins, global }) {
// Dominance & Global
try {
const dom = global?.data?.market_cap_percentage?.btc;
const gcap = global?.data?.total_market_cap?.[state.currency];
if (dom != null) qs('[data-field="dom-value"]').textContent = `${nf2.format(dom)}%`;
if (gcap != null) {
qs('[data-field="global-mcap"]').textContent = currencyFmt.format(gcap);
qs('[data-field="global-sub"]').textContent = `전체 암호화폐 시가총액(USD)`;
}
} catch (e) { /* noop */ }
})();
