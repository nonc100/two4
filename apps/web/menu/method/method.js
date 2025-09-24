const forumData = {
  updatedAt: new Date().toISOString(),
  categories: [
    {
      id: 'volume',
      group: 'indicators',
      title: 'Volume Indicators',
      label: '거래량',
      badge: 'VOLUME / 거래량',
      meta: '거래량 흐름과 누적 델타로 강도와 다이버전스를 추적합니다.',
      heroIcon: '📊',
      overlayTitle: '거래량 지표',
      overlayDescription: '거래량 기반 데이터로 매수·매도 압력과 추세 강도를 확인합니다.',
      description:
        '거래량 기반 지표는 시장의 매수/매도 압력과 추세 강도를 파악하는 핵심 도구입니다. OBV, VWAP, 누적 델타와 같은 시그널을 결합해 주요 전환 구간을 추적합니다.'
    },
    {
      id: 'moving-averages',
      group: 'indicators',
      title: 'Moving Average Indicators',
      label: '이동평균',
      badge: 'TREND / 이동평균',
      meta: '평균값 밴드와 적응형 추세 지표로 방향성을 정의합니다.',
      heroIcon: '📈',
      overlayTitle: '이동평균 지표',
      overlayDescription: 'EMA, SMA, 적응형 평균을 조합해 다중 타임프레임 추세를 분석합니다.',
      description:
        '이동평균 지표는 가격 데이터를 평활화하여 추세를 파악하고 지지/저항대를 설정합니다. EMA, SMA, KAMA 등의 평균값과 밴드형 지표를 활용해 시장 구조를 해석합니다.'
    },
    {
      id: 'candlesticks',
      group: 'indicators',
      title: 'Candlestick Patterns',
      label: '캔들스틱',
      badge: 'PRICE ACTION / 패턴',
      meta: '캔들 구조, FVG, 오더블록 등을 기반으로 맥락을 읽어냅니다.',
      heroIcon: '🕯️',
      overlayTitle: '캔들 패턴 분석',
      overlayDescription: '가격 패턴과 체결 흐름을 결합해 전환 구간과 유동성 영역을 탐지합니다.',
      description:
        '캔들스틱 카테고리는 패턴과 체결량, 시장 미세구조 데이터를 결합해 컨텍스트를 제공합니다. FVG, 오더블록, 유동성 풀을 추적해 매매 시나리오를 정리합니다.'
    },
    {
      id: 'open-interest',
      group: 'indicators',
      title: 'Open Interest Analysis',
      label: '미결제약정',
      badge: 'DERIVATIVES / OI',
      meta: '선물/옵션 포지션 변화를 추적해 레버리지 흐름을 확인합니다.',
      heroIcon: '🧭',
      overlayTitle: '미결제약정 분석',
      overlayDescription: 'OI, 펀딩비, 베이시스 데이터를 통합해 파생상품 포지션을 추적합니다.',
      description:
        '미결제약정 지표는 선물과 옵션 포지션 변화를 분석하여 레버리지 흐름을 파악합니다. 펀딩비, 베이시스, 롱/숏 비율을 통합해 고래 포지션을 모니터링합니다.'
    },
    {
      id: 'oscillators',
      group: 'indicators',
      title: 'Oscillator Indicators',
      label: '오실레이터',
      badge: 'OSCILLATOR / 사이클',
      meta: '상대적 강도와 과매수/과매도 구간을 정밀 탐지합니다.',
      heroIcon: '⚡',
      overlayTitle: '오실레이터 지표',
      overlayDescription: 'RSI, Stochastic 등 범위 기반 지표로 사이클 전환을 포착합니다.',
      description:
        '오실레이터 지표는 RSI, Stochastic, MACD 등 범위 기반 도구로 과매수/과매도 영역을 판단하고 추세 전환을 예측합니다. 변동성 조정과 디버전스 탐지를 병행합니다.'
    },
    {
      id: 'momentum',
      group: 'indicators',
      title: 'Momentum Indicators',
      label: '모멘텀',
      badge: 'MOMENTUM / 속도',
      meta: '가격 변화율과 추세의 가속도를 계량화합니다.',
      heroIcon: '🚀',
      overlayTitle: '모멘텀 지표',
      overlayDescription: 'ROC, CCI, DMI 등 속도 기반 지표로 추세의 힘을 측정합니다.',
      description:
        '모멘텀 지표는 가격 변화 속도와 가속도를 측정해 추세 지속 여부를 판단합니다. ROC, CCI, DMI 기반의 커스텀 스코어링으로 랭킹을 구성합니다.'
    },
    {
      id: 'volatility',
      group: 'indicators',
      title: 'Volatility Indicators',
      label: '변동성',
      badge: 'VOLATILITY / 리스크',
      meta: 'ATR, HV, 옵션 IV 지표로 변동성 클러스터를 분석합니다.',
      heroIcon: '🌊',
      overlayTitle: '변동성 지표',
      overlayDescription: '시장 변동성과 분산을 계량화하여 돌파 구간과 리스크를 평가합니다.',
      description:
        '변동성 지표는 ATR, HV, 옵션 IV 데이터를 결합하여 변동성 클러스터와 스파이크/드롭 구간을 탐지합니다. 리스크 관리와 포지션 사이징에 활용합니다.'
    },
    {
      id: 'others',
      group: 'indicators',
      title: 'Other Indicators',
      label: '기타',
      badge: 'CUSTOM / 실험실',
      meta: '온체인, 거시, AI 기반 실험 지표를 정리합니다.',
      heroIcon: '🧪',
      overlayTitle: '커스텀 실험 모듈',
      overlayDescription: '온체인·거시·AI 시그널을 결합한 실험적 지표를 아카이브합니다.',
      description:
        '기타 카테고리는 온체인, 거시, AI 분석 등 표준 분류를 벗어난 지표를 수집합니다. 실험적 접근과 시나리오 기반 분석을 기록합니다.'
    },
    {
      id: 'multi-indicator',
      group: 'combinations',
      title: 'Multi-Indicator Setups',
      label: '다중지표',
      badge: 'STACK / PRESET',
      meta: '볼륨-추세-모멘텀 스택을 프리셋으로 정리합니다.',
      heroIcon: '🛰️',
      overlayTitle: '다중지표 프리셋',
      overlayDescription: '여러 지표를 조합해 조건부 시그널 체인을 구축합니다.',
      description:
        '다중지표 프리셋은 볼륨, 추세, 모멘텀 지표를 조합해 특정 시나리오를 자동으로 감시합니다. 조건부 알림과 시그널 필터링 로직을 정리합니다.'
    },
    {
      id: 'signal-filters',
      group: 'combinations',
      title: 'Signal Filters',
      label: '시그널 필터',
      badge: 'FILTER / NOISE CONTROL',
      meta: '시그널 노이즈를 제거해 정확도를 높입니다.',
      heroIcon: '🎯',
      overlayTitle: '시그널 필터 체계',
      overlayDescription: '시장 구조와 히스테리시스를 활용해 거짓 시그널을 줄입니다.',
      description:
        '시그널 필터 카테고리는 시장 구조, 히스테리시스, 변동성 필터를 이용해 거짓 시그널을 제거합니다. 각 필터 체인의 성능과 적용 사례를 정리합니다.'
    },
    {
      id: 'backtest',
      group: 'combinations',
      title: 'Backtest Results & Analysis',
      label: '백테스트',
      badge: 'BACKTEST / PERFORMANCE',
      meta: '성과 지표와 리스크 프로파일을 수치화합니다.',
      heroIcon: '📚',
      overlayTitle: '백테스트 리포트',
      overlayDescription: '전략별 성과지표와 시뮬레이션 로그를 기록합니다.',
      description:
        '백테스트 카테고리는 전략별 성과 지표, 드로다운, 워킹/포워드 테스트 로그를 아카이브합니다. 데이터 소스와 S3 리포트를 연결할 수 있도록 구성했습니다.'
    }
  ],
  posts: [
    {
      id: 'p-volume-1',
      category: 'volume',
      hero: '📈',
      title: 'OBV + Price Divergence Strategy',
      excerpt:
        'OBV와 가격 다이버전스를 결합해 중기 추세에서 높은 승률을 기록한 전략입니다. 타임프레임별 최적 설정값과 필수 확인 지표를 정리했습니다.',
      content: `
        <h3>개요</h3>
        <p>On-Balance Volume (OBV)와 가격 다이버전스를 결합한 전략입니다. 특히 4H~12H 구간에서 신뢰도가 높으며, 거래량이 동반되지 않는 가격 움직임을 필터링합니다.</p>
        <h3>설정 방법</h3>
        <ul>
          <li>OBV 지표에 21EMA를 적용해 기울기를 확인합니다.</li>
          <li>가격과 OBV의 다이버전스가 발생할 때 RSI(14)로 추가 컨펌을 진행합니다.</li>
          <li>누적 델타와 거래량 프로파일로 주요 레벨을 체크합니다.</li>
        </ul>
        <h3>진입 조건</h3>
        <p>가격이 상승하지만 OBV는 하락하는 베어리시 다이버전스가 발생하고, RSI가 70 이상에서 하락 전환할 때 숏 진입을 고려합니다. 반대 시나리오로는 롱 포지션을 구성합니다.</p>
        <h3>리스크 관리</h3>
        <p>손절선은 진입가 기준 2% 상단에, 익절은 최소 1:2 비율로 설정합니다. 거래량이 평균 대비 120% 이상일 때만 시그널을 채택합니다.</p>
        <h3>백테스트 결과</h3>
        <p>최근 6개월간 승률 68%, 평균 수익률 3.2%, 최대 드로다운 6.5%를 기록했습니다.</p>
      `,
      author: 'SuperSmoother',
      created: '2시간 전',
      stats: { likes: 24, comments: 8, views: 156 },
      tags: ['OBV', 'Divergence', 'Volume Analysis']
    },
    {
      id: 'p-moving-1',
      category: 'moving-averages',
      hero: '📊',
      title: 'Specter Trend Cloud [ChartPrime]',
      excerpt:
        '이동평균 기반 트렌드 클라우드로 추세와 변곡점을 동시에 감지합니다. 색상 밴드와 알림 로직을 커스터마이즈했습니다.',
      content: `
        <h3>구성</h3>
        <p>Specter Trend Cloud는 EMA 34/55 기반의 코어 밴드와 HMA 필터를 결합합니다. 구름 색상은 추세 강도에 따라 단계적으로 변환됩니다.</p>
        <h3>활용법</h3>
        <ul>
          <li>클라우드 외부에서 가격이 유지되는지로 추세 지속 여부를 판단합니다.</li>
          <li>클라우드 내부 재진입 시 거래량과 오실레이터 컨펌을 요구합니다.</li>
          <li>거래량이 평균 대비 80% 미만일 때는 신호를 무시합니다.</li>
        </ul>
        <h3>추가 설정</h3>
        <p>멀티 타임프레임 EMA와 VWAP 레벨을 추가해 추세 방향과 유동성 레벨을 동시에 확인합니다.</p>
      `,
      author: 'ChartPrime',
      created: '5시간 전',
      stats: { likes: 67, comments: 12, views: 234 },
      tags: ['Trend Cloud', 'Moving Average']
    },
    {
      id: 'p-oscillator-1',
      category: 'oscillators',
      hero: '⚡',
      title: 'Momentum Shift Oscillator (MSO)',
      excerpt:
        'RSI, ROC, MACD의 장점을 합친 커스텀 오실레이터입니다. 위상 변화와 디버전스를 자동 태깅합니다.',
      content: `
        <h3>핵심 아이디어</h3>
        <p>RSI 21, ROC 9, MACD(12, 26, 9)를 결합해 시그널 라인을 생성합니다. 위상 변화가 발생하면 색상과 알림이 동시에 전송됩니다.</p>
        <h3>세부 설정</h3>
        <ul>
          <li>RSI는 EMA 3으로 추가 평활화합니다.</li>
          <li>ROC는 절대값 2.5 이상에서 강한 모멘텀으로 표시합니다.</li>
          <li>MACD 히스토그램이 0을 돌파할 때만 주요 신호를 허용합니다.</li>
        </ul>
        <h3>검증</h3>
        <p>비트코인 4H 차트에서 1년간 백테스트한 결과 승률 63%, 평균 R/R 1:2.6을 기록했습니다.</p>
      `,
      author: 'SharpStat',
      created: '1일 전',
      stats: { likes: 143, comments: 28, views: 892 },
      tags: ['Oscillator', 'Momentum', 'Custom']
    },
    {
      id: 'p-combination-1',
      category: 'multi-indicator',
      hero: '🔥',
      title: 'NEXUS - SPA Strategy',
      excerpt:
        'Shadow Portfolio Adaptive 프레임워크로 볼륨·추세·심리 지표를 묶은 전략입니다. 조건부 가중치를 적용합니다.',
      content: `
        <h3>전략 구조</h3>
        <p>볼륨(누적 델타), 추세(Adaptive MA), 심리(볼륨 가중 RSI)를 결합한 3중 필터 전략입니다.</p>
        <h3>진입 규칙</h3>
        <ul>
          <li>세 필터 중 최소 두 가지가 동일 방향일 때만 진입합니다.</li>
          <li>포지션 사이즈는 신뢰도 스코어에 따라 0.5~1.5%로 조절합니다.</li>
          <li>백테스트 기준, 평단 대비 3% 역행 시 손절 처리합니다.</li>
        </ul>
        <h3>성과</h3>
        <p>12개월 백테스트 결과 CAGR 38%, 최대 드로다운 7.8%, 승률 61%를 기록했습니다.</p>
      `,
      author: 'INFLECTION',
      created: '2일 전',
      stats: { likes: 89, comments: 15, views: 445 },
      tags: ['Strategy', 'Portfolio', 'Adaptive']
    },
    {
      id: 'p-other-1',
      category: 'others',
      hero: '🎯',
      title: 'Institutional Levels (CNN)',
      excerpt:
        'CNN 기반으로 기관 매물대를 추정하는 실험 지표입니다. 자동화된 구역 감지와 백테스트 로그를 공유합니다.',
      content: `
        <h3>알고리즘 개요</h3>
        <p>거래량 프로파일, 체결 강도, 파생상품 데이터를 입력값으로 사용하는 1D CNN 네트워크를 구성했습니다.</p>
        <h3>출력</h3>
        <p>구역별 확률 스코어와 신뢰도를 0~1 사이로 출력하며, 상위 10% 구간만 차트에 표시합니다.</p>
        <h3>활용 전략</h3>
        <p>추세 추종 전략과 병행 시 손익비가 개선되며, 기관 물량 추적용으로 활용할 수 있습니다.</p>
      `,
      author: 'PhenLab',
      created: '3일 전',
      stats: { likes: 201, comments: 45, views: 1200 },
      tags: ['AI', 'Neural Network', 'Institutional']
    },
    {
      id: 'p-volatility-1',
      category: 'volatility',
      hero: '🌊',
      title: 'Mean Reversion Probability Zones',
      excerpt:
        '평균 회귀 확률을 구간화하여 변동성에 따른 포지션 스케일링 전략을 제공합니다.',
      content: `
        <h3>지표 구조</h3>
        <p>ATR 기반 밴드와 히스토리컬 볼래틸리티를 결합해 확률 구간을 산출합니다. 가격이 상단 밴드에서 유지될수록 회귀 확률이 감소합니다.</p>
        <h3>활용법</h3>
        <ul>
          <li>확률 70% 이상 구간에서 역추세 스캘핑을 고려합니다.</li>
          <li>포지션 규모는 확률 * 변동성 스코어로 조정합니다.</li>
          <li>트레일링 스탑은 VWAP ± ATR(2)로 설정합니다.</li>
        </ul>
      `,
      author: 'BigBeluga',
      created: '1주 전',
      stats: { likes: 156, comments: 32, views: 678 },
      tags: ['Mean Reversion', 'Probability', 'Zones']
    }
  ]
};

const METHOD_POSTS_ENDPOINT = '/api/method/posts';
const OWN_POSTS_STORAGE_KEY = 'two4.method.ownPosts';

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch (error) {
    return false;
  }
}

function loadOwnPosts() {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(OWN_POSTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(id => typeof id === 'string');
  } catch (error) {
    console.error('Failed to load saved METHOD posts', error);
    return [];
  }
}

const state = {
  currentCategory: forumData.categories[0]?.id ?? 'volume',
  basePosts: forumData.posts.map(post => normalizePost(post, 'static')).filter(Boolean),
  remotePosts: [],
  descriptions: Object.fromEntries(forumData.categories.map(category => [category.id, category.description])),
  ownPosts: loadOwnPosts(),
  isPosting: false,
  deletingPostId: null,
  currentDetailPostId: null
};

const elements = {
  boardView: document.getElementById('boardView'),
  detailView: document.getElementById('detailView'),
  categoryBadge: document.getElementById('categoryBadge'),
  categoryTitle: document.getElementById('categoryTitle'),
  categoryMeta: document.getElementById('categoryMeta'),
  categoryVisual: document.getElementById('categoryVisual'),
  categoryOverlayTitle: document.getElementById('categoryOverlayTitle'),
  categoryOverlayDesc: document.getElementById('categoryOverlayDesc'),
  descriptionContent: document.getElementById('descriptionContent'),
  descriptionEdit: document.getElementById('descriptionEdit'),
  descriptionTextarea: document.getElementById('descriptionTextarea'),
  postsList: document.getElementById('postsList'),
  postForm: document.getElementById('postForm'),
  postCategory: document.getElementById('postCategory'),
  postTitle: document.getElementById('postTitle'),
  postContent: document.getElementById('postContent'),
  postTags: document.getElementById('postTags'),
  newPostButton: document.getElementById('newPostButton'),
  newPostButtonIcon: document.getElementById('newPostButtonIcon'),
  newPostButtonLabel: document.getElementById('newPostButtonLabel'),
  cancelPostButton: document.getElementById('cancelPostButton'),
  submitPostButton: document.getElementById('submitPostButton'),
  editDescriptionButton: document.getElementById('editDescriptionButton'),
  cancelDescriptionButton: document.getElementById('cancelDescriptionButton'),
  saveDescriptionButton: document.getElementById('saveDescriptionButton'),
  boardUpdated: document.getElementById('boardUpdated'),
  backToBoardButton: document.getElementById('backToBoardButton'),
  detailCategory: document.getElementById('detailCategory'),
  detailTitle: document.getElementById('detailTitle'),
  detailAuthor: document.getElementById('detailAuthor'),
  detailDate: document.getElementById('detailDate'),
  detailStats: document.getElementById('detailStats'),
  postDetailContent: document.getElementById('postDetailContent'),
  postDetailTags: document.getElementById('postDetailTags'),
  postDetailInteractions: document.getElementById('postDetailInteractions'),
  deletePostButton: document.getElementById('deletePostButton')
};

const groupLists = Array.from(document.querySelectorAll('[data-group-list]')).reduce((acc, element) => {
  acc[element.dataset.groupList] = element;
  return acc;
}, {});

function formatUpdatedAt(timestamp) {
  if (!timestamp) return 'Last sync — 준비 중';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Last sync — 준비 중';
    return `Last sync — ${new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)}`;
  } catch (error) {
    return 'Last sync — 준비 중';
  }
}

function createExcerptFromHtml(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const slice = text.slice(0, 150);
  return text.length > 150 ? `${slice}…` : slice;
}

function normalizePost(post, source = 'remote') {
  if (!post || typeof post !== 'object') return null;

  const id = typeof post.id === 'string' && post.id.trim() ? post.id.trim() : `temp-${Date.now().toString(36)}`;
  const createdAt = typeof post.createdAt === 'string' && !Number.isNaN(Date.parse(post.createdAt))
    ? post.createdAt
    : null;
  const timestamp = createdAt ? Date.parse(createdAt) : Number.isFinite(Number(post.timestamp)) ? Number(post.timestamp) : null;
  const contentHtml = typeof post.contentHtml === 'string'
    ? post.contentHtml
    : typeof post.content === 'string'
      ? post.content
      : '';
  const tags = Array.isArray(post.tags)
    ? post.tags
        .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const stats = post.stats && typeof post.stats === 'object' ? post.stats : {};

  return {
    id,
    category: typeof post.category === 'string' && post.category.trim()
      ? post.category.trim()
      : forumData.categories[0]?.id ?? 'volume',
    title: typeof post.title === 'string' && post.title.trim() ? post.title.trim() : 'Untitled',
    author: typeof post.author === 'string' && post.author.trim() ? post.author.trim() : 'Anonymous',
    tags,
    stats: {
      likes: Number.isFinite(Number(stats.likes)) ? Number(stats.likes) : 0,
      comments: Number.isFinite(Number(stats.comments)) ? Number(stats.comments) : 0,
      views: Number.isFinite(Number(stats.views)) ? Number(stats.views) : 0
    },
    excerpt: typeof post.excerpt === 'string' && post.excerpt.trim() ? post.excerpt.trim() : createExcerptFromHtml(contentHtml),
    contentHtml,
    createdAt,
    createdLabel: typeof post.created === 'string' && post.created.trim() ? post.created.trim() : '',
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    source
  };
}

function sortPosts(posts) {
  return posts
    .slice()
    .sort((a, b) => {
      const aTime = Number.isFinite(a?.timestamp) ? a.timestamp : Number.MIN_SAFE_INTEGER;
      const bTime = Number.isFinite(b?.timestamp) ? b.timestamp : Number.MIN_SAFE_INTEGER;
      return bTime - aTime;
    });
}

function getAllPosts() {
  return [...state.remotePosts, ...state.basePosts];
}

function getPostsForCategory(categoryId) {
  return sortPosts(getAllPosts().filter(post => post.category === categoryId));
}

function isOwnPost(postId) {
  return state.ownPosts.includes(postId);
}

function saveOwnPosts() {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(OWN_POSTS_STORAGE_KEY, JSON.stringify(state.ownPosts));
  } catch (error) {
    console.error('Failed to persist METHOD posts', error);
  }
}

function addOwnPostId(postId) {
  if (!postId || isOwnPost(postId)) return;
  state.ownPosts.push(postId);
  saveOwnPosts();
}

function removeOwnPostId(postId) {
  const index = state.ownPosts.indexOf(postId);
  if (index === -1) return;
  state.ownPosts.splice(index, 1);
  saveOwnPosts();
}

function formatRelativeTime(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const now = Date.now();
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 45 * 1000) return '방금 전';

  const units = [
    { unit: 'year', value: 1000 * 60 * 60 * 24 * 365 },
    { unit: 'month', value: 1000 * 60 * 60 * 24 * 30 },
    { unit: 'day', value: 1000 * 60 * 60 * 24 },
    { unit: 'hour', value: 1000 * 60 * 60 },
    { unit: 'minute', value: 1000 * 60 }
  ];

  const formatter = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
  for (const { unit, value } of units) {
    if (abs >= value || unit === 'minute') {
      const amount = Math.round(diff / value);
      return formatter.format(amount, unit);
    }
  }
  return '방금 전';
}

function formatPostDate(post) {
  if (!post) return '방금 전';
  const relative = formatRelativeTime(post.timestamp);
  if (relative) return relative;
  return post.createdLabel || '방금 전';
}

function renderCategories() {
  forumData.categories.forEach(category => {
    const list = groupLists[category.group];
    if (!list) return;
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category.title;
    button.dataset.id = category.id;
    button.dataset.label = category.label;
    button.addEventListener('click', () => selectCategory(category.id));
    listItem.appendChild(button);
    list.appendChild(listItem);
  });
}

function populateCategorySelect() {
  if (!elements.postCategory) return;
  elements.postCategory.innerHTML = '';
  forumData.categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.title;
    elements.postCategory.appendChild(option);
  });
  elements.postCategory.value = state.currentCategory;
}

function selectCategory(categoryId) {
  state.currentCategory = categoryId;
  closePostDetail();
  if (!elements.descriptionEdit.hasAttribute('hidden')) {
    closeDescriptionEditor();
  }
  updateActiveCategory();
  updateCategoryHeader();
  updateDescription();
  renderPosts();
  if (elements.postCategory) {
    elements.postCategory.value = categoryId;
  }
}

function updateActiveCategory() {
  document.querySelectorAll('.category-nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.id === state.currentCategory);
  });
}

function updateCategoryHeader() {
  const category = forumData.categories.find(item => item.id === state.currentCategory);
  if (!category) return;
  elements.categoryBadge.textContent = category.badge;
  elements.categoryTitle.textContent = category.title;
  elements.categoryMeta.textContent = category.meta;
  elements.categoryVisual.textContent = category.heroIcon;
  elements.categoryOverlayTitle.textContent = category.overlayTitle;
  elements.categoryOverlayDesc.textContent = category.overlayDescription;
}

function updateDescription() {
  const description = state.descriptions[state.currentCategory] ?? '';
  elements.descriptionContent.innerHTML = description ? `<p>${description}</p>` : '<p>이 카테고리에 대한 설명을 작성해주세요.</p>';
  if (!elements.descriptionEdit.hasAttribute('hidden')) {
    elements.descriptionTextarea.value = description;
  }
}

function renderPosts() {
  if (!elements.postsList) return;
  elements.postsList.innerHTML = '';
  const posts = getPostsForCategory(state.currentCategory);
  if (posts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '아직 등록된 게시글이 없습니다. 첫 번째 전략을 공유해보세요!';
    elements.postsList.appendChild(empty);
    return;
  }
  posts.forEach(post => {
    const card = createPostCard(post);
    if (card) {
      elements.postsList.appendChild(card);
    }
  });
}

function createPostCard(post) {
  if (!post) return null;
  const card = document.createElement('article');
  card.className = 'post-card';
  card.tabIndex = 0;
  card.dataset.postId = post.id;

  if (isOwnPost(post.id)) {
    const actions = document.createElement('div');
    actions.className = 'post-card__actions';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'post-card__delete';
    deleteButton.textContent = '삭제';
    deleteButton.setAttribute('aria-label', '게시글 삭제');
    deleteButton.addEventListener('click', event => {
      event.stopPropagation();
      handleDeletePost(post.id, deleteButton);
    });
    actions.appendChild(deleteButton);
    card.appendChild(actions);
  }

  const meta = document.createElement('div');
  meta.className = 'post-card__meta';
  const author = document.createElement('strong');
  author.textContent = post.author;
  const time = document.createElement('span');
  time.textContent = formatPostDate(post);
  meta.append(author, time);

  const title = document.createElement('h3');
  title.textContent = post.title;

  const excerpt = document.createElement('p');
  excerpt.textContent = post.excerpt;

  const footer = document.createElement('div');
  footer.className = 'post-card__footer';

  const tags = document.createElement('div');
  tags.className = 'post-card__tags';
  post.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tags.appendChild(span);
  });

  const stats = document.createElement('div');
  stats.className = 'post-card__stats';
  stats.innerHTML = `<span>👍 ${post.stats.likes}</span><span>💬 ${post.stats.comments}</span><span>👁 ${post.stats.views}</span>`;

  footer.append(tags, stats);
  card.append(meta, title, excerpt, footer);

  card.addEventListener('click', () => openPostDetail(post.id));
  card.addEventListener('keypress', event => {
    if (event.key === 'Enter') {
      openPostDetail(post.id);
    }
  });

  return card;
}

function openPostDetail(postId) {
  const post = getAllPosts().find(item => item.id === postId);
  if (!post) return;
  const category = forumData.categories.find(item => item.id === post.category);
  elements.detailCategory.textContent = category ? category.badge : 'METHOD';
  elements.detailTitle.textContent = post.title;
  elements.detailAuthor.textContent = post.author;
  elements.detailDate.textContent = formatPostDate(post);
  elements.detailStats.textContent = `👍 ${post.stats.likes} · 💬 ${post.stats.comments} · 👁 ${post.stats.views}`;
  elements.postDetailContent.innerHTML = post.contentHtml || '';
  elements.postDetailTags.innerHTML = '';
  post.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    elements.postDetailTags.appendChild(span);
  });
  elements.postDetailInteractions.innerHTML = `
    <span>좋아요 ${post.stats.likes}</span>
    <span>댓글 ${post.stats.comments}</span>
    <span>조회수 ${post.stats.views}</span>
  `;
  state.currentDetailPostId = post.id;
  if (elements.deletePostButton) {
    if (isOwnPost(post.id)) {
      elements.deletePostButton.removeAttribute('hidden');
    } else {
      elements.deletePostButton.setAttribute('hidden', '');
    }
  }
  elements.boardView.hidden = true;
  elements.detailView.hidden = false;
}

function closePostDetail() {
  state.currentDetailPostId = null;
  elements.detailView.hidden = true;
  elements.boardView.hidden = false;
  elements.deletePostButton?.setAttribute('hidden', '');
}

function togglePostForm(forceState) {
  if (!elements.postForm) return;
  const shouldOpen = typeof forceState === 'boolean' ? forceState : elements.postForm.hasAttribute('hidden');
  if (shouldOpen) {
    elements.postForm.removeAttribute('hidden');
    elements.newPostButton?.setAttribute('aria-expanded', 'true');
    if (elements.newPostButtonIcon) elements.newPostButtonIcon.textContent = '×';
    if (elements.newPostButtonLabel) elements.newPostButtonLabel.textContent = '닫기';
    elements.postTitle?.focus();
  } else {
    elements.postForm.setAttribute('hidden', '');
    elements.newPostButton?.setAttribute('aria-expanded', 'false');
    if (elements.newPostButtonIcon) elements.newPostButtonIcon.textContent = '✎';
    if (elements.newPostButtonLabel) elements.newPostButtonLabel.textContent = '글쓰기';
  }
}

async function handlePostSubmit(event) {
  event.preventDefault();
  if (state.isPosting) return;
  const title = elements.postTitle.value.trim();
  const content = elements.postContent.value.trim();
  const category = elements.postCategory.value;
  const tags = elements.postTags.value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);

  if (!title || !content) {
    alert('제목과 내용을 모두 입력해주세요.');
    return;
  }

  const payload = {
    title,
    content,
    category,
    tags: tags.length ? tags : ['새글'],
    author: 'You'
  };

  try {
    state.isPosting = true;
    if (elements.submitPostButton) {
      elements.submitPostButton.disabled = true;
      elements.submitPostButton.textContent = '게시 중…';
    }
    const response = await createRemotePost(payload);
    const createdPost = normalizePost(response.post, 'remote');
    if (createdPost) {
      state.remotePosts.unshift(createdPost);
      addOwnPostId(createdPost.id);
    }
    elements.postForm.reset();
    togglePostForm(false);
    if (category !== state.currentCategory) {
      selectCategory(category);
    } else {
      renderPosts();
    }
    const updatedTimestamp = response.updatedAt || createdPost?.createdAt || new Date().toISOString();
    elements.boardUpdated.textContent = formatUpdatedAt(updatedTimestamp);
  } catch (error) {
    console.error('Failed to submit METHOD post', error);
    alert('게시글 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    state.isPosting = false;
    if (elements.submitPostButton) {
      elements.submitPostButton.disabled = false;
      elements.submitPostButton.textContent = '게시';
    }
  }
}

function openDescriptionEditor() {
  elements.descriptionTextarea.value = state.descriptions[state.currentCategory] ?? '';
  elements.descriptionEdit.removeAttribute('hidden');
  elements.descriptionContent.style.display = 'none';
  elements.descriptionTextarea.focus();
}

function closeDescriptionEditor() {
  elements.descriptionEdit.setAttribute('hidden', '');
  elements.descriptionContent.style.display = '';
}

function saveDescription() {
  const value = elements.descriptionTextarea.value.trim();
  if (value) {
    state.descriptions[state.currentCategory] = value;
    elements.descriptionContent.innerHTML = `<p>${value}</p>`;
  }
  closeDescriptionEditor();
}

async function fetchRemotePosts() {
  const response = await fetch(METHOD_POSTS_ENDPOINT, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`Failed to load posts (${response.status})`);
  }
  const data = await response.json();
  const posts = Array.isArray(data.posts) ? data.posts.map(item => normalizePost(item, 'remote')).filter(Boolean) : [];
  return { posts, updatedAt: data.updatedAt ?? null };
}

async function createRemotePost(payload) {
  const response = await fetch(METHOD_POSTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // ignore parse error
  }
  if (!response.ok) {
    const message = data?.error || 'Failed to create post';
    throw new Error(message);
  }
  if (!data?.post) {
    throw new Error('Invalid response from server');
  }
  return data;
}

async function deleteRemotePost(postId) {
  const response = await fetch(`${METHOD_POSTS_ENDPOINT}/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' }
  });
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // ignore parse error
  }
  if (!response.ok) {
    if (response.status === 404) {
      return { ok: false, removed: postId, updatedAt: null };
    }
    const message = data?.error || 'Failed to delete post';
    throw new Error(message);
  }
  return data;
}

async function loadRemotePosts() {
  try {
    const { posts, updatedAt } = await fetchRemotePosts();
    state.remotePosts = posts;
    renderPosts();
    if (updatedAt) {
      elements.boardUpdated.textContent = formatUpdatedAt(updatedAt);
    }
  } catch (error) {
    console.error('Failed to fetch METHOD posts', error);
  }
}

function setButtonLoading(button, loadingText) {
  if (!button) return () => {};
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  return () => {
    button.disabled = false;
    button.textContent = previous;
  };
}

async function handleDeletePost(postId, triggerButton) {
  if (!isOwnPost(postId) || state.deletingPostId === postId) return;
  if (!confirm('게시글을 삭제할까요?')) return;

  state.deletingPostId = postId;
  const restoreFns = [];
  if (triggerButton) {
    restoreFns.push(setButtonLoading(triggerButton, '삭제중…'));
  }
  if (elements.deletePostButton && state.currentDetailPostId === postId) {
    restoreFns.push(setButtonLoading(elements.deletePostButton, '삭제중…'));
  }

  try {
    const response = await deleteRemotePost(postId);
    state.remotePosts = state.remotePosts.filter(post => post.id !== postId);
    removeOwnPostId(postId);
    renderPosts();
    if (state.currentDetailPostId === postId) {
      closePostDetail();
    }
    const updatedTimestamp = response?.updatedAt || new Date().toISOString();
    elements.boardUpdated.textContent = formatUpdatedAt(updatedTimestamp);
  } catch (error) {
    console.error('Failed to delete METHOD post', error);
    alert('게시글 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    state.deletingPostId = null;
    restoreFns.forEach(fn => fn());
  }
}

function initializeEvents() {
  elements.newPostButton?.addEventListener('click', () => {
    closePostDetail();
    togglePostForm();
  });
  elements.cancelPostButton?.addEventListener('click', () => {
    elements.postForm.reset();
    togglePostForm(false);
  });
  elements.postForm?.addEventListener('submit', handlePostSubmit);
  elements.editDescriptionButton?.addEventListener('click', openDescriptionEditor);
  elements.cancelDescriptionButton?.addEventListener('click', closeDescriptionEditor);
  elements.saveDescriptionButton?.addEventListener('click', saveDescription);
  elements.backToBoardButton?.addEventListener('click', closePostDetail);
  elements.deletePostButton?.addEventListener('click', () => {
    if (state.currentDetailPostId) {
      handleDeletePost(state.currentDetailPostId, elements.deletePostButton);
    }
  });
}

function init() {
  renderCategories();
  populateCategorySelect();
  elements.boardUpdated.textContent = formatUpdatedAt(forumData.updatedAt);
  initializeEvents();
  selectCategory(state.currentCategory);
  loadRemotePosts();
}

init();
