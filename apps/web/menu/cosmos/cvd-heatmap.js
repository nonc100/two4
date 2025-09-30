(function () {
  'use strict';

  const symbol = 'BTCUSDT';
  const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
  const STORAGE_KEY = 'cosmic:timeframe';

  const heatmapEl = document.getElementById('heatmapChart');
  const cvdEl = document.getElementById('cvdChart');
  const statusEl = document.querySelector('[data-status]');
  const updatedEl = document.querySelector('[data-updated]');
  const priceEl = document.querySelector('[data-price]');
  const symbolEl = document.querySelector('[data-symbol]');
  const timeframeButtons = Array.from(document.querySelectorAll('.tf-button'));

  if (symbolEl) {
    symbolEl.textContent = symbol;
  }

  if (!heatmapEl || !cvdEl) {
    console.error('Dashboard elements are missing.');
    return;
  }

  const heatmapChart = echarts.init(heatmapEl);
  const cvdChart = echarts.init(cvdEl);
  echarts.connect([heatmapChart, cvdChart]);

  const heatmapSkeleton = createSkeletonOverlay(heatmapEl);
  const cvdSkeleton = createSkeletonOverlay(cvdEl);
  const heatmapEmpty = createEmptyState(heatmapEl);
  const cvdEmpty = createEmptyState(cvdEl);

  const bucketColors = {
    all: '#00f5ff',
    bucket0: '#22d3ee',
    bucket1: '#8b5cf6',
    bucket2: '#ec4899',
    bucket3: '#facc15',
    bucket4: '#fb7185',
  };

  const LIMITS = {
    price: { '1m': 1440, '5m': 1440, '15m': 960, '1h': 720, '4h': 720, '1d': 365 },
    cvd: { '1m': 1440, '5m': 1440, '15m': 960, '1h': 720, '4h': 720, '1d': 365 },
    heatmap: { '1m': 720, '5m': 720, '15m': 480, '1h': 360, '4h': 360, '1d': 180 },
  };

  const storedTimeframe = (() => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value && SUPPORTED_TIMEFRAMES.includes(value)) {
        return value;
      }
    } catch (error) {
      console.warn('Failed to read timeframe from storage:', error);
    }
    return '1m';
  })();

  let currentTimeframe = storedTimeframe;
  updateTimeframeButtons();

  timeframeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tf = button.dataset.tf;
      if (!tf || tf === currentTimeframe || !SUPPORTED_TIMEFRAMES.includes(tf)) {
        return;
      }
      currentTimeframe = tf;
      try {
        localStorage.setItem(STORAGE_KEY, currentTimeframe);
      } catch (error) {
        console.warn('Failed to persist timeframe:', error);
      }
      updateTimeframeButtons();
      loadData({ isRefresh: false, showSkeleton: true });
    });
  });

  function updateTimeframeButtons() {
    timeframeButtons.forEach((button) => {
      const tf = button.dataset.tf;
      if (tf === currentTimeframe) {
        button.classList.add('is-active');
        button.setAttribute('aria-pressed', 'true');
      } else {
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', 'false');
      }
    });
  }

  function createSkeletonOverlay(container) {
    const overlay = document.createElement('div');
    overlay.className = 'chart-skeleton';
    container.appendChild(overlay);
    return overlay;
  }

  function createEmptyState(container) {
    const badge = document.createElement('div');
    badge.className = 'chart-empty';
    badge.textContent = 'No data yet';
    container.appendChild(badge);
    return badge;
  }

  function setStatus(state, label) {
    if (!statusEl) return;
    statusEl.dataset.statusState = state;
    statusEl.textContent = label;
  }

  function setSkeletonVisible(target, visible) {
    if (!target) return;
    target.style.display = visible ? 'flex' : 'none';
  }

  function setEmptyVisible(target, visible) {
    if (!target) return;
    target.style.display = visible ? 'flex' : 'none';
  }

  function formatNumber(value) {
    if (value == null || Number.isNaN(value)) {
      return '--';
    }
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    if (abs >= 1) return value.toFixed(2);
    return value.toFixed(4);
  }

  function formatCurrency(value) {
    if (value == null || Number.isNaN(value)) {
      return '--';
    }
    return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }

  function formatTimestamp(ts) {
    if (!Number.isFinite(ts)) return '--';
    const date = new Date(ts);
    return `${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  function formatTimestampLong(ts) {
    if (!Number.isFinite(ts)) return '--';
    const date = new Date(ts);
    return `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date
      .getHours()
      .toString()
      .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  function pickLimit(group, timeframe, fallback) {
    return group[timeframe] || fallback;
  }

  function computePriceBounds(lineData) {
    if (!Array.isArray(lineData) || lineData.length === 0) {
      return { min: null, max: null };
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    lineData.forEach(([, price]) => {
      if (!Number.isFinite(price)) return;
      min = Math.min(min, price);
      max = Math.max(max, price);
    });
    return {
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }

  function buildPriceLookup(lineData, cvdPoints) {
    const lookup = new Map();
    if (Array.isArray(lineData)) {
      lineData.forEach(([ts, close]) => {
        if (Number.isFinite(ts) && Number.isFinite(close)) {
          lookup.set(ts, close);
        }
      });
    }
    if (Array.isArray(cvdPoints)) {
      cvdPoints.forEach((point) => {
        const ts = Number(point?.timestamp);
        const price = Number(point?.price);
        if (Number.isFinite(ts) && Number.isFinite(price) && !lookup.has(ts)) {
          lookup.set(ts, price);
        }
      });
    }
    return lookup;
  }

  function buildHeatmapOption(heatmap, lineData, priceBounds) {
    if (
      !heatmap ||
      !Array.isArray(heatmap.timestamps) ||
      !Array.isArray(heatmap.matrix) ||
      heatmap.timestamps.length === 0 ||
      heatmap.matrix.length === 0
    ) {
      return null;
    }

    const centers = (heatmap.priceBins && heatmap.priceBins.centers) || [];
    const heatmapData = [];

    heatmap.matrix.forEach((row, rowIndex) => {
      const ts = heatmap.timestamps[rowIndex];
      if (!Number.isFinite(ts) || !Array.isArray(row)) return;
      row.forEach((value, colIndex) => {
        const price = centers[colIndex];
        if (!Number.isFinite(price) || !Number.isFinite(value)) return;
        heatmapData.push([ts, price, Number(value)]);
      });
    });

    const rangeStart = heatmap.timestamps[0];
    const rangeEnd = heatmap.timestamps[heatmap.timestamps.length - 1];
    const filteredLine = Array.isArray(lineData)
      ? lineData.filter(([ts]) => {
          if (!Number.isFinite(ts)) return false;
          if (Number.isFinite(rangeStart) && ts < rangeStart) return false;
          if (Number.isFinite(rangeEnd) && ts > rangeEnd) return false;
          return true;
        })
      : [];

    const maxValue = Math.max(heatmap.maxValue || 0, 1);
    const minPrice = Number.isFinite(priceBounds?.min) ? priceBounds.min : null;
    const maxPrice = Number.isFinite(priceBounds?.max) ? priceBounds.max : null;

    return {
      backgroundColor: 'transparent',
      grid: { left: 70, right: 60, top: 80, bottom: 60 },
      tooltip: {
        trigger: 'item',
        borderColor: '#1b3455',
        backgroundColor: 'rgba(10, 20, 40, 0.9)',
        borderWidth: 1,
        formatter(params) {
          if (!params || !params.value) return '';
          const [ts, price, value] = params.value;
          return [
            `<div class="tooltip-title">${formatTimestampLong(ts)}</div>`,
            `<div>Price&nbsp;<strong>${formatCurrency(price)}</strong></div>`,
            `<div>Liquidity&nbsp;<strong>${formatNumber(value)} USDT</strong></div>`,
          ].join('');
        },
      },
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'vertical',
        right: 18,
        top: 'center',
        text: ['HIGH', 'LOW'],
        itemHeight: 200,
        textStyle: {
          color: '#d0e4ff',
          fontFamily: 'Rajdhani, sans-serif',
          letterSpacing: 3,
        },
        inRange: {
          color: ['#140020', '#31004c', '#5a007a', '#9c0060', '#ff3d00', '#ffe45c'],
        },
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLabel: {
          color: '#7dd3fc',
          fontSize: 12,
        },
        axisLine: {
          lineStyle: { color: 'rgba(70, 110, 150, 0.5)' },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        position: 'right',
        scale: true,
        min: (value) => (minPrice != null ? minPrice : value.min),
        max: (value) => (maxPrice != null ? maxPrice : value.max),
        axisLabel: {
          color: '#a5b4fc',
          formatter: (value) => formatCurrency(value),
        },
        axisLine: {
          lineStyle: { color: 'rgba(70, 110, 150, 0.45)' },
        },
        splitLine: {
          lineStyle: { color: 'rgba(90, 118, 180, 0.18)', type: 'dashed' },
        },
      },
      axisPointer: {
        link: [{ xAxisIndex: [0] }],
        label: {
          backgroundColor: 'rgba(18, 32, 64, 0.8)',
          borderColor: '#00f5ff',
          borderWidth: 1,
        },
      },
      dataZoom: [
        { type: 'inside', zoomLock: false },
        {
          type: 'slider',
          height: 20,
          bottom: 10,
          backgroundColor: 'rgba(12, 22, 42, 0.6)',
          borderColor: 'rgba(0, 255, 255, 0.2)',
          fillerColor: 'rgba(0, 255, 255, 0.25)',
          handleStyle: { color: '#22d3ee' },
          textStyle: { color: '#9bd9ff' },
        },
      ],
      series: [
        {
          name: 'Liquidity Heatmap',
          type: 'heatmap',
          data: heatmapData,
          progressive: 0,
          emphasis: { itemStyle: { borderColor: '#00f5ff', borderWidth: 1 } },
        },
        {
          id: 'price',
          name: 'Price',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 2, color: '#00bfff' },
          emphasis: { focus: 'series' },
          data: filteredLine,
          tooltip: { show: false },
          zlevel: 3,
        },
      ],
      textStyle: {
        fontFamily: 'Rajdhani, sans-serif',
      },
    };
  }

  function buildCvdOption(cvd, priceLookup) {
    if (!cvd || !Array.isArray(cvd.points) || !Array.isArray(cvd.buckets)) {
      return null;
    }

    const legendNames = [];
    const series = [];

    cvd.buckets.forEach((bucket) => {
      const key = bucket.key;
      const name = bucket.label || key;
      legendNames.push(name);
      const data = cvd.points
        .filter((point) => point && Number.isFinite(point.timestamp))
        .map((point) => [point.timestamp, point.values ? Number(point.values[key]) : 0]);
      series.push({
        name,
        type: 'line',
        data,
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: key === 'all' ? 2.8 : 2.2,
          color: bucketColors[key] || '#60a5fa',
        },
        emphasis: {
          focus: 'series',
        },
        areaStyle: key === 'all'
          ? {
              color: 'rgba(0, 245, 255, 0.08)',
            }
          : undefined,
      });
    });

    return {
      backgroundColor: 'transparent',
      legend: {
        top: 16,
        textStyle: { color: '#dbe7ff', fontSize: 13, fontFamily: 'Rajdhani, sans-serif' },
        icon: 'circle',
        itemWidth: 14,
        itemHeight: 14,
        data: legendNames,
      },
      grid: { left: 70, right: 30, top: 80, bottom: 60 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        borderColor: '#1b3455',
        backgroundColor: 'rgba(10, 20, 40, 0.9)',
        formatter(params) {
          if (!Array.isArray(params) || params.length === 0) {
            return '';
          }
          const first = params[0];
          const ts = Array.isArray(first.value) ? first.value[0] : first.axisValue;
          const timeLabel = formatTimestampLong(ts);
          const price = priceLookup.get(ts);
          const rows = params
            .map((p) => {
              const val = Array.isArray(p.value) ? p.value[1] : p.value;
              const color = p.color || '#9ca3af';
              return `<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;"></span>${p.seriesName}: <strong>${formatNumber(val)} USDT</strong></div>`;
            })
            .join('');
          const priceRow = price != null ? `<div>Price: <strong>${formatCurrency(price)}</strong></div>` : '';
          return [`<div class="tooltip-title">${timeLabel}</div>`, priceRow, rows].filter(Boolean).join('');
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { color: '#9eb5ff', fontSize: 12 },
        axisLine: { lineStyle: { color: 'rgba(70, 110, 150, 0.4)' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#c7d2fe',
          formatter: (value) => `${formatNumber(value)} USDT`,
        },
        axisLine: { lineStyle: { color: 'rgba(70, 110, 150, 0.4)' } },
        splitLine: { lineStyle: { color: 'rgba(90, 118, 180, 0.18)', type: 'dashed' } },
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: 'rgba(18, 32, 64, 0.8)', borderColor: '#00f5ff', borderWidth: 1 },
      },
      dataZoom: [
        { type: 'inside' },
        {
          type: 'slider',
          height: 20,
          bottom: 10,
          backgroundColor: 'rgba(12, 22, 42, 0.6)',
          borderColor: 'rgba(0, 255, 255, 0.2)',
          fillerColor: 'rgba(131, 24, 255, 0.25)',
          handleStyle: { color: '#f472b6' },
          textStyle: { color: '#f1c4ff' },
        },
      ],
      series,
      textStyle: {
        fontFamily: 'Rajdhani, sans-serif',
      },
    };
  }

  function updateMetadata({ cvd, heatmap, price, lineData }) {
    if (priceEl) {
      let current = null;
      if (price && Number.isFinite(price.meta?.lastPrice)) {
        current = price.meta.lastPrice;
      } else if (Array.isArray(lineData) && lineData.length) {
        current = lineData[lineData.length - 1][1];
      } else if (heatmap && Number.isFinite(heatmap.lastPrice)) {
        current = heatmap.lastPrice;
      }
      priceEl.textContent = current != null ? formatCurrency(current) : '--';
    }

    if (updatedEl) {
      const timestamps = [];
      if (cvd && Number.isFinite(cvd.meta?.lastTimestamp)) {
        timestamps.push(cvd.meta.lastTimestamp);
      }
      if (Array.isArray(heatmap?.timestamps) && heatmap.timestamps.length) {
        timestamps.push(heatmap.timestamps[heatmap.timestamps.length - 1]);
      }
      if (Array.isArray(lineData) && lineData.length) {
        timestamps.push(lineData[lineData.length - 1][0]);
      }
      const latest = timestamps.length ? Math.max(...timestamps) : null;
      updatedEl.textContent = latest ? formatTimestampLong(latest) : '--';
    }
  }

  const chartState = {
    heatmapHasData: false,
    cvdHasData: false,
  };

  let requestToken = 0;

  async function loadData({ isRefresh = false, showSkeleton = false } = {}) {
    const tf = currentTimeframe;
    const token = ++requestToken;

    if (showSkeleton || !chartState.heatmapHasData || !chartState.cvdHasData) {
      setSkeletonVisible(heatmapSkeleton, true);
      setSkeletonVisible(cvdSkeleton, true);
    }
    setEmptyVisible(heatmapEmpty, false);
    setEmptyVisible(cvdEmpty, false);
    setStatus('loading', isRefresh ? 'Refreshing…' : 'Loading…');

    try {
      const [heatmap, cvd, price] = await Promise.all([
        fetchJson(
          `/api/heatmap?symbol=${symbol}&tf=${tf}&bins=120&limit=${pickLimit(LIMITS.heatmap, tf, 720)}`
        ),
        fetchJson(
          `/api/cvd?symbol=${symbol}&tf=${tf}&limit=${pickLimit(LIMITS.cvd, tf, 1440)}`
        ),
        fetchJson(
          `/api/price?symbol=${symbol}&tf=${tf}&limit=${pickLimit(LIMITS.price, tf, 1440)}`
        ),
      ]);

      if (token !== requestToken) {
        return;
      }

      const prices = Array.isArray(price?.prices) ? price.prices : [];
      const lineData = prices
        .map((entry) => [Number(entry.t), Number(entry.close)])
        .filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val))
        .sort((a, b) => a[0] - b[0]);
      const priceBounds = computePriceBounds(lineData);
      const heatmapOption = buildHeatmapOption(heatmap, lineData, priceBounds);
      const priceLookup = buildPriceLookup(lineData, cvd?.points);
      const cvdOption = buildCvdOption(cvd, priceLookup);

      if (heatmapOption) {
        heatmapChart.setOption(heatmapOption, true);
        chartState.heatmapHasData = true;
        setEmptyVisible(heatmapEmpty, false);
      } else {
        heatmapChart.clear();
        chartState.heatmapHasData = false;
        setEmptyVisible(heatmapEmpty, true);
      }

      if (cvdOption) {
        cvdChart.setOption(cvdOption, true);
        chartState.cvdHasData = true;
        setEmptyVisible(cvdEmpty, false);
      } else {
        cvdChart.clear();
        chartState.cvdHasData = false;
        setEmptyVisible(cvdEmpty, true);
      }

      updateMetadata({ cvd, heatmap, price, lineData });
      setStatus('online', 'Online');
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      console.error('Failed to refresh dashboard:', error);
      setStatus('error', 'Error');
      if (!chartState.heatmapHasData) {
        setEmptyVisible(heatmapEmpty, true);
      }
      if (!chartState.cvdHasData) {
        setEmptyVisible(cvdEmpty, true);
      }
    } finally {
      if (token !== requestToken) {
        return;
      }
      setSkeletonVisible(heatmapSkeleton, false);
      setSkeletonVisible(cvdSkeleton, false);
    }
  }

  window.addEventListener('resize', () => {
    heatmapChart.resize();
    cvdChart.resize();
  });

  loadData({ isRefresh: false, showSkeleton: true });
  setInterval(() => loadData({ isRefresh: true, showSkeleton: false }), 60_000);
})();
