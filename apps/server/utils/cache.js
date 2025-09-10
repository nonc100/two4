// 간단 TTL 캐시
const cache = new Map();
const TTL_MS = 60_000; // 1분

exports.hit = key => {
  const v = cache.get(key);
  return v && Date.now() - v.t < TTL_MS ? v : null;
};

exports.keep = (key, payload) => {
  if (payload.ok) cache.set(key, { ...payload, t: Date.now() });
};
