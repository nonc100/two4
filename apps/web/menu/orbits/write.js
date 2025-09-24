import { forumData, ORBITS_POSTS_ENDPOINT, OWN_POSTS_STORAGE_KEY, MAX_IMAGE_DATA_URL_LENGTH, findCategoryById } from './data.js';

const elements = {
  form: document.getElementById('composeForm'),
  title: document.getElementById('composeTitle'),
  category: document.getElementById('composeCategory'),
  tags: document.getElementById('composeTags'),
  content: document.getElementById('composeContent'),
  imageInput: document.getElementById('composeImage'),
  imagePreview: document.getElementById('imagePreview'),
  imagePreviewList: document.getElementById('imagePreviewList'),
  imageInfo: document.getElementById('imageInfo'),
  clearImage: document.getElementById('clearImage'),
  submit: document.getElementById('composeSubmit'),
  cancel: document.getElementById('composeCancel'),
  categoryHint: document.getElementById('categoryHint'),
  formatBold: document.getElementById('formatBold'),
  formatSize: document.getElementById('formatSize')
};

const state = {
  images: [],
  submitting: false
};

const MAX_FILE_BYTES = 550 * 1024;
const MAX_IMAGES = 10;

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
    console.error('Failed to read ORBITS own posts', error);
    return [];
  }
}

function saveOwnPosts(ids) {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(OWN_POSTS_STORAGE_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to persist ORBITS own posts', error);
  }
}

function addOwnPostId(id) {
  if (!id) return;
  const ids = loadOwnPosts();
  if (!ids.includes(id)) {
    ids.push(id);
    saveOwnPosts(ids);
  }
}

function populateCategories() {
  if (!elements.category) return;
  forumData.categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = `${category.title}`;
    elements.category.appendChild(option);
  });
  updateCategoryHint();
}

function updateCategoryHint() {
  if (!elements.categoryHint) return;
  const category = findCategoryById(elements.category?.value);
  if (!category) {
    elements.categoryHint.textContent = '';
    return;
  }
  elements.categoryHint.textContent = `${category.badge} · ${category.meta}`;
}

function clearImagePreview() {
  state.images = [];
  if (elements.imageInput) {
    elements.imageInput.value = '';
  }
  if (elements.imagePreviewList) {
    elements.imagePreviewList.innerHTML = '';
  }
  if (elements.imageInfo) {
    elements.imageInfo.textContent = '';
  }
  if (elements.imagePreview) {
    elements.imagePreview.hidden = true;
  }
}

function renderImagePreview() {
  if (!elements.imagePreview || !elements.imagePreviewList || !elements.imageInfo) return;
  elements.imagePreviewList.innerHTML = '';
  if (!state.images.length) {
    elements.imagePreview.hidden = true;
    elements.imageInfo.textContent = '';
    return;
  }

  const totalSize = state.images.reduce((sum, image) => sum + image.size, 0);
  state.images.forEach((image, index) => {
    const item = document.createElement('div');
    item.className = 'image-preview__item';

    const frame = document.createElement('div');
    frame.className = 'image-preview__frame';
    const img = document.createElement('img');
    img.src = image.dataUrl;
    img.alt = image.name ? `${image.name} 미리보기` : '업로드한 이미지 미리보기';
    frame.appendChild(img);
    item.appendChild(frame);

    const meta = document.createElement('div');
    meta.className = 'image-preview__meta';
    const info = document.createElement('span');
    info.className = 'image-preview__info';
    info.textContent = image.name ? `${image.name} · ${Math.round(image.size / 1024)} KB` : `${Math.round(image.size / 1024)} KB`;
    meta.appendChild(info);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'image-preview__remove';
    removeButton.textContent = '제거';
    removeButton.setAttribute('aria-label', `${image.name || '이미지'} 제거`);
    removeButton.addEventListener('click', () => {
      state.images.splice(index, 1);
      renderImagePreview();
    });
    meta.appendChild(removeButton);
    item.appendChild(meta);

    elements.imagePreviewList.appendChild(item);
  });

  const summarySize = Math.round(totalSize / 1024);
  elements.imageInfo.textContent = `${state.images.length}개 이미지 · ${summarySize} KB`;
  elements.imagePreview.hidden = false;
}

async function handleImageChange() {
  if (!elements.imageInput || !elements.imageInput.files?.length) {
    if (elements.imageInput) {
      elements.imageInput.value = '';
    }
    if (!state.images.length) {
      clearImagePreview();
    }
    return;
  }

  const files = Array.from(elements.imageInput.files);
  const errors = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      errors.push(`${file.name} — 이미지 파일만 업로드할 수 있습니다.`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name} — 이미지 크기가 너무 큽니다. 500KB 이하의 이미지를 사용해주세요.`);
      continue;
    }
    if (state.images.length >= MAX_IMAGES) {
      errors.push(`${file.name} — 이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다.`);
      continue;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
        errors.push(`${file.name} — 이미지 데이터가 너무 큽니다. 해상도를 낮춰 다시 시도해주세요.`);
        continue;
      }
      state.images.push({
        dataUrl,
        name: file.name,
        size: file.size
      });
    } catch (error) {
      errors.push(`${file.name} — 이미지를 읽는 중 오류가 발생했습니다.`);
    }
  }

  elements.imageInput.value = '';
  renderImagePreview();

  if (errors.length) {
    alert(errors.join('\n'));
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('INVALID_RESULT'));
        return;
      }
      if (!result.startsWith('data:image/')) {
        reject(new Error('INVALID_TYPE'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('READ_ERROR'));
    reader.readAsDataURL(file);
  });
}

function toggleBold() {
  if (!elements.content) return;
  const textarea = elements.content;
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === undefined || selectionEnd === undefined) return;
  const selected = value.slice(selectionStart, selectionEnd);
  if (!selected) {
    alert('굵게 만들 텍스트를 선택해주세요.');
    textarea.focus();
    return;
  }
  const isWrapped = /^\s*\[b\][\s\S]*\[\/b\]\s*$/.test(selected);
  let replacement;
  if (isWrapped) {
    replacement = selected.replace(/\[b\]([\s\S]*?)\[\/b\]/g, '$1');
  } else {
    const cleanSelected = selected.replace(/\[\/?b\]/g, '');
    replacement = `[b]${cleanSelected}[/b]`;
    const newValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
    textarea.value = newValue;
    const innerStart = selectionStart + 3;
    const innerEnd = innerStart + cleanSelected.length;
    textarea.focus();
    textarea.setSelectionRange(innerStart, innerEnd);
    return;
  }
  const newValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  textarea.value = newValue;
  const start = selectionStart;
  const end = start + replacement.length;
  textarea.focus();
  textarea.setSelectionRange(start, end);
}

function applyFontSize(size) {
  if (!elements.content) return;
  const textarea = elements.content;
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart === undefined || selectionEnd === undefined) return;
  const selected = value.slice(selectionStart, selectionEnd);
  if (!selected) {
    alert('크기를 변경할 텍스트를 선택해주세요.');
    textarea.focus();
    return;
  }

  const cleaned = selected.replace(/\[size=(?:small|large|normal)\]/g, '').replace(/\[\/size\]/g, '');
  let replacement = cleaned;

  if (size === 'large' || size === 'small') {
    replacement = `[size=${size}]${cleaned}[/size]`;
  }

  const newValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  textarea.value = newValue;
  let start = selectionStart;
  let end = start + replacement.length;
  if (size === 'large' || size === 'small') {
    const offset = `[size=${size}]`.length;
    start += offset;
    end = start + cleaned.length;
  }
  textarea.focus();
  textarea.setSelectionRange(start, end);
}

async function postOrbitEntry(payload) {
  const response = await fetch(ORBITS_POSTS_ENDPOINT, {
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
    // ignore parsing error to allow generic message below
  }
  if (!response.ok) {
    const message = data?.error || 'FAILED';
    throw new Error(message);
  }
  if (!data?.post) {
    throw new Error('INVALID_RESPONSE');
  }
  return data;
}

function getTags() {
  const raw = elements.tags?.value ?? '';
  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.submitting) return;

  const title = elements.title?.value.trim();
  const category = elements.category?.value.trim();
  const content = elements.content?.value.trim();
  const tags = getTags();

  if (!title || !category || !content) {
    alert('제목, 카테고리, 내용을 모두 입력해주세요.');
    return;
  }

  const images = state.images.map(image => image.dataUrl).filter(Boolean);

  const payload = {
    title,
    category,
    content,
    tags: tags.length ? tags : ['새글'],
    author: 'You'
  };
  if (images.length) {
    payload.images = images;
    payload.image = images[0];
  }

  try {
    state.submitting = true;
    if (elements.submit) {
      elements.submit.disabled = true;
      elements.submit.textContent = '게시 중…';
    }
    const response = await postOrbitEntry(payload);
    if (response?.post?.id) {
      addOwnPostId(response.post.id);
    }
    window.location.href = './';
  } catch (error) {
    console.error('Failed to submit ORBITS post', error);
    alert('게시글 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    state.submitting = false;
    if (elements.submit) {
      elements.submit.disabled = false;
      elements.submit.textContent = '게시';
    }
  }
}

function init() {
  populateCategories();
  elements.category?.addEventListener('change', updateCategoryHint);
  elements.form?.addEventListener('submit', handleSubmit);
  elements.imageInput?.addEventListener('change', handleImageChange);
  elements.clearImage?.addEventListener('click', event => {
    event.preventDefault();
    clearImagePreview();
  });
  elements.formatBold?.addEventListener('click', event => {
    event.preventDefault();
    toggleBold();
  });
  elements.formatSize?.addEventListener('change', event => {
    const value = event.target?.value;
    if (!value) return;
    applyFontSize(value === 'reset' ? 'reset' : value);
    event.target.value = '';
  });
  elements.cancel?.addEventListener('click', event => {
    event.preventDefault();
    window.location.href = './';
  });
}

init();
