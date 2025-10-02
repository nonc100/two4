(function () {
  const RANGE_PRESETS = {
    '12h': { tf: '1m', limit: 720 },
    '1d': { tf: '1m', limit: 1440 },
    '3d': { tf: '5m', limit: 864 },
    '1w': { tf: '15m', limit: 672 },
    '2w': { tf: '1h', limit: 336 },
  };
  const symbolInput = document.getElementById('symbolInput');
  const symbolList = document.getElementById('symbolList');
  const buttons = Array.from(document.querySelectorAll('.range-button'));
  const totalLongEl = document.querySelector('[data-total-long]');
  const totalShortEl = document.querySelector('[data-total-short]');
  const totalCountEl = document.querySelector('[data-total-count]');
  const lastPriceEl = document.querySelector('[data-last-price]');
  const updatedEl = document.querySelector('[data-updated]');
  const statusEl = document.querySelector('[data-status]');
  const emptyState = document.querySelector('[data-empty]');
  const chartEl = document.getElementById('heatmapChart');

  if (!symbolInput || !symbolList || !chartEl) {
    console.warn('[LiqHeatmap] Missing required elements.');
    return;
  }

  const chart = echarts.init(chartEl);
  const numberFormatter = new Intl.NumberFormat('en-US');
  const compactFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

  const state = {
    symbols: [],
    symbol: null,
    rangeKey: '12h',
    loading: false,
    abortController: null,
  };

  function formatNotional(value) {
    if (!Number.isFinite(value)) {
      return '--';
    }
    if (value < 1) {
      return value.toFixed(2);
    }
    return compactFormatter.format(value);
  }

  function formatUsd(value) {
    if (!Number.isFinite(value)) {
      return '--';
    }
    return `$${formatNotional(value)}`;
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) {
      return '--';
    }
    const abs = Math.abs(value);
    let digits = 2;
    if (abs < 1) {
      digits = 4;
    }
   if (abs < 0.01) {
     digits = 6;
   }
    const fixed = Number(value).toFixed(digits);
    return numberFormatter.format(Number(fixed));
  }

  function setStatus(text, tone = 'default') {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.state = tone;
  }

  function setLoading(loading) {
    state.loading = loading;
    if (loading) {
      setStatus('Loading…', 'loading');
    }
  }

  function setActiveRange(rangeKey) {
    buttons.forEach((btn) => {
      if (btn.dataset.range === rangeKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function setEmptyVisible(visible) {
    if (!emptyState) return;
    emptyState.hidden = !visible;
    if (visible) {
      chart.clear();
    }
  }

  function buildHeatmapOption(payload) {
    if (!payload || !Array.isArray(payload.timestamps) || !payload.timestamps.length) {
      return null;
    }
    const centers = payload.priceBins?.centers || [];
    const heatmapData = [];
    payload.matrix.forEach((row, rowIndex) => {
      const ts = payload.timestamps[rowIndex];
      row.forEach((value, colIndex) => {
        const price = centers[colIndex];
        if (!Number.isFinite(price)) {
          return;
        }
        heatmapData.push([ts, price, Number(value)]);
      });
    });

    const priceSeries = Array.isArray(payload.priceSeries)
      ? payload.priceSeries.filter((point) => Number.isFinite(point?.[1]))
      : [];

    const maxValue = Math.max(1, Number(payload.maxValue) || 0);
    const clip = Number(payload.meta?.clip) || 0;

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: {
        top: 24,
        left: 60,
        right: 20,
        bottom: 40,
      },
      tooltip: {
        trigger: 'item',
        axisPointer: {
          type: 'cross',
        },
        formatter: (params) => {
          if (!params || !Array.isArray(params.value)) {
            return '';
          }
          const [ts, price, logValue] = params.value;
          const approx = Math.pow(10, logValue) - 1;
          const clipped = clip > 0 ? Math.min(approx, clip) : approx;
          const priceText = formatPrice(price);
          const notionalText = formatUsd(clipped);
          const timeText = Number.isFinite(ts) ? timeFormatter.format(new Date(ts)) : '--';
          return [
            `<strong>${timeText}</strong>`,
            `가격: ${priceText}`,
            `청산 규모: ${notionalText}`,
          ].join('<br>');
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          color: '#dbe2ff',
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value',
        inverse: true,
        min: payload.priceBins?.min ?? null,
        max: payload.priceBins?.max ?? null,
        axisLabel: {
          color: '#dbe2ff',
          formatter: (value) => formatPrice(value),
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(148, 163, 255, 0.15)',
          },
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: maxValue,
        calculable: false,
        inRange: {
          color: [
            'rgba(20,16,40,0.05)',
            '#2a0d55',
            '#7a1f9c',
            '#ff3399',
            '#ffe873',
          ],
        },
      },
      series: [
        {
          type: 'heatmap',
          name: 'Liquidations',
          data: heatmapData,
          progressive: 0,
          emphasis: {
            focus: 'series',
          },
        },
        {
          type: 'line',
          name: 'Weighted Price',
          data: priceSeries,
          showSymbol: false,
          smooth: true,
          lineStyle: {
            color: '#66e4ff',
            width: 2,
            opacity: 0.9,
          },
          itemStyle: {
            color: '#66e4ff',
          },
          zlevel: 2,
        },
      ],
    };
  }

  function updateTotals(payload) {
    const totals = payload?.totals || {};
    if (totalLongEl) {
      totalLongEl.textContent = formatUsd(Number(totals.long));
    }
    if (totalShortEl) {
      totalShortEl.textContent = formatUsd(Number(totals.short));
    }
    if (totalCountEl) {
      totalCountEl.textContent = numberFormatter.format(Number(totals.count) || 0);
    }
  }

  function updateMeta(payload) {
    const lastPrice = Number(payload?.meta?.lastPrice);
    if (lastPriceEl) {
      lastPriceEl.textContent = formatPrice(lastPrice);
    }
    const timestamps = payload?.timestamps || [];
    if (updatedEl) {
      if (timestamps.length) {
        const ts = timestamps[timestamps.length - 1];
        updatedEl.textContent = timeFormatter.format(new Date(ts));
      } else {
        updatedEl.textContent = '--';
      }
    }
    if (payload?.meta?.disabled) {
      setStatus('Offline', 'error');
    } else {
      setStatus('Online', 'online');
    }
  }

  function render(payload) {
    if (!payload || !Array.isArray(payload.timestamps) || payload.timestamps.length === 0) {
      setEmptyVisible(true);
      updateTotals(payload);
      updateMeta(payload);
      return;
    }
    setEmptyVisible(false);
    const option = buildHeatmapOption(payload);
    if (option) {
      chart.setOption(option, true);
    }
    updateTotals(payload);
    updateMeta(payload);
  }

  async function loadSymbols() {
    try {
      const response = await fetch('/api/liquidations/symbols');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
      state.symbols = symbols;
      symbolList.innerHTML = '';
      symbols.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.symbol;
        const volume = Number(item.quoteVolume);
        option.textContent = volume
          ? `${item.symbol} · ${formatNotional(volume)} USDT`
          : item.symbol;
        symbolList.appendChild(option);
      });
      if (!state.symbol && symbols.length) {
        state.symbol = symbols[0].symbol;
      }
      if (state.symbol) {
        symbolInput.value = state.symbol;
        await loadData();
      }
    } catch (error) {
      console.error('[LiqHeatmap] Failed to load symbols:', error);
      setStatus('Symbol load error', 'error');
    }
  }

  async function loadData() {
    if (!state.symbol) {
      return;
    }
    const preset = RANGE_PRESETS[state.rangeKey] || RANGE_PRESETS['12h'];
    const params = new URLSearchParams({
      symbol: state.symbol,
      tf: preset.tf,
      limit: String(preset.limit),
      bins: '160',
    });

    if (state.abortController) {
      state.abortController.abort();
    }
    const controller = new AbortController();
    state.abortController = controller;

    try {
      setLoading(true);
      const response = await fetch(`/api/liquidations?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      render(payload);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('[LiqHeatmap] Failed to load data:', error);
      setStatus('Error', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleSymbolChange() {
    const value = String(symbolInput.value || '').trim().toUpperCase();
    if (!value) {
      return;
    }
    const known = state.symbols.find((item) => item.symbol === value);
    if (!known) {
      // revert to previous valid symbol
      symbolInput.value = state.symbol || '';
      return;
    }
    if (value === state.symbol) {
      return;
    }
    state.symbol = value;
    loadData();
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.range;
      if (!key || key === state.rangeKey) {
        return;
      }
      if (!RANGE_PRESETS[key]) {
        return;
      }
      state.rangeKey = key;
      setActiveRange(key);
      loadData();
    });
  });

  symbolInput.addEventListener('change', handleSymbolChange);
  symbolInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      handleSymbolChange();
      event.preventDefault();
    }
  });

  setActiveRange(state.rangeKey);
  loadSymbols();

  window.addEventListener('resize', () => {
    chart.resize();
  });
})();
