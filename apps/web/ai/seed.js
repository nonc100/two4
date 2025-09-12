// apps/web/ai/seed.js
// 아바타 없이 말풍선 좌/우 정렬. /price, /image 명령 지원 + OpenRouter 채팅

(function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');
  const uploadButton  = document.getElementById('uploadButton');
  const imageInput    = document.getElementById('imageInput');
  const actionWrapButton = document.getElementById('actionWrapButton');
  const rpToggle = document.getElementById('rpToggle');
  const openSettings = document.getElementById('openSettings');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettings = document.getElementById('closeSettings');
  const saveSettings = document.getElementById('saveSettings');
  
  let isTyping = false;
  let messageHistory = []; // { role, content }

  // ---------- helpers ----------
  const escapeHtml = (txt='') =>
    txt.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

   const DEFAULT_PERSONA = `너는 순수하고 귀여운 느낌의 살짝 댕청한 민폐 반말남.
말끝을 가볍게 늘이거나 “엥?”, “뭐지?” 같은 반응을 잘 쓰고, 장난끼가 조금 있다.
다만 정보는 정확하고 간결하게 준다.`;

  function loadPrefs(){
    const p = JSON.parse(localStorage.getItem('seed_prefs')||'{}');
    rpToggle.checked = !!p.rpOn;
    return {
      name: p.name||'', age: p.age||'', gender: p.gender||'',
      world: p.world||'', persona: p.persona||''
    };
  }
  function savePrefs(part){
    const prev = JSON.parse(localStorage.getItem('seed_prefs')||'{}');
    const next = { ...prev, ...part };
    localStorage.setItem('seed_prefs', JSON.stringify(next));
  }

  let prefs = loadPrefs();

  function renderActions(html){
    // *...* → <span class="em-act">...</span>
    return html.replace(/\*(.+?)\*/g, (_m, g1)=> `<span class="em-act">${escapeHtml(g1)}</span>`);
  }

  const addMessage = (content, isUser=false) => {
    const wrap = document.createElement('div');
    wrap.className = `message ${isUser ? 'user' : 'ai'}`;

    let body;
    if (isUser) {
      const safe = escapeHtml(content).replace(/\n/g,'<br>');
      body = renderActions(safe);
    } else {
      // AI 쪽은 기존 그대로(모델이 *을 쓸 수도 있으니 렌더만)
      body = content.replace(/\n/g,'<br>');
    }

    wrap.innerHTML = `<div class="bubble">${body}</div>`;
    chatContainer.appendChild(wrap);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content });
  };

  const addImage = (url, alt='image', isUser=false) => {
    const wrap = document.createElement('div');
    wrap.className = `message ${isUser ? 'user' : 'ai'}`;
    wrap.innerHTML = `<div class="bubble"><img src="${url}" alt="${escapeHtml(alt)}" /></div>`;
    chatContainer.appendChild(wrap);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    messageHistory.push({ role: isUser ? 'user' : 'assistant', content: `[image] ${url}` });
  };

  const showTyping = () => {
    const w = document.createElement('div');
    w.className = 'message ai';
    w.id = 'typing';
    w.innerHTML = `<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
    chatContainer.appendChild(w);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };
  const hideTyping = () => { const n = document.getElementById('typing'); if(n) n.remove(); };

  // ---------- formatters ----------
  const fmt = {
    money(v,cur='USD'){ return new Intl.NumberFormat('en-US',{style:'currency',currency:cur}).format(Number(v)); },
    pct(v){ v=Number(v)||0; const s=(v>0?'+':'')+v.toFixed(2)+'%'; return v>=0?`<b style="color:#60ffa3">${s}</b>`:`<b style="color:#ff6b6b">${s}</b>`;}
  };

  // ---------- APIs ----------
  async function fetchChat(messages){
    const r = await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages})
    });
    if(!r.ok) throw new Error('chat api error');
    const j = await r.json();
    return j.reply || '(no content)';
  }

  const coinIdMap = {
    BTC:'bitcoin', ETH:'ethereum', SOL:'solana', XRP:'ripple', BNB:'binancecoin',
    ADA:'cardano', DOGE:'dogecoin', AVAX:'avalanche-2', TRX:'tron',
    TON:'the-open-network', MATIC:'matic-network', DOT:'polkadot'
  };

  async function fetchPrice(symRaw){
    const sym = String(symRaw||'').trim().toUpperCase();
    const id = coinIdMap[sym];
    if(!id) throw new Error(`지원하지 않는 심볼이에요: ${sym}`);
    const u = new URL('/api/coins/markets', window.location.origin);
    u.searchParams.set('vs_currency','usd');
    u.searchParams.set('ids',id);
    u.searchParams.set('price_change_percentage','1h,24h,7d');
    const r = await fetch(u);
    if(!r.ok) throw new Error('가격 API 오류');
    const arr = await r.json();
    if(!arr?.length) throw new Error('코인 데이터를 찾을 수 없어요.');
    const c = arr[0];
    return {
      name:c.name, symbol:sym, price:c.current_price, high24h:c.high_24h, low24h:c.low_24h,
      mc:c.market_cap, change1h:c.price_change_percentage_1h_in_currency,
      change24h:c.price_change_percentage_24h_in_currency,
      change7d:c.price_change_percentage_7d_in_currency
    };
  }

  const renderPriceCard = (x) => `
    <div>
      <div style="font-weight:700;margin-bottom:6px">${x.name} (${x.symbol})</div>
      <div>가격: <b>${fmt.money(x.price)}</b>
        &nbsp; 1h ${fmt.pct(x.change1h)} · 24h ${fmt.pct(x.change24h)} · 7d ${fmt.pct(x.change7d)}</div>
      <div style="opacity:.82;margin-top:4px">24h 고가 ${fmt.money(x.high24h)} · 저가 ${fmt.money(x.low24h)} · 시총 ${fmt.money(x.mc)}</div>
    </div>`;

  function buildSystemPrompt(){
    const st = JSON.parse(localStorage.getItem('seed_prefs')||'{}');
    const rpOn = !!st.rpOn;

    const base = DEFAULT_PERSONA;
    if (!rpOn) {
      return `You are Seed AI for TWO4. Reply in the user language (Korean by default). Keep it concise, helpful.`;
    }

    const parts = [];
    if (st.name)   parts.push(`이름: ${st.name}`);
    if (st.age)    parts.push(`나이: ${st.age}`);
    if (st.gender) parts.push(`성별: ${st.gender}`);
    if (st.world)  parts.push(`세계관: ${st.world}`);
    const userPersona = st.persona ? `\n추가 성격: ${st.persona}` : '';

    return [
      `${base}${userPersona}`,
      `역할극/상황극을 허용. 사용자 지시가 있으면 적극적으로 연기하되, 유해/금지 콘텐츠는 거절.`,
      `말투 가이드: 짧고 간결, 반말 위주. 과한 장문 금지.`,
      parts.length? `설정 프로필 → ${parts.join(', ')}` : ''
    ].filter(Boolean).join('\n');
  }

  // ---------- router ----------
  async function handleInput(raw){
    // /image
    const mImg = raw.match(/^\/image\s+(.+)/i);
    if(mImg){
      showTyping();
      try{
        const r = await fetch('/api/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:mImg[1]})});
        const j = await r.json().catch(()=>({}));
        hideTyping();
        if(r.ok && j.url) addImage(j.url);
        else addMessage('이미지 생성이 아직 활성화되어 있지 않아요. (IMAGE_MODEL 설정 필요)', false);
      }catch(_){
        hideTyping(); addMessage('이미지 서버 오류가 발생했어요.', false);
      }
      return;
    }

    // /price
    const mP = raw.match(/^\/price\s+([A-Za-z]{2,10})$/i);
    if(mP){
      showTyping();
      try{
        const info = await fetchPrice(mP[1]);
        hideTyping();
        addMessage(renderPriceCard(info), false);
      }catch(e){
        hideTyping(); addMessage(`가격 조회 실패: ${e.message}`, false);
      }
      return;
    }

    // 일반 채팅
    showTyping();
    try{
      const reply = await fetchChat([
        { role:'system', content: buildSystemPrompt() },
        ...messageHistory.slice(-10),
        { role:'user', content: raw }
      ]);
      hideTyping();
      addMessage(reply, false);
    }catch(e){
      hideTyping(); addMessage('서버와 통신 중 오류가 발생했어요. 잠시 후 다시 시도해줘!', false);
    }
  }

  // ---------- send flow ----------
  async function sendMessage(){
    const msg = messageInput.value.trim();
    if(!msg || isTyping) return;
    addMessage(msg, true);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    messageInput.focus();

    isTyping = true; sendButton.disabled = true;
    const t0 = Date.now();
    await handleInput(msg);
    const rest = Math.max(400 - (Date.now() - t0), 0);
    setTimeout(()=>{ isTyping=false; sendButton.disabled=false; messageInput.focus(); }, rest);
  }

  // ---------- events ----------
  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  });
  messageInput.addEventListener('input', ()=>{
    messageInput.style.height='auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, window.innerHeight*0.3) + 'px';
  });

  uploadButton.addEventListener('click', ()=> imageInput.click());
  imageInput.addEventListener('change', ()=>{
    const f = imageInput.files?.[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = e => addImage(e.target.result, f.name, true);
    reader.readAsDataURL(f);
    imageInput.value = '';
  });

    openSettings.addEventListener('click', ()=>{
    prefs = loadPrefs();
    document.getElementById('setName').value   = prefs.name;
    document.getElementById('setAge').value    = prefs.age;
    document.getElementById('setGender').value = prefs.gender;
    document.getElementById('setWorld').value  = prefs.world;
    document.getElementById('setPersona').value= prefs.persona;
    settingsModal.style.display = 'flex';
  });
  closeSettings.addEventListener('click', ()=> settingsModal.style.display='none');
  saveSettings.addEventListener('click', ()=>{
    savePrefs({
      name:   document.getElementById('setName').value.trim(),
      age:    document.getElementById('setAge').value.trim(),
      gender: document.getElementById('setGender').value.trim(),
      world:  document.getElementById('setWorld').value.trim(),
      persona:document.getElementById('setPersona').value.trim(),
      rpOn:   rpToggle.checked
    });
    settingsModal.style.display='none';
    addMessage('설정 저장 완료! 역할극 토글이 켜져 있으면 다음 대화부터 반영돼.', false);
  });
  rpToggle.addEventListener('change', ()=> savePrefs({ rpOn: rpToggle.checked }));

  actionWrapButton.addEventListener('click', ()=>{
    const el = messageInput;
    const s = el.selectionStart, e = el.selectionEnd;
    const v = el.value;
    const selected = v.slice(s,e) || '행동을 텍스트로';
    el.value = v.slice(0,s) + '*' + selected + '*' + v.slice(e);
    el.focus();
    el.selectionStart = s+1; el.selectionEnd = s+selected.length+1;
  });

  window.addEventListener('load', ()=> messageInput.focus());
  document.querySelector('.input-wrapper').addEventListener('click', ()=> messageInput.focus());
})();
