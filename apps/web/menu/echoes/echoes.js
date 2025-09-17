import { fetchCryptoNews } from './api.js';

const HEADLINE_COUNT = 3;
const DEFAULT_STATUS = '최신 크립토 뉴스를 불러오는 중입니다...';
let latestItems = [];
let currentQuery = '';

function setNewsStatus(message, { error = false, hidden = false } = {}) {
  const statusEl = document.getElementById('newsStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(error));
  statusEl.classList.toggle('hidden', Boolean(hidden));
}

function createStars() {
  const starsContainer = document.getElementById('stars');
  if (!starsContainer) return;
  const numStars = 100;
  starsContainer.innerHTML = '';
  for (let i = 0; i < numStars; i += 1) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 3}s`;
    starsContainer.appendChild(star);
  }
}

function initializeNewsCards() {
  document.querySelectorAll('.news-card').forEach((card) => {
    if (card.dataset.hoverBound === '1') return;
    card.dataset.hoverBound = '1';
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px) scale(1.01)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0) scale(1)';
    });
  });
}

function initializeThemeToggle() {
  const themeCheckbox = document.getElementById('theme-checkbox');
  if (!themeCheckbox) return;
  const savedTheme = localStorage.getItem('echoes-theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    themeCheckbox.checked = true;
  }
  document.body.classList.toggle('light-mode', themeCheckbox.checked);
  themeCheckbox.addEventListener('change', () => {
    const isLight = themeCheckbox.checked;
    document.body.classList.toggle('light-mode', isLight);
    localStorage.setItem('echoes-theme', isLight ? 'light' : 'dark');
  });
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = [
    'position: fixed',
    'top: 80px',
    'right: 20px',
    'background: var(--card-bg)',
    'color: var(--text-primary)',
    'padding: 12px 20px',
    'border-radius: 8px',
    'border: 1px solid var(--border-color)',
    'backdrop-filter: blur(10px)',
    'z-index: 1000',
    'font-size: 0.9rem',
    'box-shadow: 0 4px 20px rgba(0,0,0,0.3)',
    'transform: translateX(100%)',
    'transition: transform 0.3s ease',
  ].join(';');
  notification.textContent = message;
  document.body.appendChild(notification);
  requestAnimationFrame(() => {
    notification.style.transform = 'translateX(0)';
  });
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
  }, 3000);
  setTimeout(() => {
    notification.remove();
  }, 3600);
}

function initializeNotifications() {
  const notificationCheckbox = document.getElementById('notification-checkbox');
  const notificationBtn = document.querySelector('.notification-btn');
  if (!notificationCheckbox || !notificationBtn) return;
  const savedState = localStorage.getItem('echoes-notifications');
  if (savedState === 'true') {
    notificationCheckbox.checked = true;
  }
  notificationBtn.classList.toggle('active', notificationCheckbox.checked);
  const syncState = () => {
    const isActive = notificationCheckbox.checked;
    notificationBtn.classList.toggle('active', isActive);
    localStorage.setItem('echoes-notifications', isActive ? 'true' : 'false');
    showNotification(isActive ? '알림이 활성화되었습니다! 🔔' : '알림이 비활성화되었습니다. 🔕');
  };
  notificationCheckbox.addEventListener('change', syncState);
}

function initializeMobileMenu() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navMenu = document.getElementById('navMenu');
  if (!mobileMenuBtn || !navMenu) return;
  navMenu.setAttribute('aria-hidden', 'true');
  mobileMenuBtn.setAttribute('aria-expanded', 'false');
  mobileMenuBtn.addEventListener('click', () => {
    const isActive = navMenu.classList.toggle('active');
    navMenu.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    mobileMenuBtn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
  });
}

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '방금 전';
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < day * 7) return `${Math.floor(diff / day)}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function getCategoryLabel(item) {
  if (!item) return 'Crypto';
  if (item.category) return item.category;
  if (Array.isArray(item.keywords) && item.keywords.length > 0) return item.keywords[0];
  if (item.originalCategory) return item.originalCategory;
  return 'Crypto';
}

function createNewsCard(item) {
  const card = document.createElement('article');
  card.className = 'news-card';
  const searchText = [
    item.title,
    item.summary,
    item.originalTitle,
    item.originalSummary,
    item.source,
    (item.keywords || []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
  card.dataset.search = searchText;

  const content = document.createElement('div');
  content.className = 'news-content';

  const meta = document.createElement('div');
  meta.className = 'news-meta';

  const category = document.createElement('span');
  category.className = 'news-category';
  category.textContent = getCategoryLabel(item);

  const time = document.createElement('span');
  time.className = 'news-time';
  time.textContent = formatTimeAgo(item.publishedAt || item.pubDate);

  meta.append(category, time);
  content.appendChild(meta);

  const title = document.createElement('h3');
  title.className = 'news-title';
  title.textContent = item.title || item.originalTitle || '제목 없음';
  content.appendChild(title);

  if (item.summary || item.originalSummary) {
    const summary = document.createElement('p');
    summary.className = 'news-summary';
    summary.textContent = item.summary || item.originalSummary || '';
    content.appendChild(summary);
  }

  const link = document.createElement('a');
  link.className = 'news-link';
  link.textContent = '전체 기사 보기';
  if (item.link) {
    link.href = item.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${title.textContent} 원문 보기`);
  } else {
    link.href = '#';
    link.classList.add('disabled');
    link.setAttribute('aria-disabled', 'true');
  }
  content.appendChild(link);

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'news-image';
  if (item.imageUrl) {
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.title || item.originalTitle || '뉴스 이미지';
    img.loading = 'lazy';
    imageWrapper.appendChild(img);
  } else {
    imageWrapper.textContent = 'IMAGE';
  }

  card.append(content, imageWrapper);

  card.addEventListener('click', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('a')) return;
    if (item.link) window.open(item.link, '_blank', 'noopener');
  });

  return card;
}

function renderNews(items) {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;
  latestItems = items;
  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'false');

  if (!items || items.length === 0) {
    setNewsStatus('표시할 뉴스가 없습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(createNewsCard(item));
  });
  grid.appendChild(fragment);
  initializeNewsCards();

  if (currentQuery) {
    filterNews(currentQuery);
  } else {
    setNewsStatus(`총 ${items.length}건의 최신 뉴스가 업데이트되었습니다.`);
  }
}

function updateHeadlines(items) {
  const headlines = document.querySelectorAll('#headlineList .headline-item');
  headlines.forEach((headline, index) => {
    const data = items[index];
    const categoryEl = headline.querySelector('.headline-category');
    const titleEl = headline.querySelector('.headline-title');
    const timeEl = headline.querySelector('.headline-time');

    if (!categoryEl || !titleEl || !timeEl) return;

    if (data) {
      categoryEl.textContent = getCategoryLabel(data);
      titleEl.textContent = data.title || data.originalTitle || '';
      timeEl.textContent = formatTimeAgo(data.publishedAt || data.pubDate);
      headline.dataset.link = data.link || '';
      headline.setAttribute('tabindex', '0');
      headline.setAttribute('role', 'link');
      headline.classList.remove('headline-empty');
    } else {
      categoryEl.textContent = 'Crypto';
      titleEl.textContent = '새로운 뉴스를 기다리는 중입니다.';
      timeEl.textContent = '';
      headline.dataset.link = '';
      headline.removeAttribute('role');
      headline.removeAttribute('tabindex');
      headline.classList.add('headline-empty');
    }

    if (headline.dataset.bindListener === '1') return;
    headline.dataset.bindListener = '1';
    headline.addEventListener('click', () => {
      if (headline.dataset.link) {
        window.open(headline.dataset.link, '_blank', 'noopener');
      }
    });
    headline.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && headline.dataset.link) {
        event.preventDefault();
        window.open(headline.dataset.link, '_blank', 'noopener');
      }
    });
  });
}

function filterNews(query) {
  currentQuery = query;
  const q = (query || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#newsGrid .news-card');
  if (cards.length === 0) return;
  let visibleCount = 0;
  cards.forEach((card) => {
    const match = !q || (card.dataset.search || '').includes(q);
    card.style.display = match ? '' : 'none';
    if (match) visibleCount += 1;
  });
  if (!q) {
    setNewsStatus(`총 ${latestItems.length}건의 최신 뉴스가 업데이트되었습니다.`);
  } else if (visibleCount === 0) {
    setNewsStatus('검색 결과가 없습니다.', { error: false });
  } else {
    setNewsStatus(`검색 결과 ${visibleCount}건이 표시됩니다.`);
  }
}

function initializeSearch() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;
  searchInput.addEventListener('input', (event) => {
    filterNews(event.target.value);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      filterNews(searchInput.value);
    }
  });
}

async function loadCryptoNews() {
  const grid = document.getElementById('newsGrid');
  if (grid) {
    grid.setAttribute('aria-busy', 'true');
  }
  setNewsStatus(DEFAULT_STATUS);
  try {
    const items = await fetchCryptoNews(12);
    renderNews(items);
    updateHeadlines(items.slice(0, HEADLINE_COUNT));
  } catch (error) {
    console.error('Failed to load crypto news:', error);
    setNewsStatus('뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', { error: true });
  }
}

function updatePrices() {
  const prices = document.querySelectorAll('.crypto-price');
  prices.forEach((priceEl) => {
    const text = priceEl.textContent.trim();
    if (!text.includes('$')) return;
    if (!priceEl.dataset.precision) {
      const decimals = (text.split('.')[1] || '').replace(/[^0-9]/g, '').length;
      priceEl.dataset.precision = String(Math.min(decimals, 4));
    }
    const precision = Number(priceEl.dataset.precision || '0');
    const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (Number.isNaN(numeric)) return;
    const change = (Math.random() - 0.5) * 0.02;
    const newPrice = numeric * (1 + change);
    priceEl.textContent = `$${newPrice.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    })}`;
  });
}

window.addEventListener('DOMContentLoaded', () => {
  createStars();
  initializeMobileMenu();
  initializeSearch();
  initializeThemeToggle();
  initializeNotifications();
  loadCryptoNews();
  updatePrices();
  setInterval(updatePrices, 10000);
});
