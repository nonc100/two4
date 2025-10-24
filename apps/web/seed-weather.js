(() => {
  const REFRESH_INTERVAL = 5 * 60 * 1000;
  const ENDPOINT = '/api/seed-weather?symbol=BTCUSDT';

  const SKY_ICONS = {
    sunny: '☀️',
    clear: '🌤️',
    breeze: '🌬️',
    overcast: '☁️',
    storm: '⛈️',
    typhoon: '🌀',
  };

  const SKY_LABELS = {
    sunny: '쾌청',
    clear: '맑음',
    breeze: '산들',
    overcast: '흐림',
    storm: '폭풍',
    typhoon: '태풍',
  };

  const VOL_LABELS = {
    low: '낮음',
    normal: '보통',
    high: '높음',
    extreme: '극단',
  };

  const TREND_LABELS = {
    up: '상승',
    flat: '중립',
    down: '하락',
  };

  const CVD_LABELS = {
    whale_push: '고래 매수',
    whale_dump: '고래 매도',
    retail_push: '개미 매수',
    mixed: '혼조',
    neutral: '중립',
  };

  const root = document.getElementById('seed-weather-root');
  if (!root) return;

  let refreshTimer = null;
  let controller = null;
  let hasRendered = false;
  let lastData = null;

  function getSkyIcon(sky) {
    return SKY_ICONS[sky] || '✨';
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} 업데이트`;
    } catch (_) {
      return '';
    }
  }

  function formatBreadth(value) {
    if (typeof value !== 'number') return '—';
    return `${Math.round(value * 100)}%`;
  }

  function metric(label, value) {
    return `
      <div class="seed-weather-metric">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function renderHeadline(data, symbol, asOf) {
    const forecast = data.forecast || {};
    return `
      <article class="seed-weather-card seed-weather-headline" data-action="${forecast.actionKey || ''}">
        <header class="seed-weather-card-header">
          <div class="seed-weather-icon" data-sky="${data.sky}">${getSkyIcon(data.sky)}</div>
          <div>
            <div class="seed-weather-card-title">${symbol} 헤드라인</div>
            <div class="seed-weather-updated">${formatTime(asOf)}</div>
          </div>
        </header>
        <div class="seed-weather-forecast">${forecast.narrative || '데이터를 기다리는 중입니다.'}</div>
        <div class="seed-weather-action">${forecast.action || ''}</div>
        <div class="seed-weather-metrics">
          ${metric('Sky', SKY_LABELS[data.sky] || data.sky || '—')}
          ${metric('Breadth', formatBreadth(data.breadth))}
          ${metric('Volatility', VOL_LABELS[data.volatility] || data.volatility || '—')}
          ${metric('Trend', TREND_LABELS[data.trend4h] || data.trend4h || '—')}
          ${metric('CVD', CVD_LABELS[data.cvdSignal] || data.cvdSignal || '—')}
        </div>
      </article>
    `;
  }

  function renderSectorCard(sector) {
    const forecast = sector.forecast || {};
    return `
      <article class="seed-weather-card" data-action="${forecast.actionKey || ''}">
        <header class="seed-weather-card-header">
          <div class="seed-weather-icon" data-sky="${sector.sky}">${getSkyIcon(sector.sky)}</div>
          <div>
            <div class="seed-weather-card-title">${sector.name}</div>
            <div class="seed-weather-updated">Sky ${SKY_LABELS[sector.sky] || sector.sky || '—'}</div>
          </div>
        </header>
        <div class="seed-weather-forecast">${forecast.narrative || '관측 중...'}</div>
        <div class="seed-weather-action">${forecast.action || ''}</div>
        <div class="seed-weather-metrics">
          ${metric('Breadth', formatBreadth(sector.breadth))}
          ${metric('Volatility', VOL_LABELS[sector.volatility] || sector.volatility || '—')}
          ${metric('Trend', TREND_LABELS[sector.trend4h] || sector.trend4h || '—')}
          ${metric('CVD', CVD_LABELS[sector.cvdSignal] || sector.cvdSignal || '—')}
        </div>
      </article>
    `;
  }

  function renderWeather(data) {
    if (!data) {
      root.innerHTML = `
        <div class="seed-weather-frame">
          <div class="seed-weather-scroll">
            <div class="seed-weather-empty">기상 데이터를 불러오지 못했습니다.</div>
          </div>
        </div>
      `;
      hasRendered = true;
      lastData = null;
      return;
    }

    const sectors = Array.isArray(data.sectors) ? data.sectors : [];

    root.innerHTML = `
      <div class="seed-weather-frame">
        <div class="seed-weather-scroll">
          <div class="seed-weather-layout">
            ${renderHeadline(data.headline || {}, data.symbol || 'BTCUSDT', data.asOf)}
            <div class="seed-weather-grid">
              ${sectors.map(renderSectorCard).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    hasRendered = true;
    lastData = data;
  }

  function renderSkeleton() {
    const skeletonCard = `
      <article class="seed-weather-card seed-weather-skeleton">
        <div style="height:64px"></div>
        <div style="height:48px"></div>
        <div style="height:88px"></div>
      </article>
    `;

    root.innerHTML = `
      <div class="seed-weather-frame">
        <div class="seed-weather-scroll">
          <div class="seed-weather-layout">
            <article class="seed-weather-card seed-weather-headline seed-weather-skeleton">
              <div style="height:64px"></div>
              <div style="height:60px"></div>
              <div style="height:100px"></div>
            </article>
            <div class="seed-weather-grid">
              ${Array.from({ length: 5 }).map(() => skeletonCard).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function showToast(message) {
    if (!message) return;
    const toast = document.createElement('div');
    toast.className = 'seed-weather-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4600);
  }

  function scheduleNext() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      loadWeather();
    }, REFRESH_INTERVAL);
  }

  async function loadWeather() {
    if (!root) return;

    if (!hasRendered) {
      renderSkeleton();
    }

    if (controller) {
      controller.abort();
    }
    controller = new AbortController();

    try {
      const response = await fetch(ENDPOINT, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      renderWeather(data);
    } catch (error) {
      console.error('[SeedWeather] Failed to load:', error);
      if (lastData) {
        showToast('Seed AI 날씨 갱신이 지연 중입니다. 마지막 데이터를 유지합니다.');
      } else {
        renderWeather(null);
        showToast('Seed AI 날씨를 불러오지 못했어요. 잠시 후 다시 시도합니다.');
      }
    } finally {
      scheduleNext();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadWeather();
    }
  });

  loadWeather();
})();
