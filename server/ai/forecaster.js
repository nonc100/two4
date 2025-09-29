const ACTION_TEMPLATES = {
  push: 'Action: Push(가볍게) — 돌파 흐름을 살피세요.',
  balance: 'Action: Balance — 호흡을 맞추고 과열만 피하세요.',
  protect: 'Action: Protect — 방어선과 리스크 관리를 우선하세요.',
};

const SKY_DESCRIPTIONS = {
  sunny: '햇살이 선명합니다.',
  clear: '하늘이 개었어요.',
  breeze: '산들바람이 불며 기류가 부드럽습니다.',
  overcast: '구름이 낮게 깔렸습니다.',
  storm: '폭풍구름이 몰려옵니다.',
  typhoon: '태풍 경보급 구름이 감돌아요.',
};

const TREND_DESCRIPTIONS = {
  up: '바람은 상단으로 불어요. 돌파 시도 신호입니다.',
  flat: '기압은 균형을 잡으며 관망 흐름입니다.',
  down: '하강 기류가 강하게 내려옵니다. 보호 우선이에요.',
};

const VOLATILITY_DESCRIPTIONS = {
  low: '변동성은 잔잔한 편.',
  normal: '파도는 보통 수준.',
  high: '출렁임이 큰 편입니다.',
  extreme: '번개 주의보, 파도가 큽니다.',
};

const CVD_DESCRIPTIONS = {
  whale_push: '고래가 밀어올립니다.',
  whale_dump: '고래가 물량을 털고 있어요.',
  retail_push: '개미 열기가 의외로 뜨겁습니다.',
  mixed: '매수·매도 힘이 뒤섞여요.',
  neutral: '수급은 아직 조용합니다.',
};

function describeBreadth(breadth) {
  if (typeof breadth !== 'number' || Number.isNaN(breadth)) return '';
  const pct = Math.round(breadth * 100);
  if (pct >= 70) return `참여도는 ${pct}%로 넓게 펼쳐집니다.`;
  if (pct >= 55) return `참여도는 ${pct}% 정도, 무게 중심이 안정적입니다.`;
  if (pct >= 40) return `참여도는 ${pct}% 수준, 중립권에서 줄다리기 중입니다.`;
  return `참여도는 ${pct}%로 얇습니다. 민첩하게 대응하세요.`;
}

function pickAction({ action, trend4h, volatility, cvdSignal }) {
  if (action && ACTION_TEMPLATES[action]) {
    return action;
  }

  if (trend4h === 'down' || volatility === 'extreme' || cvdSignal === 'whale_dump') {
    return 'protect';
  }
  if (trend4h === 'up' && (cvdSignal === 'whale_push' || cvdSignal === 'retail_push')) {
    return 'push';
  }
  return 'balance';
}

function buildNarrative(payload, { includeBreadth = true } = {}) {
  if (!payload || typeof payload !== 'object') return '';
  const { sky, breadth, volatility, trend4h, cvdSignal } = payload;

  const sentences = [];
  if (sky && SKY_DESCRIPTIONS[sky]) {
    sentences.push(SKY_DESCRIPTIONS[sky]);
  }

  if (volatility && VOLATILITY_DESCRIPTIONS[volatility]) {
    sentences.push(VOLATILITY_DESCRIPTIONS[volatility]);
  }

  if (trend4h && TREND_DESCRIPTIONS[trend4h]) {
    sentences.push(TREND_DESCRIPTIONS[trend4h]);
  }

  if (cvdSignal && CVD_DESCRIPTIONS[cvdSignal]) {
    sentences.push(CVD_DESCRIPTIONS[cvdSignal]);
  }

  if (includeBreadth) {
    const breadthLine = describeBreadth(breadth);
    if (breadthLine) sentences.push(breadthLine);
  }

  const deduped = sentences.filter(Boolean);
  if (!deduped.length) return '';

  if (deduped.length === 1) return deduped[0];
  return `${deduped[0]} ${deduped.slice(1).join(' ')}`;
}

function createForecast(payload, options = {}) {
  const narrative = buildNarrative(payload, options).trim();
  const selectedAction = pickAction(payload);
  const actionLine = ACTION_TEMPLATES[selectedAction] || ACTION_TEMPLATES.balance;

  return {
    narrative,
    action: actionLine,
    actionKey: selectedAction,
    combined: narrative ? `${narrative} ${actionLine}`.trim() : actionLine,
  };
}

function createHeadlineText(payload) {
  return createForecast(payload, { includeBreadth: true });
}

function createSectorText(payload) {
  return createForecast(payload, { includeBreadth: true });
}

module.exports = {
  createHeadlineText,
  createSectorText,
};
