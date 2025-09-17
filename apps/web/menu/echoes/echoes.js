(() => {
  const API_ENDPOINT = '/api/news-ko';
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
    title.textContent = article.title || '제목을 불러오지 못했습니다';

    const summary = document.createElement('p');
    summary.className = 'news-summary';
    summary.textContent = article.summary || article.description || '요약을 불러오지 못했습니다. 원문을 확인해 주세요.';

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

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'news-image';
    if (article.imageUrl) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = article.imageUrl;
      img.alt = article.title ? `${article.title} 관련 이미지` : '뉴스 이미지';
      imageWrapper.appendChild(img);
    }

    card.appendChild(content);
    card.appendChild(imageWrapper);

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

    if (autoRefresh) {
      const interval = Number(grid.dataset.refreshInterval || 300000);
      if (!Number.isNaN(interval) && interval > 0) {
        setInterval(loadNews, interval);
      }
    }
  });
})();
