// node-fetch 동적 임포트(ESM/CMC 혼용 안전)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.proxyFetch = async (url, headers = {}) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(url, { headers, signal: ac.signal });
    const body = await r.text();
    clearTimeout(timer);
    return { ok: r.ok, status: r.status, body, ct: r.headers.get('content-type') || 'application/json' };
  } catch (e) {
    clearTimeout(timer);
    return { ok:false, status:502, body: JSON.stringify({ error:'proxy failed', detail:String(e) }), ct:'application/json' };
  }
};
