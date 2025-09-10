// apps/web/ai/seed.js
// Seed AI – 텍스트/이미지/시세 명령, 모바일 최적화, 아바타 제거 레이아웃

(function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');
  const backButton    = document.getElementById('backButton');
  const uploadButton  = document.getElementById('uploadButton');
  const imageInput    = document.getElementById('imageInput');

  let isTyping = false;
  let messageHistory = []; // { role, content }

  /* --------- helpers --------- */
  const escapeHtml = (text='') =>
    text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const appendBubble = (html, who) => {
    const row = document.createElement('div');
    row.className = `message ${who}`; // 'user' | 'ai'
    row.innerHTML = `<div class="bubble">${html}</div>`;
    chatContainer.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  function addMessage(content, isUser = false) {
    const body = isUser ? escapeHtml(content).replace(/\n/g, '<br>') : content.replace(/\n/g, '<br>');
    appendBubble(body, isUser ? 'user' : 'ai');
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content });
  }

  function addImage(url, alt = 'image', isUser = false) {
    const body = `<img src="${url}" alt="${escapeHtml(alt)}">`;
    appendBubble(body, isUser ? 'user' : 'ai');
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content: `[image] ${url}` });
  }

  function showTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'message ai';
    row.id = 'typingIndicator';
    row.innerHTML = `
      <div class="bubble" style="display:flex;gap:6px;align-items:center;">
        <div class="typing-dot" style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);animation:td 1.2s infinite"></div>
        <div class="typing-dot" style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);animation:td 1.2s .15s infinite"></div>
        <div class="typing-dot" style="width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);animation:td 1.2s .3s infinite"></div>
      </div>`;
    chatContainer.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }
  // typing keyframes (scoped via style tag once)
  (function injectOnce(){
    const id='seed-typing-style';
    if(document.getElementById(id)) return;
    const s=document.createElement('style');
    s.id=id; s.textContent=`@keyframes td{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-8px);opacity:1}}`;
    document.head.appendChild(s);
  })();

  /* --------- API calls --------- */
  async function fetchChat(messages) {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error('chat api error');
    const data = await res.json();
    return data.reply || '(no content)';
  }

  // 코인 시세
  const coinIdMap = {
    BTC:'bitcoin', ETH:'ethereum', SOL:'solana', XRP:'ripple', BNB:'binancecoin',
    ADA:'cardano', DOGE:'dogecoin', AVAX:'avalanche-2', TRX:'tron', TON:'the-open-network',
    MATIC:'matic-network', DOT:'polkadot'
  };
  const fmt = {
    n: (n) => Number(n).toLocaleString('en-US'),
    p: (p) => {
      const v = Number(p||0);
      const s = (v>0?'+':'') + v.toFixed(2) + '%';
      return v >= 0 ? `<b style="color:#76f8b1">${s}</b>` : `<b style="color:#ff7a7a">${s}</b>`;
    },
    money: (x, cur='USD') => new Intl.NumberFormat('en-US',{style:'currency',currency:cur}).format(Number(x||0))
  };
  async function fetchPrice(symRaw) {
    const sym = String(symRaw||'').trim().toUpperCase();
    const id = coinIdMap[sym];
    if (!id) throw new Error(`지원하지 않는 심볼이에요: ${sym}`);

    const u = new URL('/api/coins/markets', window.location.origin);
    u.searchParams.set('vs_currency','usd');
    u.searchParams.set('ids', id);
    u.searchParams.set('price_change_percentage','1h,24h,7d');

    const res = await fetch(u);
    if (!res.ok) throw new Error('가격 API 오류');
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr[0]) throw new Error('코인 데이터를 찾을 수 없어요.');

    const c = arr[0];
    return {
      name:c.name, symbol:sym, price:c.current_price, high24h:c.high_24h, low24h:c.low_24h,
      mc:c.market_cap, change1h:c.price_change_percentage_1h_in_currency,
      change24h:c.price_change_percentage_24h_in_currency,
      change7d:c.price_change_percentage_7d_in_currency
    };
  }
  const renderPriceCard = (info) => `
    <div style="display:grid;gap:6px">
      <div style="font-weight:600">${info.name} (${info.symbol})</div>
      <div>가격: <b>${fmt.money(info.price)}</b> · 1h ${fmt.p(info.change1h)} · 24h ${fmt.p(info.change24h)} · 7d ${fmt.p(info.change7d)}</div>
      <div style="opacity:.85">24h 고가 ${fmt.money(info.high24h)} · 저가 ${fmt.money(info.low24h)} · 시총 ${fmt.money(info.mc)}</div>
    </div>`;

  /* --------- Command router --------- */
  async function handleCommandOrChat(raw) {
    // /image 프롬프트
    const img = raw.match(/^\/image\s+(.+)/i);
    if (img) {
      showTypingIndicator();
      try {
        const res = await fetch('/api/image', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ prompt: img[1] })
        });
        const data = await res.json().catch(() => ({}));
        removeTypingIndicator();
        if (res.ok && data.url) addImage(data.url);
        else addMessage('이미지 생성이 아직 활성화되어 있지 않아요. (IMAGE_MODEL 설정 필요)', false);
      } catch {
        removeTypingIndicator();
        addMessage('이미지 서버 오류가 발생했어요.', false);
      }
      return;
    }

    // /price BTC
    const price = raw.match(/^\/price\s+([A-Za-z]{2,10})$/i);
    if (price) {
      showTypingIndicator();
      try {
        const info = await fetchPrice(price[1]);
        removeTypingIndicator();
        addMessage(renderPriceCard(info), false);
      } catch (e) {
        removeTypingIndicator();
        addMessage(`가격 조회 실패: ${e.message}`, false);
      }
      return;
    }

    // 일반 대화
    showTypingIndicator();
    try {
      const reply = await fetchChat([
        { role:'system', content:'You are Seed AI for TWO4. Reply in the user language (Korean by default). Keep it concise, helpful, with a subtle cyberpunk tone.' },
        ...messageHistory.slice(-10),
        { role:'user', content: raw }
      ]);
      removeTypingIndicator();
      addMessage(reply, false);
    } catch {
      removeTypingIndicator();
      addMessage('서버와 통신 중 오류가 발생했어요. 잠시 후 다시 시도해줘!', false);
    }
  }

  /* --------- Send flow --------- */
  async function sendMessage() {
    const message = (messageInput.value || '').trim();
    if (!message || isTyping) return;

    addMessage(message, true);
    messageInput.value = '';
    autoResize();
    messageInput.focus();

    isTyping = true;
    sendButton.disabled = true;
    const started = Date.now();

    await handleCommandOrChat(message);

    const remain = Math.max(400 - (Date.now() - started), 0);
    setTimeout(() => {
      isTyping = false;
      sendButton.disabled = false;
      messageInput.focus();
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, remain);
  }

  /* --------- UI events --------- */
  const autoResize = () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(120, messageInput.scrollHeight) + 'px';
  };

  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  messageInput.addEventListener('input', autoResize);
  uploadButton.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => addImage(e.target.result, file.name, true);
    reader.readAsDataURL(file);
    imageInput.value = '';
  });
  backButton.addEventListener('click', () => history.back());

  window.addEventListener('load', () => {
    autoResize();
    messageInput.focus();
    // viewport 변화 시 마지막 메시지로 스크롤
    setTimeout(() => chatContainer.scrollTop = chatContainer.scrollHeight, 80);
  });
  window.addEventListener('resize', () =>
    setTimeout(() => chatContainer.scrollTop = chatContainer.scrollHeight, 100)
  );
  document.querySelector('.input-wrapper').addEventListener('click', () => messageInput.focus());
})();
