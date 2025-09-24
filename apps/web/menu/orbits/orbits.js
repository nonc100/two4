import { forumData, ORBITS_POSTS_ENDPOINT, OWN_POSTS_STORAGE_KEY, findCategoryById } from './data.js';

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
    console.error('ORBITS 저장된 게시글을 불러오지 못했습니다.', error);
    return [];
  }
}

function getDefaultCategoryId() {
  if (Array.isArray(forumData.categories) && forumData.categories.length > 0) {
    const firstCategory = forumData.categories[0];
    if (firstCategory && typeof firstCategory.id === 'string' && firstCategory.id.trim()) {
      return firstCategory.id;
    }
  }
  return 'volume';
}

const state = {
  currentCategory: getDefaultCategoryId(),
  basePosts: forumData.posts.map(post => normalizePost(post, 'static')).filter(Boolean),
  remotePosts: [],
  descriptions: Object.fromEntries(forumData.categories.map(category => [category.id, category.description])),
  ownPosts: loadOwnPosts(),
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
  newPostButton: document.getElementById('newPostButton'),
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
  detailMedia: document.getElementById('postDetailMedia'),
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
  if (!timestamp) return '최근 동기화 — 준비 중';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '최근 동기화 — 준비 중';
    return `최근 동기화 — ${new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)}`;
  } catch (error) {
    return '최근 동기화 — 준비 중';
  }
}

function createExcerptFromHtml(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const slice = text.slice(0, 150);
  return text.length > 150 ? `${slice}…` : slice;
}

function normalizeImage(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

function normalizeImages(value) {
  const list = Array.isArray(value) ? value : typeof value === 'undefined' ? [] : [value];
  const normalized = [];
  list.forEach(item => {
    const clean = normalizeImage(item);
    if (clean && !normalized.includes(clean)) {
      normalized.push(clean);
    }
  });
  return normalized;
}

function normalizeIcon(icon, altFallback = '') {
  if (!icon) return null;

  if (typeof icon === 'string') {
    const trimmed = icon.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:image/')) {
      return { type: 'image', src: trimmed, alt: altFallback };
    }
    if (/^https?:\/\//i.test(trimmed) || /\.(png|jpe?g|gif|webp|svg)$/i.test(trimmed)) {
      return { type: 'image', src: trimmed, alt: altFallback };
    }
    return { type: 'text', value: trimmed };
  }

  if (typeof icon === 'object') {
    const { type, src, alt, value, text } = icon;
    const candidateAlt = typeof alt === 'string' && alt.trim() ? alt.trim() : altFallback;

    if (typeof src === 'string' && src.trim()) {
      if (!type || String(type).toLowerCase() === 'image') {
        return { type: 'image', src: src.trim(), alt: candidateAlt };
      }
    }

    const textValue = typeof value === 'string' && value.trim() ? value.trim() : typeof text === 'string' && text.trim() ? text.trim() : '';
    if (textValue) {
      return { type: 'text', value: textValue };
    }
  }

  return null;
}

function renderIconElement(container, icon, options = {}) {
  if (!container) return 'none';

  const { fallbackText = '', altText = '', imageClass } = options;
  container.innerHTML = '';
  if (imageClass) {
    container.classList.remove(imageClass);
  }

  const normalized = normalizeIcon(icon, altText);
  if (normalized && normalized.type === 'image' && normalized.src) {
    const img = document.createElement('img');
    img.src = normalized.src;
    img.alt = normalized.alt || altText || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    container.appendChild(img);
    if (imageClass) {
      container.classList.add(imageClass);
    }
    return 'image';
  }

  const textValue = normalized && normalized.type === 'text' && normalized.value ? normalized.value : fallbackText;
  container.textContent = textValue;
  return textValue ? 'text' : 'none';
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
  const rawCategory = typeof post.category === 'string' && post.category.trim() ? post.category.trim() : '';
  const categoryId = rawCategory || getDefaultCategoryId();
  const category = findCategoryById(categoryId);
  const rawTitle = typeof post.title === 'string' ? post.title.trim() : '';
  const title = rawTitle || '제목 없음';
  const heroAltFallback = rawTitle ? `${rawTitle} 대표 아이콘` : category ? `${category.title} 아이콘` : '전략 아이콘';
  const hero = normalizeIcon(post.hero, heroAltFallback) || normalizeIcon(category ? category.heroIcon : null, heroAltFallback);
  const images = normalizeImages(post.images);
  const primaryImage = normalizeImage(post.image);
  if (primaryImage && !images.includes(primaryImage)) {
    images.unshift(primaryImage);
  }
  const tags = Array.isArray(post.tags)
    ? post.tags
        .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const stats = post.stats && typeof post.stats === 'object' ? post.stats : {};

  return {
    id,
    category: categoryId,
    title,
    author: typeof post.author === 'string' && post.author.trim() ? post.author.trim() : 'Anonymous',
    hero,
    image: images[0] || '',
    images,
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
      const aTimestamp = a && Number.isFinite(a.timestamp) ? a.timestamp : Number.MIN_SAFE_INTEGER;
      const bTimestamp = b && Number.isFinite(b.timestamp) ? b.timestamp : Number.MIN_SAFE_INTEGER;
      return bTimestamp - aTimestamp;
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
    console.error('ORBITS 게시글 정보를 저장하지 못했습니다.', error);
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
  renderIconElement(elements.categoryVisual, category.heroIcon, {
    fallbackText: '🛰️',
    altText: `${category.title} 아이콘`,
    imageClass: 'category-hero__visual--image'
  });
  elements.categoryOverlayTitle.textContent = category.overlayTitle;
  elements.categoryOverlayDesc.textContent = category.overlayDescription;
}

function updateDescription() {
  const description = state.descriptions[state.currentCategory] || '';
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
  const category = findCategoryById(post.category);
  const card = document.createElement('article');
  card.className = 'post-card';
  card.tabIndex = 0;
  card.dataset.postId = post.id;

  const media = document.createElement('div');
  media.className = 'post-card__media';
  if (post.image) {
    const img = document.createElement('img');
    img.src = post.image;
    img.alt = `${post.title} 썸네일`;
    img.loading = 'lazy';
    img.decoding = 'async';
    media.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'post-card__media-fallback';
    renderIconElement(fallback, post.hero || (category ? category.heroIcon : null), {
      fallbackText: '🛰️',
      altText: `${post.title} 대표 아이콘`,
      imageClass: 'post-card__media-fallback--image'
    });
    media.appendChild(fallback);
  }
  card.appendChild(media);

  const body = document.createElement('div');
  body.className = 'post-card__body';

  const badge = document.createElement('span');
  badge.className = 'post-card__badge';
  badge.textContent = category && category.badge ? category.badge : 'ORBITS';
  body.appendChild(badge);

  const title = document.createElement('h3');
  title.className = 'post-card__title';
  title.textContent = post.title;
  body.appendChild(title);

  if (post.excerpt) {
    const excerpt = document.createElement('p');
    excerpt.className = 'post-card__excerpt';
    excerpt.textContent = post.excerpt;
    body.appendChild(excerpt);
  }

  if (post.tags.length) {
    const tags = document.createElement('div');
    tags.className = 'post-card__tags';
    post.tags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = tag;
      tags.appendChild(span);
    });
    body.appendChild(tags);
  }

  const meta = document.createElement('div');
  meta.className = 'post-card__meta';
  const author = document.createElement('span');
  author.textContent = post.author;
  const time = document.createElement('span');
  time.textContent = formatPostDate(post);
  meta.append(author, time);
  body.appendChild(meta);

  const stats = document.createElement('div');
  stats.className = 'post-card__stats';
  stats.innerHTML = `<span>👍 ${post.stats.likes}</span><span>💬 ${post.stats.comments}</span><span>👁 ${post.stats.views}</span>`;
  body.appendChild(stats);

  card.appendChild(body);

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
  const category = findCategoryById(post.category);
  elements.detailCategory.textContent = category ? category.badge : 'ORBITS';
  elements.detailTitle.textContent = post.title;
  elements.detailAuthor.textContent = post.author;
  elements.detailDate.textContent = formatPostDate(post);
  elements.detailStats.textContent = `👍 ${post.stats.likes} · 💬 ${post.stats.comments} · 👁 ${post.stats.views}`;
  if (elements.detailMedia) {
    elements.detailMedia.innerHTML = '';
    const imageList = Array.isArray(post.images) && post.images.length
      ? post.images
      : post.image
        ? [post.image]
        : [];
    if (imageList.length) {
      imageList.forEach((src, index) => {
        const item = document.createElement('figure');
        item.className = 'post-detail__media-item';
        const img = document.createElement('img');
        img.src = src;
        img.alt = `${post.title} 첨부 이미지 ${imageList.length > 1 ? index + 1 : ''}`.trim();
        img.loading = 'lazy';
        img.decoding = 'async';
        item.appendChild(img);
        elements.detailMedia.appendChild(item);
      });
      elements.detailMedia.removeAttribute('hidden');
    } else {
      elements.detailMedia.setAttribute('hidden', '');
    }
  }
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
  if (elements.deletePostButton) {
    elements.deletePostButton.setAttribute('hidden', '');
  }
}

function openDescriptionEditor() {
  elements.descriptionTextarea.value = state.descriptions[state.currentCategory] || '';
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
  const response = await fetch(ORBITS_POSTS_ENDPOINT, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`게시글을 불러오지 못했습니다 (${response.status})`);
  }
  const data = await response.json();
  const posts = Array.isArray(data.posts) ? data.posts.map(item => normalizePost(item, 'remote')).filter(Boolean) : [];
  const updatedAt = data && data.updatedAt ? data.updatedAt : null;
  return { posts, updatedAt };
}

async function deleteRemotePost(postId) {
  const response = await fetch(`${ORBITS_POSTS_ENDPOINT}/${encodeURIComponent(postId)}`, {
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
    const message = data && data.error ? data.error : '게시글을 삭제하지 못했습니다.';
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
    console.error('ORBITS 게시글을 가져오는 중 오류가 발생했습니다.', error);
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
    const updatedTimestamp = response && response.updatedAt ? response.updatedAt : new Date().toISOString();
    elements.boardUpdated.textContent = formatUpdatedAt(updatedTimestamp);
  } catch (error) {
    console.error('ORBITS 게시글 삭제 중 오류가 발생했습니다.', error);
    alert('게시글 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    state.deletingPostId = null;
    restoreFns.forEach(fn => fn());
  }
}

function initializeEvents() {
  if (elements.newPostButton) {
    elements.newPostButton.addEventListener('click', event => {
      event.preventDefault();
      closePostDetail();
      window.location.href = './write.html';
    });
  }
  if (elements.editDescriptionButton) {
    elements.editDescriptionButton.addEventListener('click', openDescriptionEditor);
  }
  if (elements.cancelDescriptionButton) {
    elements.cancelDescriptionButton.addEventListener('click', closeDescriptionEditor);
  }
  if (elements.saveDescriptionButton) {
    elements.saveDescriptionButton.addEventListener('click', saveDescription);
  }
  if (elements.backToBoardButton) {
    elements.backToBoardButton.addEventListener('click', closePostDetail);
  }
  if (elements.deletePostButton) {
    elements.deletePostButton.addEventListener('click', () => {
      if (state.currentDetailPostId) {
        handleDeletePost(state.currentDetailPostId, elements.deletePostButton);
      }
    });
  }
}

function init() {
  renderCategories();
  elements.boardUpdated.textContent = formatUpdatedAt(forumData.updatedAt);
  initializeEvents();
  selectCategory(state.currentCategory);
  loadRemotePosts();
}

init();
