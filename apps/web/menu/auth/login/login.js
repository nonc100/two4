/* Two.4 Planet Login – Interactions & Effects */
/* global window, document */

(function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // ===== Starfield =====
  const starCanvas = $('#starfield');
  const ctx = starCanvas.getContext('2d', { alpha: true });
  let stars = [];
  let W = 0, H = 0;

  function resize() {
    W = starCanvas.width = window.innerWidth;
    H = starCanvas.height = window.innerHeight;
    spawnStars();
  }

  function spawnStars() {
    const count = Math.min(220, Math.floor((W * H) / 18000)); // density by area
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 0.7 + 0.3,        // depth
      r: Math.random() * 1.4 + 0.4,        // radius
      vx: (Math.random() - 0.5) * 0.05,    // slight drift
      vy: (Math.random() - 0.5) * 0.05,
      tw: Math.random() * 2 * Math.PI
    }));
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.x += s.vx; s.y += s.vy;
      if (s.x < -5) s.x = W + 5; if (s.x > W + 5) s.x = -5;
      if (s.y < -5) s.y = H + 5; if (s.y > H + 5) s.y = -5;
      // twinkle
      const twinkle = 0.6 + 0.4 * Math.sin(t * 0.002 + s.tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * twinkle, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * s.z})`);
      g.addColorStop(1, `rgba(103,232,249,${0.18 * s.z})`);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  let rafId = 0;
  function loop(ts) {
    drawStars(ts || 0);
    rafId = requestAnimationFrame(loop);
  }

  // ===== Candlestick stream (subtle) =====
  function createPriceIndicator() {
    const variants = [
      { text: '+1.2%', cls: 'up' },
      { text: '-0.8%', cls: 'down' },
      { text: '+2.5%', cls: 'up' },
      { text: '-1.5%', cls: 'down' },
      { text: '+0.3%', cls: 'up' },
    ];
    const v = variants[Math.floor(Math.random() * variants.length)];
    const el = document.createElement('div');
    el.className = `price ${v.cls}`;
    el.textContent = v.text;
    el.style.top = Math.random() * 80 + 10 + '%';
    el.style.left = Math.random() * 80 + 10 + '%';
    el.style.animationDelay = Math.random() * 1.6 + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 6500);
  }

  // ===== Form logic =====
  const form = $('#loginForm');
  const loginBtn = $('#loginBtn');

  function toast(msg) {
    // minimalist toast using alert for now
    alert(msg);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const username = $('#username').value.trim();
    const password = $('#password').value;

    if (!username || !password) {
      toast('⚠️ USERNAME AND PASSWORD REQUIRED');
      return;
    }

    // loading state
    loginBtn.disabled = true;
    loginBtn.textContent = 'AUTHENTICATING…';

    // Simulate auth; replace with real /api call when ready
    setTimeout(() => {
      loginBtn.textContent = 'AUTHENTICATED ✓';
      loginBtn.disabled = false;
      toast('🔓 LOGIN SUCCESS! WELCOME ' + username.toUpperCase());

      // Navigate after success (adjust target as needed)
      // window.location.href = '/menu/auth/mypage/';
    }, 1400);
  }

  // ===== Social handlers =====
  function loginWithKakao() {
    toast('🔄 INITIATING KAKAO AUTHENTICATION…');
    // window.location.href = '/api/auth/kakao';
  }
  function loginWithGoogle() {
    toast('🔄 INITIATING GOOGLE AUTHENTICATION…');
    // window.location.href = '/api/auth/google';
  }

  // ===== Glitch hue shift (rare) =====
  function randomHueGlitch() {
    if (Math.random() < 0.10) {
      document.body.style.filter = 'hue-rotate(180deg)';
      setTimeout(() => { document.body.style.filter = 'none'; }, 120);
    }
  }

  // ===== Init =====
  window.addEventListener('load', () => {
    resize();
    loop(0);

    // periodic ambience
    setInterval(createPriceIndicator, 8000);
    setInterval(randomHueGlitch, 5200);
    window.addEventListener('resize', resize);

    // form
    form.addEventListener('submit', handleSubmit);

    // social
    $('#kakaoBtn').addEventListener('click', loginWithKakao);
    $('#googleBtn').addEventListener('click', loginWithGoogle);

    // keyboard: Ctrl+Enter to submit
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') form.dispatchEvent(new Event('submit'));
    });
  });

  // cleanup if needed (not used here, reserved for SPA mounts)
  window.addEventListener('beforeunload', () => cancelAnimationFrame(rafId));
})();
