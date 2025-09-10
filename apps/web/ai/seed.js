// apps/web/ai/seed.js
// Seed AI 클라이언트 스크립트 (텍스트/이미지/시세 명령 지원)

(function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');
   const backButton    = document.getElementById('backButton');
  const uploadButton  = document.getElementById('uploadButton');
  const imageInput    = document.getElementById('imageInput');

  let isTyping = false;
  let messageHistory = []; // { role, content }

  // ---------------- UI helpers ----------------
    function escapeHtml(text) {
    return text.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
   const body = isUser ? escapeHtml(content).replace(/\n/g, '<br>') : content.replace(/\n/g, '<br>');
    messageDiv.innerHTML = `
      <div class="avatar">${isUser ? 'U' : 'AI'}</div>
      <div class="message-content">${body}</div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content });
  }

  function addImage(url, alt = 'image', isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
    messageDiv.innerHTML = `
      <div class="avatar">${isUser ? 'U' : 'AI'}</div>
      <div class="message-content"><img src="${url}" alt="${escapeHtml(alt)}" /></div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content: `[image] ${url}` });
  }

  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      <div class="avatar">AI</div>
      <div class="message-content typing-indicator">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  // ---------------- Utils ----------------
  const coinIdMap = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    XRP: 'ripple',
    BNB: 'binancecoin',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    AVAX: 'avalanche-2',
    TRX: 'tron',
    TON: 'the-open-network',
    MATIC: 'matic-network',
    DOT: 'polkadot'
  };

  const fmt = {
    n(n) { return Number(n).toLocaleString('en-US'); },
    p(p) {
      const v = Number(p);
      const s = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
      return v >= 0 ? `<b style="color:#60ffa3">${s}</b>` : `<b style="color:#ff6b6b">${s}</b>`;
    },
    money(x, cur = 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(Number(x));
    }
  };

  // ---------------- API calls ----------------
  async function fetchChat(messages) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error('chat api error');
    const data = await res.json();
    return data.reply || '(no content)';
  }

  // 시세: 심볼→id 매핑 후 /api/coins/markets 로 상세 (현재가/24h/7d 등)
  async function fetchPrice(symRaw) {
    const sym = String(symRaw || '').trim().toUpperCase();
    const id = coinIdMap[sym] || null;
    if (!id) throw new Error(`지원하지 않는 심볼이에요: ${sym}`);

    const u = new URL('/api/coins/markets', window.location.origin);
    u.searchParams.set('vs_currency', 'usd');
    u.searchParams.set('ids', id);
    u.searchParams.set('price_change_percentage', '1h,24h,7d');

    const res = await fetch(u);
    if (!res.ok) throw new Error('가격 API 오류');
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('코인 데이터를 찾을 수 없어요.');

    const c = arr[0];
    return {
      name: c.name,
      symbol: sym,
      price: c.current_price,
      high24h: c.high_24h,
      low24h: c.low_24h,
      mc: c.market_cap,
      change1h: c.price_change_percentage_1h_in_currency,
      change24h: c.price_change_percentage_24h_in_currency,
      change7d: c.price_change_percentage_7d_in_currency
    };
  }

  function renderPriceCard(info) {
    return `
      <div>
        <div style="font-weight:600;margin-bottom:6px">${info.name} (${info.symbol})</div>
        <div>가격: <b>${fmt.money(info.price)}</b>
            &nbsp; 1h ${fmt.p(info.change1h)} · 24h ${fmt.p(info.change24h)} · 7d ${fmt.p(info.change7d)}</div>
        <div style="opacity:.8;margin-top:4px">24h 고가 ${fmt.money(info.high24h)} · 저가 ${fmt.money(info.low24h)} · 시총 ${fmt.money(info.mc)}</div>
      </div>
    `;
  }

  // ---------------- Command router ----------------
  // 지원 명령:
  //  - /price BTC   : 실시간 가격 카드
  //  - /image 프롬프트 : (서버가 구현되면) 이미지 생성
  async function handleCommandOrChat(raw) {
    // 1) 이미지 명령
    const imgMatch = raw.match(/^\/image\s+(.+)/i);
    if (imgMatch) {
      showTypingIndicator();
      try {
        const res = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: imgMatch[1] })
        });
        const data = await res.json().catch(()=> ({}));
        removeTypingIndicator();
        if (res.ok && data.url) {
          addImage(data.url);
        } else {
          addMessage('이미지 생성이 아직 활성화되어 있지 않아요. (IMAGE_MODEL 설정 필요)', false);
        }
      } catch (_) {
        removeTypingIndicator();
        addMessage('이미지 서버 오류가 발생했어요.', false);
      }
      return;
    }

    // 2) 가격 명령
    const priceMatch = raw.match(/^\/price\s+([A-Za-z]{2,10})$/i);
    if (priceMatch) {
      const sym = priceMatch[1];
      showTypingIndicator();
      try {
        const info = await fetchPrice(sym);
        removeTypingIndicator();
        addMessage(renderPriceCard(info), false);
      } catch (e) {
        removeTypingIndicator();
        addMessage(`가격 조회 실패: ${e.message}`, false);
      }
      return;
    }

    // 3) 일반 대화 → OpenRouter
    showTypingIndicator();
    try {
      const reply = await fetchChat([
        { role: 'system', content: 'You are Seed AI for TWO4. Reply in the user language (Korean by default). Keep it concise, helpful, with a subtle cyberpunk tone.' },
        ...messageHistory.slice(-10),
        { role: 'user', content: raw }
      ]);
      removeTypingIndicator();
      addMessage(reply, false);
    } catch (e) {
      removeTypingIndicator();
      addMessage('서버와 통신 중 오류가 발생했어요. 잠시 후 다시 시도해줘!', false);
    }
  }

  // ---------------- Send flow ----------------
  async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isTyping) return;

    addMessage(message, true);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    messageInput.focus();

    isTyping = true;
    sendButton.disabled = true;

    const start = Date.now();
    await handleCommandOrChat(message);
    const remain = Math.max(500 - (Date.now() - start), 0);
    setTimeout(() => {
      isTyping = false;
      sendButton.disabled = false;
      messageInput.focus();
    }, remain);
  }

  // init events
  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
    messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
  });
  uploadButton.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => addImage(e.target.result, file.name, true);
      reader.readAsDataURL(file);
      imageInput.value = '';
    }
  });
  backButton.addEventListener('click', () => history.back());
  window.addEventListener('load', () => messageInput.focus());
  document.querySelector('.input-wrapper').addEventListener('click', () => messageInput.focus());
})();
