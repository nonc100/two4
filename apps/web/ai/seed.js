// apps/web/ai/seed.js
// 말풍선 좌/우 정렬 + 메타표현(*…*) + 설정/토글 + /price, /image 명령 + OpenRouter 채팅

(function () {
  const chatContainer = document.getElementById('chatContainer');
  const messageInput  = document.getElementById('messageInput');
  const sendButton    = document.getElementById('sendButton');
  const uploadButton  = document.getElementById('uploadButton');
  const imageInput    = document.getElementById('imageInput');
  const settingsBtn   = document.getElementById('settingsBtn');
  const rpToggle      = document.getElementById('rpToggle');

  let isTyping = false;
  let messageHistory = []; // { role, content }

  // ---------- helpers ----------
  const escapeHtml = (txt='') =>
    txt.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // *...* → <span class="action">...</span>
  function renderActions(html) {
    return html.replace(/\*([^\*\n]{1,200})\*/g, (_m, g1) => `<span class="action">${g1.trim()}</span>`);
  }

  // 식상 표현 치환(선택)
  const clichéMap = {
    '웃는다': '피식 웃음을 흘리며 시선을 비껴 준다',
    '미소짓는다': '입매를 느슨히 풀며 가벼운 미소를 흘린다',
    '끄덕인다': '짧게 고개를 숙이되 눈빛은 또렷하다',
    '한숨 쉰다': '숨을 들이켰다가 조심히 내쉰다',
  };
  function deCliché(text) {
    return text.replace(/\*([^*]{1,140})\*/g, (m, inner) => {
      let s = inner.trim();
      for (const [k,v] of Object.entries(clichéMap)) {
        if (s === k || s.includes(k)) { s = s.replace(k, v); break; }
      }
      return `*${s}*`;
    });
  }

  // /me, (), [] → *…* 로 통일
  function normalizeActionsForAI(text, useFilter){
    let t = text;
    t = t.replace(/(?:^|\n)\s*\/me\s+([^\n]+)/gi, (_m,g)=>`*${g.trim()}*`);
    t = t.replace(/(^|\s)[\(\[]([^\(\)\[\]\n]{1,80})[\)\]]/g, (_m,sp,g)=>`${sp}*${g.trim()}*`);
    t = t.replace(/\*{3,}/g,'**');
    if (useFilter) t = deCliché(t);
    return t;
  }

  // ---------- settings (localStorage) ----------
  const JOY_PRESET = {
    name:'Seed', age:'20', gender:'기타', world:'현대',
    persona:`밝고 발랄한 막내 톤. 솔직하지만 과하지 않음. 장난스러우나 필요할 땐 진지하게 톤을 낮춘다.
메타표현은 소설 지문처럼 *...* 한두 번만. 감각(빛/소리/촉감) 비유를 가볍게 섞는다.`,
    rpOn:true, clichéFilter:true
  };

  function loadPrefs(){
    const raw = localStorage.getItem('seed_prefs');
    if(!raw) return { ...JOY_PRESET };
    try { return { ...JOY_PRESET, ...JSON.parse(raw) }; } catch { return { ...JOY_PRESET }; }
  }
  function savePrefs(p){ localStorage.setItem('seed_prefs', JSON.stringify(p)); }
  let prefs = loadPrefs();

  // ---------- UI 메시지 ----------
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
    money(v, cur = 'USD') {
      const num = Number(v);
      if (!Number.isFinite(num)) return '--';
      const safeCur = cur === 'USDT' ? 'USD' : cur;
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCur }).format(num);
      } catch {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
      }
    },
    pct(v) {
      const num = Number(v);
      if (!Number.isFinite(num)) return '<span style="opacity:.6">--</span>';
      const s = (num > 0 ? '+' : '') + num.toFixed(2) + '%';
      return num >= 0
        ? `<b style="color:#60ffa3">${s}</b>`
        : `<b style="color:#ff6b6b">${s}</b>`;
    }
  };

  const sanitizeKey = (str = '') => str.toLowerCase().replace(/[\s_\-/]/g, '');

  const PRICE_KEYWORD_STRINGS = [
    '가격', '시세', '얼마', '얼만', '얼마야', '얼만가', '값', '가치',
    'price', 'cost', 'quote', 'rate', 'how much', '시가', '호가'
  ];

  const PRICE_KEYWORD_CONFIG = PRICE_KEYWORD_STRINGS.map(str => {
    const raw = String(str || '').toLowerCase();
    const normalized = sanitizeKey(raw);
    return {
      raw,
      normalized,
      tokenParts: raw.split(/\s+/).map(sanitizeKey).filter(Boolean)
    };
  });

  const PRICE_KEYWORD_SET = new Set();
  PRICE_KEYWORD_CONFIG.forEach(({ normalized, tokenParts }) => {
    if (normalized) PRICE_KEYWORD_SET.add(normalized);
    tokenParts.forEach(t => PRICE_KEYWORD_SET.add(t));
  });

  const ASSET_CATALOG = [
    { symbol: 'BTC', name: 'Bitcoin',   binanceSymbol: 'BTCUSDT', coingeckoId: 'bitcoin',       keywords: ['btc', 'btcusdt', 'bitcoin', '비트', '비트코인', '비트 코인', 'btc/usdt', 'btc-usdt'] },
    { symbol: 'ETH', name: 'Ethereum',  binanceSymbol: 'ETHUSDT', coingeckoId: 'ethereum',      keywords: ['eth', 'ethusdt', 'ethereum', '이더', '이더리움', '이더 리움', 'eth/usdt', 'eth-usdt'] },
    { symbol: 'SOL', name: 'Solana',    binanceSymbol: 'SOLUSDT', coingeckoId: 'solana',        keywords: ['sol', 'solusdt', 'solana', '솔라나', 'sol/usdt', 'sol-usdt'] },
    { symbol: 'XRP', name: 'XRP',       binanceSymbol: 'XRPUSDT', coingeckoId: 'ripple',        keywords: ['xrp', 'xrpusdt', '리플', 'xrp/usdt', 'xrp-usdt'] },
    { symbol: 'BNB', name: 'BNB',       binanceSymbol: 'BNBUSDT', coingeckoId: 'binancecoin',   keywords: ['bnb', 'bnbusdt', '바이낸스코인', '바이낸스 코인', 'binance coin', 'bnb/usdt', 'bnb-usdt'] },
    { symbol: 'ADA', name: 'Cardano',   binanceSymbol: 'ADAUSDT', coingeckoId: 'cardano',       keywords: ['ada', 'adausdt', 'cardano', '에이다', '카르다노', 'ada/usdt', 'ada-usdt'] },
    { symbol: 'DOGE',name: 'Dogecoin',  binanceSymbol: 'DOGEUSDT',coingeckoId: 'dogecoin',      keywords: ['doge', 'dogeusdt', '도지', '도지코인', 'doge/usdt', 'doge-usdt'] },
    { symbol: 'AVAX',name: 'Avalanche', binanceSymbol: 'AVAXUSDT',coingeckoId: 'avalanche-2',   keywords: ['avax', 'avaxusdt', '아발란체', 'avax/usdt', 'avax-usdt'] },
    { symbol: 'TRX', name: 'Tron',      binanceSymbol: 'TRXUSDT', coingeckoId: 'tron',          keywords: ['trx', 'trxusdt', '트론', 'trx/usdt', 'trx-usdt'] },
    { symbol: 'TON', name: 'Toncoin',   binanceSymbol: 'TONUSDT', coingeckoId: 'the-open-network', keywords: ['ton', 'tonusdt', 'toncoin', '톤', '톤코인', 'ton/usdt', 'ton-usdt'] },
    { symbol: 'MATIC',name: 'Polygon',  binanceSymbol: 'MATICUSDT',coingeckoId: 'matic-network', keywords: ['matic', 'maticusdt', 'polygon', '폴리곤', 'matic/usdt', 'matic-usdt'] },
    { symbol: 'DOT', name: 'Polkadot',  binanceSymbol: 'DOTUSDT', coingeckoId: 'polkadot',      keywords: ['dot', 'dotusdt', 'polkadot', '폴카닷', 'dot/usdt', 'dot-usdt'] }
  ];

  const ASSET_BY_KEY = new Map();
  const PHRASE_KEYS = [];

  ASSET_CATALOG.forEach(asset => {
    const synonyms = new Set([asset.symbol, asset.binanceSymbol, asset.name, ...(asset.keywords || [])]);
    asset.normalizedSynonyms = new Set();
    synonyms.forEach(value => {
      if (!value) return;
      const lower = String(value).toLowerCase().trim();
      if (!lower) return;
      const normalized = sanitizeKey(lower);
      if (!normalized) return;
      asset.normalizedSynonyms.add(normalized);
      if (!ASSET_BY_KEY.has(normalized)) {
        ASSET_BY_KEY.set(normalized, asset);
      }
      if (!/^[0-9a-z]+$/.test(normalized)) {
        PHRASE_KEYS.push({ key: normalized, asset });
      }
    });
  });

  const resolveAssetFromToken = (token) => {
    if (!token) return null;
    const normalized = sanitizeKey(token);
    return ASSET_BY_KEY.get(normalized) || null;
  };

  const hasPriceKeyword = (lower, collapsed) => PRICE_KEYWORD_CONFIG.some(({ raw, normalized }) => {
    return (raw && lower.includes(raw)) || (normalized && collapsed.includes(normalized));
  });

  const detectPriceIntent = (raw) => {
    const text = String(raw || '');
    const trimmed = text.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const collapsed = sanitizeKey(lower);
    const tokens = lower.split(/[^0-9a-z가-힣]+/).map(t => sanitizeKey(t)).filter(Boolean);

    let asset = null;
    for (const token of tokens) {
      const candidate = ASSET_BY_KEY.get(token);
      if (candidate) { asset = candidate; break; }
    }
    if (!asset) {
      for (const { key, asset: candidate } of PHRASE_KEYS) {
        if (collapsed.includes(key)) { asset = candidate; break; }
      }
    }
    if (!asset) return null;

    const keywordHit = hasPriceKeyword(lower, collapsed);
    const sanitizedTrimmed = sanitizeKey(trimmed.replace(/[?!\.]+$/g, ''));
    const directMatch = sanitizedTrimmed && asset.normalizedSynonyms.has(sanitizedTrimmed);
    const tokensWithoutPrice = tokens.filter(t => !PRICE_KEYWORD_SET.has(t));
    const onlyAssetToken = tokensWithoutPrice.length === 1 && ASSET_BY_KEY.get(tokensWithoutPrice[0]) === asset;

    if (!keywordHit && !directMatch && !onlyAssetToken) return null;

    return asset;
  };

  const fetchFastPrice = async (symbol) => {
    const pair = String(symbol || '').toUpperCase();
    if (!pair) throw new Error('거래쌍이 설정되지 않았어요.');
    const u = new URL('/api/price/fast', window.location.origin);
    u.searchParams.set('symbol', pair);
    const r = await fetch(u);
    if (!r.ok) throw new Error('실시간 시세 API 호출에 실패했어요.');
    const data = await r.json();
    const price = Number(data.price);
    if (!Number.isFinite(price)) throw new Error('시세 데이터 형식이 올바르지 않아요.');
    return { price, source: data.source || 'fast', cached: Boolean(data.cached), pair };
  };

  const fetchCoinGeckoMarket = async (id) => {
    const coinId = String(id || '').trim();
    if (!coinId) throw new Error('코인 ID가 설정되지 않았어요.');
    const u = new URL('/api/coins/markets', window.location.origin);
    u.searchParams.set('vs_currency', 'usd');
    u.searchParams.set('ids', coinId);
    u.searchParams.set('price_change_percentage', '1h,24h,7d');
    const r = await fetch(u);
    if (!r.ok) throw new Error('시세 상세 API 호출에 실패했어요.');
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) throw new Error('코인 데이터를 찾을 수 없어요.');
    const c = arr[0] || {};
    return {
      name: c.name,
      symbol: c.symbol ? String(c.symbol).toUpperCase() : '',
      price: Number(c.current_price),
      high24h: Number(c.high_24h),
      low24h: Number(c.low_24h),
      marketCap: Number(c.market_cap),
      change1h: Number(c.price_change_percentage_1h_in_currency),
      change24h: Number(c.price_change_percentage_24h_in_currency),
      change7d: Number(c.price_change_percentage_7d_in_currency)
    };
  };

  const fetchPriceForAsset = async (asset) => {
    const fastPromise = asset?.binanceSymbol ? fetchFastPrice(asset.binanceSymbol) : Promise.reject(new Error('실시간 시세가 지원되지 않아요.'));
    const cgPromise = asset?.coingeckoId ? fetchCoinGeckoMarket(asset.coingeckoId) : Promise.reject(new Error('세부 시세가 지원되지 않아요.'));
    const [fastRes, cgRes] = await Promise.allSettled([fastPromise, cgPromise]);

    const fastData = fastRes.status === 'fulfilled' ? fastRes.value : null;
    const cgData = cgRes.status === 'fulfilled' ? cgRes.value : null;

    if (!fastData && !cgData) {
      const err = fastRes.status === 'rejected' ? fastRes.reason : cgRes.reason;
      throw err instanceof Error ? err : new Error('가격 데이터를 가져올 수 없어요.');
    }

    const price = fastData?.price ?? cgData?.price;
    if (!Number.isFinite(Number(price))) {
      throw new Error('가격 데이터를 가져올 수 없어요.');
    }

    return {
      name: asset.name || cgData?.name || asset.symbol,
      symbol: asset.symbol || cgData?.symbol || '',
      pair: fastData?.pair || asset.binanceSymbol || asset.symbol,
      price: Number(price),
      priceSource: fastData?.source || (cgData ? 'coingecko' : ''),
      priceCached: fastData?.cached || false,
      currency: asset.currency || 'USD',
      high24h: cgData?.high24h,
      low24h: cgData?.low24h,
      marketCap: cgData?.marketCap,
      change1h: cgData?.change1h,
      change24h: cgData?.change24h,
      change7d: cgData?.change7d
    };
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

  const isFiniteNumber = (v) => Number.isFinite(Number(v));

  const renderPriceCard = (x) => {
    const changeParts = [];
    if (isFiniteNumber(x.change1h)) changeParts.push(`1h ${fmt.pct(x.change1h)}`);
    if (isFiniteNumber(x.change24h)) changeParts.push(`24h ${fmt.pct(x.change24h)}`);
    if (isFiniteNumber(x.change7d)) changeParts.push(`7d ${fmt.pct(x.change7d)}`);
    const changeLine = changeParts.length ? `&nbsp; ${changeParts.join(' · ')}` : '';

    const metaParts = [];
    if (isFiniteNumber(x.high24h)) metaParts.push(`24h 고가 ${fmt.money(x.high24h, x.currency)}`);
    if (isFiniteNumber(x.low24h)) metaParts.push(`저가 ${fmt.money(x.low24h, x.currency)}`);
    if (isFiniteNumber(x.marketCap)) metaParts.push(`시총 ${fmt.money(x.marketCap, x.currency)}`);
    const metaLine = metaParts.length ? `<div style="opacity:.82;margin-top:4px">${metaParts.join(' · ')}</div>` : '';

    const sourceParts = [];
    if (x.priceSource) sourceParts.push(x.priceSource.toUpperCase());
    if (x.pair && x.pair !== x.symbol) sourceParts.push(x.pair);
    const sourceNote = sourceParts.length
      ? ` <span style="font-size:12px;opacity:.72">· ${sourceParts.join(' · ')}</span>`
      : '';

    return `
    <div>
      <div style="font-weight:700;margin-bottom:6px">${x.name} (${x.symbol})</div>
      <div>가격: <b>${fmt.money(x.price, x.currency)}</b>${sourceNote}${changeLine}</div>
      ${metaLine}
    </div>`;
  };

  // ---------- router ----------
  async function handleInput(raw){
    // /image
    const mImg = raw.match(/^\/image\s+(.+)/i);
    if(mImg){
      showTyping();
      try{
        const r = await fetch('/api/image',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({prompt:mImg[1]})
        });
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
    const mP = raw.match(/^\/price\s+([A-Za-z0-9\/_-]{2,20})$/i);
    if(mP){
      const symLabel = String(mP[1] || '').trim().toUpperCase();
      showTyping();
      try{
        const asset = resolveAssetFromToken(mP[1]);
        if(!asset) throw new Error(`지원하지 않는 심볼이에요: ${symLabel}`);
        const info = await fetchPriceForAsset(asset);
        hideTyping();
        addMessage(renderPriceCard(info), false);
      }catch(e){
        hideTyping(); addMessage(`가격 조회 실패: ${e.message}`, false);
      }
      return;
    }

    const autoAsset = detectPriceIntent(raw);
    if(autoAsset){
      showTyping();
      try{
        const info = await fetchPriceForAsset(autoAsset);
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
`이름:${prefs.name||'씨드'} / 나이:${prefs.age||'20'} / 성별:${prefs.gender||'미지정'} / 세계관:${prefs.world||'네온시티'}
성격:${prefs.persona||JOY_PRESET.persona}`;
      const metaRules = prefs.rpOn
        ? `메타표현 사용 규칙:
         - 자신의 행동/속마음/분위기 묘사는 *...* 로 한 reply당 1~2회만.
         - 식상한 표현을 피하고 감각/시선/호흡/제스처로 변주.
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

  function canSubmitWithEnter(){
    const landscape = window.innerWidth > window.innerHeight;
    let pointerFine = true;
    if (window.matchMedia) {
      try {
        pointerFine = window.matchMedia('(pointer: fine)').matches;
      } catch (_) {
        pointerFine = true;
      }
    }
    return landscape && pointerFine;
  }

  messageInput.addEventListener('keydown', (ev)=>{
    if(ev.key === 'Enter' && !ev.shiftKey){
      if(!canSubmitWithEnter()) return;
      ev.preventDefault();
      sendMessage();
    }
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

  // ---- SETTINGS (모달 동적 주입) ----
  function ensureSettingsDOM() {
    let modal = document.getElementById('settingsModal');
    if (!modal) {
      const html = `
      <div id="settingsModal" class="settings-modal" style="display:none">
        <div class="settings-card">
          <h3>Seed 설정</h3>
          <div class="settings-grid">
            <div class="settings-row">
              <label>이름<input id="st_name" placeholder="예: 씨드"/></label>
              <label>나이<input id="st_age" placeholder="예: 19"/></label>
            </div>
            <div class="settings-row">
              <label>성별
                <select id="st_gender">
                  <option value="">미지정</option><option>여성</option><option>남성</option><option>기타</option>
                </select>
              </label>
              <label>세계관<input id="st_world" placeholder="예: 네온시티"/></label>
            </div>
            <label>성격 및 말투
              <textarea id="st_persona" rows="3" placeholder="말투/습관/분위기 등"></textarea>
            </label>
            <div style="display:flex; gap:8px; flex-wrap:wrap">
              <label class="tag"><input id="st_rp" type="checkbox"/> 역할극 모드</label>
              <label class="tag"><input id="st_clichefilter" type="checkbox" checked/> 식상표현 필터</label>
            </div>
          </div>
          <div class="settings-actions">
            <button id="st_reset" class="btn">초기화</button>
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
    ensureSettingsDOM();
    if (!qs('st_name')) return;
    qs('st_name').value    = prefs.name || '';
    qs('st_age').value     = prefs.age || '';
    if (qs('st_gender'))   qs('st_gender').value  = prefs.gender || '';
    qs('st_world').value   = prefs.world || '';
    qs('st_persona').value = prefs.persona || '';
    if (qs('st_rp'))       qs('st_rp').checked    = !!prefs.rpOn;
    if (qs('st_clichefilter')) qs('st_clichefilter').checked = !!prefs.clichéFilter;
  }

  function readForm(){
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
    if (!modal.dataset.bound) {
      modal.dataset.bound = '1';
      modal.addEventListener('click',(e)=>{ if(e.target===modal) modal.style.display='none'; });
      qs('st_close')?.addEventListener('click', ()=> modal.style.display='none');
      qs('st_reset')?.addEventListener('click', ()=>{ prefs = { ...JOY_PRESET }; savePrefs(prefs); fillForm(); });
      qs('st_save')?.addEventListener('click', ()=>{ readForm(); savePrefs(prefs); modal.style.display='none'; addMessage('*설정이 적용되었다.*', false); });
    }
  });

  // Roleplay 토글
  function syncRpToggleText(){ if (rpToggle) rpToggle.textContent = prefs.rpOn ? 'Roleplay ON' : 'Roleplay OFF'; }
  syncRpToggleText();
  rpToggle?.addEventListener('click', ()=>{
    prefs.rpOn = !prefs.rpOn; savePrefs(prefs);
    syncRpToggleText();
    addMessage(`*역할극 모드가 ${prefs.rpOn ? '활성화' : '비활성화'} 되었다.*`, false);
  });

  // *…* 삽입 버튼
  document.getElementById('actionButton')?.addEventListener('click', () => {
    const el = messageInput;
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? 0;
    const txt = el.value ?? '';
    if (s !== e) {
      el.value = txt.slice(0,s) + '*' + txt.slice(s,e) + '*' + txt.slice(e);
      el.selectionStart = s; el.selectionEnd = e + 2;
    } else {
      el.value = txt.slice(0,s) + '**' + txt.slice(s);
      el.selectionStart = el.selectionEnd = s + 1; // 가운데 커서
    }
    el.dispatchEvent(new Event('input'));
    el.focus();
  });

  // 포커스 편의
  window.addEventListener('load', ()=> messageInput?.focus());
  document.querySelector('.input-wrapper')?.addEventListener('click', ()=> messageInput?.focus());
})();
