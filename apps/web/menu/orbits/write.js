import { forumData, ORBITS_POSTS_ENDPOINT, OWN_POSTS_STORAGE_KEY, MAX_IMAGE_DATA_URL_LENGTH, findCategoryById } from './data.js';

const elements = {
  form: document.getElementById('composeForm'),
  title: document.getElementById('composeTitle'),
  category: document.getElementById('composeCategory'),
  tags: document.getElementById('composeTags'),
  content: document.getElementById('composeContent'),
  imageInput: document.getElementById('composeImage'),
  imagePreview: document.getElementById('imagePreview'),
  imagePreviewImg: document.getElementById('imagePreviewImg'),
  imageInfo: document.getElementById('imageInfo'),
  clearImage: document.getElementById('clearImage'),
  submit: document.getElementById('composeSubmit'),
  cancel: document.getElementById('composeCancel'),
  categoryHint: document.getElementById('categoryHint')
};

const state = {
  imageDataUrl: '',
  submitting: false
};

const MAX_FILE_BYTES = 550 * 1024;

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
  state.imageDataUrl = '';
  if (elements.imageInput) {
    elements.imageInput.value = '';
  }
  if (elements.imagePreview) {
    elements.imagePreview.hidden = true;
  }
  if (elements.imagePreviewImg) {
    elements.imagePreviewImg.removeAttribute('src');
  }
  if (elements.imageInfo) {
    elements.imageInfo.textContent = '';
  }
}

function renderImagePreview(dataUrl, file) {
  if (!elements.imagePreview || !elements.imagePreviewImg || !elements.imageInfo) return;
  elements.imagePreviewImg.src = dataUrl;
  const sizeKb = file ? Math.round(file.size / 1024) : Math.round(dataUrl.length / 1024);
  const infoParts = [];
  if (file?.name) infoParts.push(file.name);
  infoParts.push(`${sizeKb} KB`);
  elements.imageInfo.textContent = infoParts.join(' · ');
  elements.imagePreview.hidden = false;
}

function handleImageChange() {
  if (!elements.imageInput || !elements.imageInput.files?.length) {
    clearImagePreview();
    return;
  }
  const file = elements.imageInput.files[0];
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드할 수 있습니다.');
    clearImagePreview();
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    alert('이미지 크기가 너무 큽니다. 500KB 이하의 이미지를 사용해주세요.');
    clearImagePreview();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== 'string') {
      alert('이미지를 불러오지 못했습니다. 다른 파일을 선택해주세요.');
      clearImagePreview();
      return;
    }
    if (!result.startsWith('data:image/')) {
      alert('지원하지 않는 이미지 형식입니다.');
      clearImagePreview();
      return;
    }
    if (result.length > MAX_IMAGE_DATA_URL_LENGTH) {
      alert('이미지 데이터가 너무 큽니다. 해상도를 낮춰 다시 시도해주세요.');
      clearImagePreview();
      return;
    }
    state.imageDataUrl = result;
    renderImagePreview(result, file);
  };
  reader.onerror = () => {
    alert('이미지를 읽는 중 오류가 발생했습니다. 다시 시도해주세요.');
    clearImagePreview();
  };
  reader.readAsDataURL(file);
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

  const payload = {
    title,
    category,
    content,
    tags: tags.length ? tags : ['새글'],
    author: 'You'
  };
  if (state.imageDataUrl) {
    payload.image = state.imageDataUrl;
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
  elements.cancel?.addEventListener('click', event => {
    event.preventDefault();
    window.location.href = './';
  });
}

init();
