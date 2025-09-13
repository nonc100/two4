// shared utility helpers
exports.pct = (a, b) => {
  const x = Number(a), y = Number(b);
  if (!isFinite(x) || !isFinite(y) || y === 0) return null;
  return ((x - y) / y) * 100;
};

exports.merge = (...objs) => Object.assign({}, ...objs);
