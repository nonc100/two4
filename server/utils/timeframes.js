const TIMEFRAME_DEFINITIONS = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const SUPPORTED_TIMEFRAMES = Object.keys(TIMEFRAME_DEFINITIONS);

function normalizeTimeframe(raw, defaultValue = '1m') {
  if (!raw) return defaultValue;
  const value = String(raw).trim();
  if (!value) return defaultValue;
  const lower = value.toLowerCase();
  if (SUPPORTED_TIMEFRAMES.includes(lower)) {
    return lower;
  }
  return defaultValue;
}

function timeframeToMs(raw) {
  const tf = normalizeTimeframe(raw);
  return TIMEFRAME_DEFINITIONS[tf];
}

module.exports = {
  SUPPORTED_TIMEFRAMES,
  normalizeTimeframe,
  timeframeToMs,
};
