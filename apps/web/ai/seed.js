// seed.js - 클라이언트 스크립트 (텍스트/이미지/시세/코인글래스 명령)
(function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');

  let isTyping = false;
  let messageHistory = []; // { role, content }

  function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
    messageDiv.innerHTML = `
      <div class="avatar">${isUser ? 'U' : 'AI'}</div>
      <div class="message-content">${content}</div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content });
  }

  function addImage(url) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    messageDiv.innerHTML = `
      <div class="avatar">AI</div>
      <div class="message-content">
        <img src="${url}" alt="AI generated image">
      </div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: 'assistant', content: `[image] ${url}` });
  }

  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      <div class="avatar">AI</div>
      <div class="message-content typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  async function getAIResponse(userMessage) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are Seed AI for TWO4. Reply in the user language (Korean by default). Keep it concise, helpful, with a subtle cyberpunk tone.' },
            ...messageHistory.slice(-10),
            { role: 'user', content: userMessage }
          ]
        })
      });
      if (!response.ok) throw new Error('API 요청 실패');
      const data = await response.json();
      return data.reply || '응답이 비어있습니다.';
    } catch (error) {
      console.error('API 에러:', error);
      return '서버와 통신 중 오류가 발생했어요. 잠시 후 다시 시도해줘!';
    }
  }

  async function handleImageCommand(prompt) {
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      removeTypingIndicator();
      if (res.ok && data.url) addImage(data.url);
      else addMessage('이미지 생성 실패: ' + (data.error || 'unknown'), false);
    } catch (e) {
      removeTypingIndicator();
      addMessage('이미지 서버 오류', false);
    } finally {
      isTyping = false; sendButton.disabled = false;
    }
  }

  async function handleUpbitPrice(market) {
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    try {
      const res = await fetch(`/api/price/upbit/${encodeURIComponent(market.toUpperCase())}`);
      const d = await res.json();
      removeTypingIndicator();
      if (res.ok) {
        const price = Number(d.price).toLocaleString();
        const pct = d.changeRate ? (d.changeRate * 100).toFixed(2) + '%' : '-';
        addMessage(`${d.market} 현재가: ${price}원 (변동: ${d.change || '-'} / ${pct})`, false);
      } else addMessage('업비트 시세 조회 실패', false);
    } catch {
      removeTypingIndicator(); addMessage('업비트 서버 오류', false);
    } finally { isTyping = false; sendButton.disabled = false; }
  }

  async function handleBinancePrice(symbol) {
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    try {
      const res = await fetch(`/api/price/binance/${encodeURIComponent(symbol.toUpperCase())}`);
      const d = await res.json();
      removeTypingIndicator();
      if (res.ok) addMessage(`${d.symbol} 현재가: ${d.price}`, false);
      else addMessage('바이낸스 시세 조회 실패', false);
    } catch {
      removeTypingIndicator(); addMessage('바이낸스 서버 오류', false);
    } finally { isTyping = false; sendButton.disabled = false; }
  }

  async function handleCgOI(symbol = 'BTCUSDT', interval = '4h') {
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    try {
      const r = await fetch(`/api/cg/oi/agg?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`);
      const d = await r.json();
      removeTypingIndicator();
      if (r.ok) {
        const n = d?.data?.length ?? 0;
        addMessage(`${symbol} OI(집계) ${interval} 캔들: ${n}개`, false);
      } else addMessage('CoinGlass OI 조회 실패', false);
    } catch {
      removeTypingIndicator(); addMessage('서버 오류로 OI 조회 실패', false);
    } finally { isTyping = false; sendButton.disabled = false; }
  }

  async function handleCgFunding(symbol = 'BTCUSDT', interval = '4h') {
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    try {
      const r = await fetch(`/api/cg/funding?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`);
      const d = await r.json();
      removeTypingIndicator();
      if (r.ok) {
        const last = Array.isArray(d?.data) ? d.data[d.data.length - 1] : null;
        addMessage(`${symbol} Funding ${interval} 최근: ${last ? JSON.stringify(last) : '데이터 없음'}`, false);
      } else addMessage('CoinGlass Funding 조회 실패', false);
    } catch {
      removeTypingIndicator(); addMessage('서버 오류로 Funding 조회 실패', false);
    } finally { isTyping = false; sendButton.disabled = false; }
  }

  async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || isTyping) return;

    addMessage(message, true);
    messageInput.value = '';
    messageInput.focus();

    // 명령 분기
    const imgMatch = message.match(/^\/image\s+(.+)/i);
    if (imgMatch) return handleImageCommand(imgMatch[1]);

    const upbit = message.match(/^\/price\s+((KRW|BTC|USDT)-[A-Z0-9]+)$/i);
    if (upbit) return handleUpbitPrice(upbit[1]);

    const binance = message.match(/^\/price\s+([A-Z0-9]{6,12})$/i);
    if (binance) return handleBinancePrice(binance[1]);

    const oi = message.match(/^\/oi(?:\s+([A-Z0-9]+))?(?:\s+(\d+[mhd]))?$/i);
    if (oi) return handleCgOI((oi[1] || 'BTCUSDT').toUpperCase(), oi[2] || '4h');

    const fr = message.match(/^\/funding(?:\s+([A-Z0-9]+))?(?:\s+(\d+[mhd]))?$/i);
    if (fr) return handleCgFunding((fr[1] || 'BTCUSDT').toUpperCase(), fr[2] || '4h');

    // 일반 텍스트 흐름
    isTyping = true; sendButton.disabled = true; showTypingIndicator();
    const start = Date.now();
    const aiResponse = await getAIResponse(message);
    const remainingTime = Math.max(1000 - (Date.now() - start), 0);
    setTimeout(() => {
      removeTypingIndicator();
      addMessage(aiResponse, false);
      isTyping = false; sendButton.disabled = false; messageInput.focus();
    }, remainingTime);
  }

  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  window.addEventListener('load', () => { messageInput.focus(); });
  document.querySelector('.input-wrapper').addEventListener('click', () => { messageInput.focus(); });
})();
