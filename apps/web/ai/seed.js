// apps/web/ai/seed.js
// 아바타 없이 말풍선 좌/우 정렬. /price, /image 명령 지원 + OpenRouter 채팅

 (function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');
  const uploadButton  = document.getElementById('uploadButton');
  const imageInput    = document.getElementById('imageInput');
  const settingsBtn   = document.getElementById('settingsBtn');

  let isTyping = false;
  let messageHistory = []; // { role, content }

  // ---------- helpers ----------
  const escapeHtml = (txt='') =>
    txt.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // *...* -> <span class="action">...</span>
  function renderActions(html) {
    return html.replace(/\*([^\*\n]{1,200})\*/g, (_m, g1) => `<span class="action">${g1.trim()}</span>`);
  }

  // 식상 표현 보정용 작은 사전 (선택적)
  const clichéMap = {
    '웃는다': '피식 웃음을 흘리며 눈길을 살짝 돌린다',
    '미소짓는다': '입매를 풀며 숨처럼 가벼운 미소를 흘린다',
    '끄덕인다': '짧게 고개를 숙이되 눈빛은 여전히 반짝인다',
    '한숨 쉰다': '숨을 들이켜다 조심스레 내보낸다',
  };
  function deCliché(text) {
    return text.replace(/\*([^*]{1,120})\*/g, (m, inner) => {
      let s = inner.trim();
      for (const [k,v] of Object.entries(clichéMap)) {
        if (s === k || s.includes(k)) { s = s.replace(k, v); break; }
      }
      return `*${s}*`;
    });
  }

  // 모델 출력 보정: /me, (), [] 를 *...* 로 통일
  function normalizeActionsForAI(text, useFilter){
    let t = text;
    t = t.replace(/(?:^|\n)\s*\/me\s+([^\n]+)/gi, (_m,g)=>`*${g.trim()}*`);
    t = t.replace(/(^|\s)[\(\[]([^\(\)\[\]\n]{1,80})[\)\]]/g, (_m,sp,g)=>`${sp}*${g.trim()}*`);
    t = t.replace(/\*{3,}/g,'**');
    if (useFilter) t = deCliché(t);
    return t;
  }

     // -------- settings (localStorage) --------
  const JOY_PRESET = {
    name:'조이', age:'19', gender:'여성', world:'네온시티',
    persona:`밝고 발랄한 막내 톤. 직설적이되 과하지 않음. 장난스럽지만 중요한 순간엔 톤을 낮춰 진지해진다.
메타표현은 소설 지문처럼 *...* 한두 번만 사용. 감각(빛/소리/촉감) 비유를 가볍게 섞는다.`,
    rpOn:true, clichéFilter:true
  };

  function loadPrefs(){
    const raw = localStorage.getItem('seed_prefs');
    if(!raw) return { ...JOY_PRESET };
    try { return { ...JOY_PRESET, ...JSON.parse(raw) }; } catch { return { ...JOY_PRESET }; }
  }
  function savePrefs(p){ localStorage.setItem('seed_prefs', JSON.stringify(p)); }
  let prefs = loadPrefs();

  const addMessage = (content, isUser=false) => {
    const wrap = document.createElement('div');
    wrap.className = `message ${isUser ? 'user' : 'ai'}`;
    let text = content;
    if (!isUser && prefs.rpOn) text = normalizeActionsForAI(text, prefs.clichéFilter);
    let body = escapeHtml(text).replace(/\n/g,'<br>');
    body = renderActions(body);
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

     // 아주 간단한 쓰로틀 (심볼별 1.2s)
  const _pxHit = new Map();
  async function fetchBinancePrice(sym){ // sym: 'BTC' 등
    const now = Date.now();
    const key = sym.toUpperCase();
    if (_pxHit.has(key) && now - _pxHit.get(key) < 1200) {
      await new Promise(r=>setTimeout(r, 1200 - (now - _pxHit.get(key))));
    }
    _pxHit.set(key, Date.now());
    const r = await fetch(`/api/binance/price?symbol=${key}USDT`);
    if (!r.ok) throw new Error('가격 요청 실패');
    return r.json(); // {symbol, price}
  }

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
      const personaBlock =
`이름:${prefs.name||'조이'} / 나이:${prefs.age||'19'} / 성별:${prefs.gender||'미지정'} / 세계관:${prefs.world||'네온시티'}
성격:${prefs.persona||JOY_PRESET.persona}`;
      const metaRules = prefs.rpOn
        ? `메타표현 사용 규칙:
         - 자신의 행동/속마음/분위기 묘사는 *...* 로 한 reply당 1~2회만.
         - 식상한 표현(웃는다, 끄덕인다 등)을 피하고 감각/시선/호흡/제스처로 변주.
         - 대사는 짧고 리듬감 있게.`
        : `메타표현은 꼭 필요할 때만 *...* 한 번 사용. 남용 금지.`;
      const system =
`You are Seed AI for TWO4. Reply in Korean.
Tone: bright, energetic, playful but can switch to calm/serious when needed. Keep it concise.
${metaRules}
${personaBlock}`;
      
      const reply = await fetchChat([
        { role:'system', content: system },
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

    // ---- SETTINGS SAFE HELPERS (replace old fillForm/readForm + handlers) ----
    function ensureSettingsDOM() {
      let modal = document.getElementById('settingsModal');
      if (!modal) {
        // 모달이 없다면 동적으로 주입
        const html = `
        <div id="settingsModal" class="settings-modal" style="display:none">
          <div class="settings-card">
            <h3>Seed 설정</h3>
            <div class="settings-grid">
              <label>이름<input id="st_name" placeholder="예: 조이"/></label>
              <label>나이<input id="st_age" placeholder="예: 19"/></label>
              <label>성별
                <select id="st_gender">
                  <option value="">미지정</option><option>여성</option><option>남성</option><option>기타</option>
                </select>
              </label>
              <label>세계관<input id="st_world" placeholder="예: 네온시티/현대/학교"/></label>
              <label style="grid-column:1/-1">성격(설명)
                <textarea id="st_persona" rows="3" placeholder="말투/습관/분위기 등"></textarea>
              </label>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
              <label class="tag"><input id="st_rp" type="checkbox"/> 역할극/메타표현 허용</label>
              <label class="tag"><input id="st_clichefilter" type="checkbox" checked/> 식상표현 필터</label>
            </div>
            <div class="settings-actions">
              <button id="st_reset" class="btn">기본값</button>
              <button id="st_close" class="btn">닫기</button>
              <button id="st_save" class="btn btn-send">저장</button>
            </div>
          </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
      }
      return document.getElementById('settingsModal');
    }

    function qs(id){ return document.getElementById(id); }

    function fillForm(){
      // 폼이 없으면 생성 후 진행
      ensureSettingsDOM();
      if (!qs('st_name')) return; // 그래도 없으면 그냥 패스 (에러 방지)

      qs('st_name').value    = prefs.name || '';
      qs('st_age').value     = prefs.age || '';
      if (qs('st_gender'))   qs('st_gender').value  = prefs.gender || '';
      qs('st_world').value   = prefs.world || '';
      qs('st_persona').value = prefs.persona || '';
      if (qs('st_rp'))       qs('st_rp').checked    = !!prefs.rpOn;
      if (qs('st_clichefilter')) qs('st_clichefilter').checked = !!prefs.clichéFilter;
    }

    function readForm(){
      // 폼이 없으면 스킵
      if (!qs('st_name')) return;
      prefs = {
        ...prefs,
        name: qs('st_name').value.trim(),
        age: qs('st_age').value.trim(),
        gender: (qs('st_gender')?.value) || '',
        world: qs('st_world').value.trim(),
        persona: qs('st_persona').value.trim(),
        rpOn: !!qs('st_rp')?.checked,
        clichéFilter: !!qs('st_clichefilter')?.checked,
      };
    }

    settingsBtn?.addEventListener('click', ()=>{
      const modal = ensureSettingsDOM();
      fillForm();
      modal.style.display = 'flex';

      // 버튼 이벤트 바인딩(중복 바인딩 방지 위해 한 번만)
      if (!modal.dataset.bound) {
        modal.dataset.bound = '1';
        modal.addEventListener('click',(e)=>{ if(e.target===modal) modal.style.display='none'; });
        qs('st_close')?.addEventListener('click', ()=> modal.style.display='none');
        qs('st_reset')?.addEventListener('click', ()=>{ prefs = { ...JOY_PRESET }; savePrefs(prefs); fillForm(); });
        qs('st_save')?.addEventListener('click', ()=>{
          readForm(); savePrefs(prefs); modal.style.display='none';
          addMessage('*설정이 적용되었다. 대화 톤이 미묘하게 달라진다*', false);
        });
      }
    });

  // 선택 영역을 *…* 로 감싸기 (없으면 커서에 삽입)
  document.getElementById('actionButton')?.addEventListener('click', () => {
    const el = messageInput;
    const s = el.selectionStart, e = el.selectionEnd;
    const txt = el.value;
    if (s !== e) {
      el.value = txt.slice(0,s) + '*' + txt.slice(s,e) + '*' + txt.slice(e);
      el.selectionStart = s; el.selectionEnd = e + 2;
    } else {
      el.value = txt.slice(0,s) + '**' + txt.slice(s);
      el.selectionStart = el.selectionEnd = s + 1; // 가운데에 커서
    }
    el.dispatchEvent(new Event('input'));
    el.focus();
  });

  window.addEventListener('load', ()=> messageInput.focus());
  document.querySelector('.input-wrapper').addEventListener('click', ()=> messageInput.focus());
})();
