const CACHE_TTL_MS = 2 * 60 * 1000;
let cached = { items: null, timestamp: 0, limit: 0 };

function buildQuery(limit) {
  const params = new URLSearchParams();
  if (Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(limit));
  }
  return params.toString();
}

export async function fetchCryptoNews(limit = 12) {
  const now = Date.now();
  if (cached.items && (now - cached.timestamp) < CACHE_TTL_MS && cached.limit >= limit) {
    return cached.items.slice(0, limit);
  }

  const query = buildQuery(limit);
  const url = query ? `/api/crypto-news?${query}` : '/api/crypto-news';
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || 'Failed to fetch crypto news'}`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.items)) {
    throw new Error('Unexpected response format from /api/crypto-news');
  }

  cached = {
    items: data.items,
    timestamp: now,
    limit: data.items.length,
  };

  return data.items.slice(0, limit);
}
