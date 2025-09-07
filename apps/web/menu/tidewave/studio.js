// apps/web/menu/tidewave/studio.js
(() => {
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // ADMIN_TOKEN (최초 1회만)
  // ------------------------------------------------------------------
  const TOKEN_KEY = 'ADMIN_TOKEN';
  async function ensureToken() {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = prompt('ADMIN_TOKEN? (처음 한 번)');
      if (t) localStorage.setItem(TOKEN_KEY, t);
    }
    return t || '';
  }

  // ------------------------------------------------------------------
  // UI refs
  // ------------------------------------------------------------------
  const modelSel   = $('model');
  const chatInput  = $('chatInput');
  const chatStatus = $('chatStatus');
  const btnSend    = $('btnSend');

  const preview    = $('preview');
  const previewUrl = $('previewUrl');
  const btnGo      = $('btnGo');
  const btnRefresh = $('btnRefresh');

  const editPath   = $('editPath');
  const editor     = $('editor');
  const btnOpen    = $('btnOpen');
  const btnSave    = $('btnSave');
  const commitMsg  = $('commitMsg');
  const btnCommit  = $('btnCommit');
  const log        = $('log');

  // ------------------------------------------------------------------
  // Helpers (백엔드 API)
  // ------------------------------------------------------------------
  function setLog(msg, ok = true) {
    log.textContent = msg;
    log.className = 'row ' + (ok ? 'ok' : 'err');
  }

  async function apiRead(p) {
    const url = `/fs/read?path=${encodeURIComponent(p)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`read HTTP ${r.status}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'read failed');
    return j.data;
  }

  async function apiSave(p, content) {
    const t = await ensureToken();
    const r = await fetch('/fs/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': t,
      },
      body: JSON.stringify({ path: p, content }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'save failed');
    return j;
  }

  async function aiChat(prompt, system = '') {
    const t = await ensureToken();
    const model = modelSel?.value || 'anthropic/claude-3.5-sonnet';
    const r = await fetch('/ai/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': t,
      },
      body: JSON.stringify({ prompt, system, model }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`AI HTTP ${r.status}: ${txt}`);
    }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'ai error');
    return j.text;
  }

  // ------------------------------------------------------------------
  // Chat
  // ------------------------------------------------------------------
  btnSend.addEventListener('click', async () => {
    const q = (chatInput.value || '').trim();
    if (!q) return;
    btnSend.disabled = true;
    chatStatus.textContent = 'Thinking...';
    try {
      const a = await aiChat(q);
      chatStatus.textContent = '';
      // 간단히 오른쪽 에디터에 내려줌 (원하면 파일로 저장해도 됨)
      editor.value = a;
      setLog('AI 응답 수신');
    } catch (e) {
      chatStatus.textContent = '';
      setLog(String(e), false);
    } finally {
      btnSend.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // Preview
  // ------------------------------------------------------------------
  function loadPreview() {
    const url = previewUrl.value || '/menu/index.html';
    preview.src = url;
  }
  btnGo.addEventListener('click', loadPreview);
  btnRefresh.addEventListener('click', () => {
    try { preview.contentWindow?.location?.reload(); }
    catch { loadPreview(); }
  });
  loadPreview();

  // ------------------------------------------------------------------
  // Editor
  // ------------------------------------------------------------------
  btnOpen.addEventListener('click', async () => {
    const p = (editPath.value || '').trim();
    if (!p) return;
    btnOpen.disabled = true;
    try {
      editor.value = await apiRead(p);
      setLog(`Opened: ${p}`);
    } catch (e) {
      setLog(String(e), false);
    } finally {
      btnOpen.disabled = false;
    }
  });

  btnSave.addEventListener('click', async () => {
    const p = (editPath.value || '').trim();
    if (!p) return;
    btnSave.disabled = true;
    try {
      const res = await apiSave(p, editor.value);
      setLog(`Saved (${res.bytes} bytes): ${p}`);
    } catch (e) {
      setLog(String(e), false);
    } finally {
      btnSave.disabled = false;
    }
  });

  // Commit & Push는 나중에
  btnCommit.addEventListener('click', () => {
    setLog('Commit & Push는 추후 활성화', false);
  });
})();