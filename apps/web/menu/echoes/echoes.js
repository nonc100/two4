(() => {
  const API_ENDPOINT = '/api/news-ko';
  const PRICE_ENDPOINT = '/api/coins/markets';
  const TREND_ENDPOINT = '/api/trends';
  const CRYPTO_QUERY = [
    '크립토',
    '암호화폐',
    '가상화폐',
    '비트코인',
    '이더리움',
    '블록체인',
    '코인',
    '디지털 자산',
    '스테이블코인',
    'web3',
    'defi',
    'crypto',
    'cryptocurrency',
    'bitcoin',
    'ethereum',
    'blockchain',
    'digital asset',
    'stablecoin',
    'token',
    'nft'
  ].join(' OR ');
  const CRYPTO_KEYWORDS = [
    '크립토',
    '암호화폐',
    '가상화폐',
    '비트코인',
    '이더리움',
    '블록체인',
    '코인',
    '디지털 자산',
    '스테이블코인',
    'web3',
    'defi',
    'crypto',
    'cryptocurrency',
    'bitcoin',
    'ethereum',
    'blockchain',
    'digital asset',
    'stablecoin',
    'token',
    'nft'
  ].map((keyword) => keyword.toLowerCase());
  const grid = document.getElementById('newsGrid');
  const headlines = document.querySelector('.headlines');
  const sectionTitle = document.querySelector('.section-title');
  const priceList = document.querySelector('.price-list');
  const trendList = document.querySelector('.trend-list');
  const PRIMARY_PRICE_IDS = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'ripple'];
  const PRIMARY_PRICE_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
  const PRIMARY_PRICE_SYMBOL_ORDER = new Map(
    PRIMARY_PRICE_SYMBOLS.map((symbol, index) => [symbol, index])
  );

  function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
    if (typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'on'].includes(lowered);
    }
    return false;
  }

  function formatRelativeTime(input) {
    if (!input) return '방금 전';
    const date = typeof input === 'number' ? new Date(input) : new Date(String(input));
    if (Number.isNaN(date.getTime())) return '방금 전';

    const diffMs = Date.now() - date.getTime();
    if (diffMs <= 0) return '방금 전';

    const minutes = Math.round(diffMs / 60000);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;

    const days = Math.round(hours / 24);
    if (days < 7) return `${days}일 전`;

    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    });
  }

  function cleanText(value, fallback = '') {
    if (!value) return fallback;
    const normalized = String(value).replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    if (normalized.toLowerCase() === '[object object]') return fallback;
    return normalized;
  }

  function isValidImageUrl(value) {
    if (!value) return false;
    const normalized = String(value).trim();
    if (!normalized) return false;
    const lowered = normalized.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined') return false;
    return true;
  }

  function renderLoading() {
    if (!grid) return;
    grid.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'news-empty';
    loading.textContent = '뉴스를 불러오는 중입니다…';
    grid.appendChild(loading);
  }

  function renderError(message) {
    if (!grid) return;
    grid.innerHTML = '';
    const errorEl = document.createElement('p');
    errorEl.className = 'news-empty news-error';
    errorEl.textContent = message;
    grid.appendChild(errorEl);
  }

  function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return [value];
  }

  function containsCryptoKeyword(value) {
    if (!value) return false;
    const normalized = String(value).toLowerCase();
    if (!normalized) return false;
    return CRYPTO_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  function isCryptoArticle(article) {
    if (!article) return false;

    const textFields = [article.title, article.summary, article.description];
    if (textFields.some((field) => containsCryptoKeyword(field))) {
      return true;
    }

    const categories = ensureArray(article.categories);
    const keywords = ensureArray(article.keywords);
    return [...categories, ...keywords].some((entry) => containsCryptoKeyword(entry));
  }

  function createNewsCard(article) {
    const card = document.createElement('article');
    card.className = 'news-card';

    const content = document.createElement('div');
    content.className = 'news-content';

    const meta = document.createElement('div');
    meta.className = 'news-meta';

    const category = document.createElement('span');
    category.className = 'news-category';
    const categories = ensureArray(article.categories);
    const categoryLabel = categories[0] || (article.source && String(article.source).toUpperCase()) || '뉴스';
    category.textContent = categoryLabel;

    const time = document.createElement('span');
    time.className = 'news-time';
    time.textContent = formatRelativeTime(article.publishedAt || article.pubDate || article.publishedTimestamp);

    meta.appendChild(category);
    meta.appendChild(time);

    const title = document.createElement('h3');
    title.className = 'news-title';
    title.textContent = cleanText(article.title, '제목을 불러오지 못했습니다');

    const summary = document.createElement('p');
    summary.className = 'news-summary';
    summary.textContent = cleanText(
      article.summary || article.description,
      '요약을 불러오지 못했습니다. 원문을 확인해 주세요.'
    );

    const link = document.createElement('a');
    link.className = 'news-link';
    if (article.link) {
      link.href = article.link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.href = '#';
      link.setAttribute('aria-disabled', 'true');
    }
    link.textContent = '기사 원문';

    content.appendChild(meta);
    content.appendChild(title);
    content.appendChild(summary);
    content.appendChild(link);

    const hasImage = isValidImageUrl(article.imageUrl);
    if (hasImage) {
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'news-image';
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = article.imageUrl;
      img.alt = article.title ? `${article.title} 관련 이미지` : '뉴스 이미지';
      img.addEventListener('error', () => {
        card.classList.add('news-card--no-image');
        if (imageWrapper.parentNode) {
          imageWrapper.parentNode.removeChild(imageWrapper);
        }
      });
      imageWrapper.appendChild(img);
      card.appendChild(content);
      card.appendChild(imageWrapper);
    } else {
      card.appendChild(content);
      card.classList.add('news-card--no-image');
    }

    return card;
  }

  function renderArticles(articles) {
    if (!grid) return;
    grid.innerHTML = '';

    if (!articles || articles.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'news-empty';
      empty.textContent = '표시할 한국어 뉴스를 찾지 못했습니다.';
      grid.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    articles.forEach((article) => {
      fragment.appendChild(createNewsCard(article));
    });
    grid.appendChild(fragment);

    if (typeof window.initializeNewsCards === 'function') {
      window.initializeNewsCards();
    }
  }

  function formatPrice(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    const abs = Math.abs(num);
    let maximumFractionDigits = 2;
    if (abs < 1) maximumFractionDigits = 4;
    if (abs < 0.01) maximumFractionDigits = 6;
    return '$' + num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits
    });
  }

  function setListState(container, message, state = 'idle') {
    if (!container) return;
    container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'price-item status';
    row.dataset.state = state;
    row.textContent = message;
    container.appendChild(row);
  }

  function getSymbol(entry) {
    if (!entry) return '';
    const raw =
      entry.symbol ||
      entry.ticker ||
      entry.code ||
      (typeof entry.id === 'string' && entry.id.length <= 6 ? entry.id : '');
    return raw ? String(raw).toUpperCase() : '';
  }

  function getDisplayName(entry) {
    const symbol = getSymbol(entry);
    const baseName = cleanText(entry && entry.name, '');
    if (baseName) {
      return symbol ? `${baseName} (${symbol})` : baseName;
    }
    return symbol || 'N/A';
  }

  function getPriceChangeValue(entry) {
    if (!entry) return Number.NaN;
    const direct = Number(entry.price_change_percentage_24h);
    if (Number.isFinite(direct)) return direct;

    const inCurrency = entry.price_change_percentage_24h_in_currency;
    if (typeof inCurrency === 'number') {
      return inCurrency;
    }
    if (typeof inCurrency === 'object' && inCurrency !== null) {
      const preferredKeys = ['usd', 'usdt', 'krw', 'eur'];
      for (const key of preferredKeys) {
        if (key in inCurrency) {
          const parsed = Number(inCurrency[key]);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
      }
      const firstValue = Object.values(inCurrency)[0];
      const parsed = Number(firstValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Number.NaN;
  }

  function getCurrentPrice(entry) {
    if (!entry) return undefined;
    if (entry.current_price != null) return entry.current_price;
    if (entry.price != null) return entry.price;
    if (entry.lastPrice != null) return entry.lastPrice;
    if (entry.quote && typeof entry.quote === 'object') {
      const usd = entry.quote.usd;
      if (usd != null) return usd;
    }
    return undefined;
  }

  function renderPrices(entries) {
    if (!priceList) return;
    priceList.innerHTML = '';

    if (!entries || entries.length === 0) {
      setListState(priceList, '표시할 가격 정보가 없습니다.', 'empty');
      return;
    }

    const orderedEntries = [...entries].sort((a, b) => {
      const symbolA = getSymbol(a);
      const symbolB = getSymbol(b);
      const orderA = PRIMARY_PRICE_SYMBOL_ORDER.has(symbolA)
        ? PRIMARY_PRICE_SYMBOL_ORDER.get(symbolA)
        : Number.MAX_SAFE_INTEGER;
      const orderB = PRIMARY_PRICE_SYMBOL_ORDER.has(symbolB)
        ? PRIMARY_PRICE_SYMBOL_ORDER.get(symbolB)
        : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return symbolA.localeCompare(symbolB);
    });

    const seen = new Set();
    const displayEntries = [];
    for (const entry of orderedEntries) {
      const symbol = getSymbol(entry);
      const key = symbol || entry.id || entry.name;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      displayEntries.push(entry);
      if (displayEntries.length >= 5) break;
    }

    if (displayEntries.length === 0) {
      setListState(priceList, '표시할 가격 정보가 없습니다.', 'empty');
      return;
    }

    const fragment = document.createDocumentFragment();
    displayEntries.forEach((entry) => {
      const item = document.createElement('div');
      const change = getPriceChangeValue(entry);
      let directionClass = 'price-item--flat';
      if (Number.isFinite(change)) {
        if (change > 0) directionClass = 'price-item--up';
        else if (change < 0) directionClass = 'price-item--down';
      }
      item.className = `price-item ${directionClass}`;

      const name = document.createElement('span');
      name.className = 'crypto-name';
      name.textContent = getDisplayName(entry);

      const price = document.createElement('span');
      price.className = 'crypto-price';
      const priceText = formatPrice(getCurrentPrice(entry));
      if (Number.isFinite(change)) {
        const changeText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        price.textContent = `${priceText} (${changeText})`;
      } else {
        price.textContent = priceText;
      }

      item.appendChild(name);
      item.appendChild(price);
      fragment.appendChild(item);
    });

    priceList.appendChild(fragment);
  }

  async function fetchPriceFeed(params) {
    const response = await fetch(`${PRICE_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    return response.json();
  }

  function normalizePriceEntries(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function renderTrends(items) {
    if (!trendList) return;
    trendList.innerHTML = '';

    if (!items || items.length === 0) {
      setListState(trendList, '트렌드를 불러오지 못했습니다.', 'empty');
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const hasLink = Boolean(item.link);
      const row = document.createElement(hasLink ? 'a' : 'div');
      row.className = 'price-item trend-item';
      if (hasLink) {
        row.href = item.link;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
      }

      const name = document.createElement('span');
      name.className = 'crypto-name';
      const baseTitle = cleanText(item.title, '제목 없음');
      const displayTitle = baseTitle.includes(' - ')
        ? baseTitle.split(' - ')[0]
        : baseTitle;
      name.textContent = `${index + 1}. ${displayTitle}`;

      const time = document.createElement('span');
      time.className = 'crypto-price';
      time.textContent = formatRelativeTime(item.pubDate || item.publishedAt || item.isoDate);

      row.appendChild(name);
      row.appendChild(time);
      fragment.appendChild(row);
    });

    trendList.appendChild(fragment);
  }

  async function loadLivePrices() {
    if (!priceList) return;
    setListState(priceList, '가격 정보를 불러오는 중입니다…', 'loading');

    const primaryParams = new URLSearchParams({
      vs_currency: 'usd',
      ids: PRIMARY_PRICE_IDS.join(','),
      sparkline: 'false',
      price_change_percentage: '24h'
    });

    try {
      const primaryPayload = await fetchPriceFeed(primaryParams);
      const primaryEntries = normalizePriceEntries(primaryPayload);
      if (primaryEntries.length > 0) {
        renderPrices(primaryEntries);
        return;
      }
      throw new Error('Primary feed returned no entries');
    } catch (error) {
      console.warn('Primary price feed failed', error);
    }

    const fallbackParams = new URLSearchParams({
      source: 'binance',
      per_page: '60',
      heavy_n: '0'
    });

    try {
      const fallbackPayload = await fetchPriceFeed(fallbackParams);
      const fallbackEntries = normalizePriceEntries(fallbackPayload);
      const preferredSet = new Set(PRIMARY_PRICE_SYMBOLS);
      const filtered = fallbackEntries.filter((entry) => preferredSet.has(getSymbol(entry)));
      const entriesToRender = filtered.length > 0 ? filtered : fallbackEntries.slice(0, 5);
      if (entriesToRender.length === 0) {
        throw new Error('Fallback feed returned no entries');
      }
      renderPrices(entriesToRender);
    } catch (error) {
      console.error('Failed to load live prices', error);
      setListState(priceList, '가격 정보를 불러오지 못했습니다.', 'error');
    }
  }

  async function loadTrendingNow() {
    if (!trendList) return;
    setListState(trendList, '트렌드를 불러오는 중입니다…', 'loading');

    try {
      const response = await fetch(TREND_ENDPOINT, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      renderTrends(items.slice(0, 5));
    } catch (error) {
      console.error('Failed to load /api/trends', error);
      setListState(trendList, '트렌드 정보를 불러오지 못했습니다.', 'error');
    }
  }

  function updateHeadlines(articles) {
    if (!headlines) return;
    headlines.innerHTML = '';

    const picks = (articles || []).slice(0, 3);
    if (picks.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'headline-item';
      emptyItem.textContent = '헤드라인을 불러오지 못했습니다.';
      headlines.appendChild(emptyItem);
      return;
    }

    picks.forEach((article) => {
      const item = document.createElement('div');
      item.className = 'headline-item';

      const category = document.createElement('div');
      category.className = 'headline-category';
      const categories = ensureArray(article.categories);
      category.textContent = categories[0] || (article.source && String(article.source).toUpperCase()) || '뉴스';

      const title = document.createElement('div');
      title.className = 'headline-title';
      title.textContent = article.title || '제목을 불러오지 못했습니다';

      const time = document.createElement('div');
      time.className = 'headline-time';
      time.textContent = formatRelativeTime(article.publishedAt || article.pubDate || article.publishedTimestamp);

      item.appendChild(category);
      item.appendChild(title);
      item.appendChild(time);
      headlines.appendChild(item);
    });
  }

  function updateSectionTitle(meta) {
    if (!sectionTitle || !meta) return;
    if (!meta.fetchedAt) return;

    const fetchedDate = new Date(meta.fetchedAt);
    if (Number.isNaN(fetchedDate.getTime())) return;

    const baseText = 'Intelligence Feed';
    const formatted = fetchedDate.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    sectionTitle.textContent = `${baseText} · ${formatted} 업데이트`;
  }

  async function loadNews() {
    if (!grid) return;

    renderLoading();

    const params = new URLSearchParams();
    params.set('summarize', '1');
    params.set('country', 'kr');
    params.set('limit', '8');
    params.set('q', CRYPTO_QUERY);

    try {
      const response = await fetch(`${API_ENDPOINT}?${params.toString()}`, {
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const payload = await response.json();
      const articles = Array.isArray(payload.articles) ? payload.articles : [];

      const cryptoArticles = articles.filter((article) => isCryptoArticle(article));

      renderArticles(cryptoArticles);
      updateHeadlines(cryptoArticles);
      updateSectionTitle(payload.meta || payload);
    } catch (error) {
      console.error('Failed to load /api/news-ko', error);
      renderError('실시간 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const autoRefresh = toBoolean(grid && grid.dataset.autorefresh);
    loadNews();
    loadLivePrices();
    loadTrendingNow();

    if (autoRefresh) {
      const interval = Number(grid.dataset.refreshInterval || 300000);
      if (!Number.isNaN(interval) && interval > 0) {
        setInterval(loadNews, interval);
      }
    }

    if (priceList) {
      const refreshMs = Number(priceList.dataset.refreshInterval || 60000);
      if (!Number.isNaN(refreshMs) && refreshMs > 0) {
        setInterval(loadLivePrices, refreshMs);
      }
    }

    if (trendList) {
      const refreshMs = Number(trendList.dataset.refreshInterval || 300000);
      if (!Number.isNaN(refreshMs) && refreshMs > 0) {
        setInterval(loadTrendingNow, refreshMs);
      }
    }
  });
})();
