const API_BASE = '/api/method';

const clone = value => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

const fallbackBoard = {
  updatedAt: new Date().toISOString(),
  indicators: [
    {
      slug: 'volume-depth',
      label: '-Volume-',
      title: '거래량 심도 & 누적 흐름',
      description: '현물 · 선물 거래량을 통합해 강도, 누적 델타를 추적합니다.',
      highlights: [
        '거래소별 실시간 체결 집계',
        '세션 구간별 누적 델타/OBV',
        '고래·기관 지갑 흐름 연동'
      ],
      status: { state: 'pending', label: 'DB 연동 대기', source: 'db' },
      filter: 'volume'
    },
    {
      slug: 'moving-average-suite',
      label: '-Moving Averages-',
      title: '트렌드 밴드 & 적응형 평균',
      description: '멀티 타임프레임 EMA/SMA와 적응형 MA로 추세 밴드를 구성합니다.',
      highlights: [
        'HTF/LTF 멀티 레이어 추세 지도',
        'KAMA · HMA · WMA 혼합 필터',
        '크로스오버 이벤트 자동 라벨링'
      ],
      status: { state: 'pending', label: '시그널 정렬 중', source: 'db' },
      filter: 'trend'
    },
    {
      slug: 'candlestick-lab',
      label: '-Candlesticks-',
      title: '캔들 패턴 라이브러리',
      description: '패턴과 거래량, 시장 미세구조 데이터를 결합해 컨텍스트를 제공합니다.',
      highlights: [
        'AI 패턴 스코어 · 확률 매핑',
        '볼륨 컨펌 / 라인 브레이크 감시',
        '세션 이벤트 주석 자동화'
      ],
      status: { state: 'pending', label: '패턴 피드 연결 대기', source: 'db' },
      filter: 'price'
    },
    {
      slug: 'open-interest-monitor',
      label: '-Open Interest-',
      title: 'OI 변동 & 파생상품 감시',
      description: '선물 미결제약정, 펀딩, 베이시스 데이터를 통합해 레버리지 포지션을 추적합니다.',
      highlights: [
        '거래소별 롱/숏 비율 디컴포즈',
        '펀딩레이트 과열 구간 알림',
        '커브 구조(Contango/Backwardation) 시각화'
      ],
      status: { state: 'pending', label: 'Derivatives API 연결 중', source: 'db' },
      filter: 'derivatives'
    },
    {
      slug: 'oscillator-suite',
      label: '-Oscillators-',
      title: '사이클 스캐너',
      description: 'RSI, Stochastic, MACD 등 변동성 조정 오실레이터를 묶어 과매수/과매도 구간을 탐지합니다.',
      highlights: [
        'EMA 평활화된 RSI 히트맵',
        '디버전스 자동 태깅',
        '미세 사이클 위상 정렬'
      ],
      status: { state: 'pending', label: '오실레이터 세트 로딩', source: 'db' },
      filter: 'oscillator'
    },
    {
      slug: 'momentum-engine',
      label: '-Momentum-',
      title: '모멘텀 & 추세 힘 지수',
      description: 'ROC, CCI, DMI를 혼합한 맞춤형 모멘텀 스코어를 제공합니다.',
      highlights: [
        '레이더 차트 기반 스코어 보드',
        '타임 디케이 기반 랭킹',
        '이벤트 트리거 알림'
      ],
      status: { state: 'pending', label: '랭킹 메트릭 계산 중', source: 'db' },
      filter: 'momentum'
    },
    {
      slug: 'volatility-lab',
      label: '-Volatility-',
      title: '변동성 공명 실험실',
      description: 'ATR, HV, 옵션 IV를 통합한 변동성 클러스터 분석.',
      highlights: [
        '스파이크/드롭 감지',
        '옵션 히스토리컬 vs. 임플라이드 비교',
        '공포/탐욕 밴드 추적'
      ],
      status: { state: 'pending', label: 'Volatility feed 준비 중', source: 'db' },
      filter: 'volatility'
    },
    {
      slug: 'custom-lab',
      label: '-Others-',
      title: '커스텀 실험 모듈',
      description: '온체인, 소셜, 거시 데이터를 결합한 맞춤형 실험 공간입니다.',
      highlights: [
        '온체인 플로우 / 토큰 로테이션',
        '뉴스 감성 지표 및 AI 스코어',
        '거시 이벤트 대비 시나리오'
      ],
      status: { state: 'pending', label: '외부 데이터 브리지 동기화', source: 'db' },
      filter: 'custom'
    }
  ],
  combinations: [
    {
      slug: 'multi-indicator-setup',
      label: 'Multi-Indicator Setup',
      title: '멀티 레이어 시그널 세트',
      description: '인디케이터 묶음을 프리셋으로 저장하고, 상황별 최적화된 시나리오를 제공합니다.',
      highlights: [
        '볼륨 + 추세 + 오실레이터 동시 확인',
        '조건부 알림 / 시나리오 플래너',
        '리밸런싱 히스토리 추적'
      ],
      status: { state: 'pending', label: 'Preset 업데이트 예정', source: 'db' },
      filters: ['volume', 'trend', 'oscillator']
    },
    {
      slug: 'signal-filters',
      label: 'Signal Filters',
      title: '시그널 필터 체계',
      description: '거짓 시그널 제거를 위한 필터 체인을 구성하고 성능을 검증합니다.',
      highlights: [
        '시장 구조 Breaker 감지',
        '히스테리시스 기반 필터',
        'P&L 충격 분석 리포트'
      ],
      status: { state: 'pending', label: '필터 체인 설계 중', source: 'db' },
      filters: ['price', 'momentum', 'oscillator']
    },
    {
      slug: 'backtest-results',
      label: 'Backtest Results',
      title: '백테스트 리포트',
      description: 'AWS S3에서 전략별 리포트를 불러와 성과를 검증하고 배포합니다.',
      highlights: [
        '전략별 KPI & 드로다운 테이블',
        '워킹/포워드 테스트 전환 로그',
        'S3 리포트 자동 보존 정책'
      ],
      status: { state: 'pending', label: 'S3 리소스 연결 대기', source: 's3' },
      filters: ['volatility', 'trend', 'custom']
    }
  ],
  integrations: {
    db: { state: 'pending', label: 'Sync 준비 중' },
    s3: { state: 'pending', label: 'Sync 준비 중' }
  },
  resources: [
    {
      title: 'Two.4 Strategy Blueprint (샘플)',
      href: '#',
      meta: 'PDF · 1.2MB · AWS S3',
      source: 's3'
    },
    {
      title: 'Indicator Stack Template (샘플)',
      href: '#',
      meta: 'JSON · 38KB · DB Export',
      source: 'db'
    }
  ]
};

const integrationLabels = {
  connected: 'Connected',
  syncing: 'Syncing',
  pending: 'Sync 준비 중',
  error: 'Error'
};

function formatUpdatedAt(timestamp) {
  if (!timestamp) return 'Last sync — 준비 중';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Last sync — 준비 중';
    const formatted = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
    return `Last sync — ${formatted}`;
  } catch (error) {
    return 'Last sync — 준비 중';
  }
}

function createList(items = []) {
  const list = document.createElement('ul');
  list.className = 'method-card__list';
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
  return list;
}

function createCard(item) {
  const article = document.createElement('article');
  article.className = 'method-card';
  article.dataset.group = item.filter || 'all';
  article.setAttribute('role', 'listitem');

  const label = document.createElement('span');
  label.className = 'method-card__label';
  label.textContent = item.label;

  const title = document.createElement('h4');
  title.className = 'method-card__title';
  title.textContent = item.title;

  const meta = document.createElement('p');
  meta.className = 'method-card__meta';
  meta.textContent = item.description;

  article.appendChild(label);
  article.appendChild(title);
  article.appendChild(meta);
  article.appendChild(createList(item.highlights));

  if (item.status) {
    const status = document.createElement('div');
    status.className = 'method-card__status';
    status.innerHTML = `<span class="pulse-dot" aria-hidden="true"></span>${item.status.label}`;
    status.dataset.source = item.status.source || 'db';
    article.appendChild(status);
  }

  return article;
}

function createComboCard(item) {
  const card = createCard(item);
  if (item.filters) {
    card.dataset.groups = item.filters.join(',');
  }
  return card;
}

function applyBoardData(board) {
  const indicatorGrid = document.getElementById('indicatorGrid');
  const combinationGrid = document.getElementById('combinationGrid');
  const boardUpdated = document.getElementById('boardUpdated');

  indicatorGrid.innerHTML = '';
  combinationGrid.innerHTML = '';

  board.indicators.forEach(entry => {
    indicatorGrid.appendChild(createCard(entry));
  });

  board.combinations.forEach(entry => {
    combinationGrid.appendChild(createComboCard(entry));
  });

  boardUpdated.textContent = formatUpdatedAt(board.updatedAt);
}

function updateIntegrationStatus(key, payload) {
  const row = document.querySelector(`.integration-status__item[data-integration="${key}"]`);
  if (!row) return;
  const pill = row.querySelector('.status-pill');
  if (!pill) return;
  const state = payload?.state || 'pending';
  const label = payload?.label || integrationLabels[state] || integrationLabels.pending;
  pill.dataset.status = state;
  pill.textContent = label;
}

function renderResources(resources = []) {
  const list = document.getElementById('resourceList');
  if (!list) return;
  list.innerHTML = '';

  if (!resources.length) {
    const empty = document.createElement('p');
    empty.className = 'board-title__desc';
    empty.textContent = '연결이 완료되면 전략 리포트와 템플릿이 자동으로 표시됩니다.';
    list.appendChild(empty);
    return;
  }

  resources.forEach(item => {
    const row = document.createElement('div');
    row.className = 'resource-item';
    row.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M5 8.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 15.5v-7Z" />
        <path d="M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5" />
      </svg>
      <div>
        <a href="${item.href}" target="_blank" rel="noopener" aria-label="${item.title}">${item.title}</a>
        <div style="font-size:0.76rem;color:rgba(200,224,255,0.55);margin-top:4px;">${item.meta || ''}</div>
      </div>
    `;
    list.appendChild(row);
  });
}

function setupFilters() {
  const buttons = document.querySelectorAll('.board-filters button');
  const indicatorCards = () => Array.from(document.querySelectorAll('#indicatorGrid .method-card'));
  const comboCards = () => Array.from(document.querySelectorAll('#combinationGrid .method-card'));

  function handleFilter(filter) {
    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));

    indicatorCards().forEach(card => {
      const isVisible = filter === 'all' || card.dataset.group === filter;
      card.style.display = isVisible ? '' : 'none';
    });

    comboCards().forEach(card => {
      const groups = (card.dataset.groups || '').split(',').filter(Boolean);
      const isVisible = filter === 'all' || groups.includes(filter);
      card.style.display = isVisible ? '' : 'none';
    });
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => handleFilter(button.dataset.filter));
  });

  const initial = document.querySelector('.board-filters button.active');
  handleFilter(initial ? initial.dataset.filter : 'all');
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function loadBoard() {
  let boardData = clone(fallbackBoard);

  try {
    const remote = await fetchJSON(`${API_BASE}/board`);
    boardData = {
      ...boardData,
      ...remote,
      indicators: remote?.indicators?.length ? remote.indicators : boardData.indicators,
      combinations: remote?.combinations?.length ? remote.combinations : boardData.combinations,
      resources: remote?.resources ?? boardData.resources,
      integrations: { ...boardData.integrations, ...remote?.integrations }
    };
  } catch (error) {
    console.info('[METHOD] Using fallback board data.', error);
  }

  applyBoardData(boardData);
  setupFilters();
  updateIntegrationStatus('db', boardData.integrations?.db);
  updateIntegrationStatus('s3', boardData.integrations?.s3);
  renderResources(boardData.resources);

  await Promise.allSettled([
    refreshIntegration('db'),
    refreshIntegration('s3'),
    refreshResources()
  ]);
}

async function refreshIntegration(key) {
  try {
    const payload = await fetchJSON(`${API_BASE}/status/${key}`);
    updateIntegrationStatus(key, payload);
  } catch (error) {
    console.info(`[METHOD] ${key} status fallback.`, error);
  }
}

async function refreshResources() {
  try {
    const payload = await fetchJSON(`${API_BASE}/resources`);
    if (Array.isArray(payload) && payload.length) {
      renderResources(payload);
    }
  } catch (error) {
    console.info('[METHOD] Resource list fallback.', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadBoard().catch(error => {
    console.error('[METHOD] 초기화 실패', error);
  });
});
