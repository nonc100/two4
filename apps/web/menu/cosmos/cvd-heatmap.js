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
    price: { '1m': 500, '5m': 500, '15m': 480, '1h': 420, '4h': 360, '1d': 365 },
    cvd: { '1m': 1440, '5m': 1440, '15m': 960, '1h': 720, '4h': 720, '1d': 365 },
    heatmap: { '1m': 720, '5m': 720, '15m': 480, '1h': 360, '4h': 360, '1d': 180 },
  };

  const syncState = {
    heatmapIndexMap: new Map(),
    heatmapTimestamps: [],
    candlestickIndexMap: new Map(),
    cvdSeriesAll: [],
  };
  let tooltipSyncBound = false;
  let isSyncingPointer = false;

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

  function fromLogValue(logValue, base = 10) {
    if (!Number.isFinite(logValue) || logValue <= 0) {
      return 0;
    }
    return Math.pow(base, logValue) - 1;
  }

  function formatLiquidity(logValue, base = 10) {
    const actual = fromLogValue(logValue, base);
    return `${formatNumber(actual)} USDT`;
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

  function computeCandlestickBounds(candles) {
    if (!Array.isArray(candles) || candles.length === 0) {
      return { min: null, max: null };
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    candles.forEach(([, , , low, high]) => {
      const lowValue = Number(low);
      const highValue = Number(high);
      if (Number.isFinite(lowValue)) {
        min = Math.min(min, lowValue);
      }
      if (Number.isFinite(highValue)) {
        max = Math.max(max, highValue);
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: null, max: null };
    }
    const range = Math.max(max - min, 0);
    const padding = range > 0 ? range * 0.05 : Math.max(Math.abs(max) * 0.01, 1);
    return {
      min: min - padding,
      max: max + padding,
    };
  }

  function toNumberArray(values) {
    if (!Array.isArray(values)) {
      return [];
    }
    return values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  function deriveBinCenters(heatmap) {
    const priceBins = heatmap?.priceBins;
    if (Array.isArray(priceBins?.centers) && priceBins.centers.length) {
      return toNumberArray(priceBins.centers);
    }
    const cols = toNumberArray(heatmap?.cols);
    if (!cols.length) {
      return [];
    }
    if (cols.length === 1) {
      return [cols[0]];
    }
    return cols.map((value, index) => {
      const next = cols[index + 1];
      if (Number.isFinite(next)) {
        return value + (next - value) / 2;
      }
      const prev = cols[index - 1];
      if (Number.isFinite(prev)) {
        return value - (value - prev) / 2;
      }
      return value;
    });
  }

  function buildCandlestickData(lineData) {
    const candles = [];
    if (!Array.isArray(lineData)) {
      return candles;
    }
    lineData.forEach(([ts, close], index) => {
      const timestamp = Number(ts);
      const closeValue = Number(close);
      if (!Number.isFinite(timestamp) || !Number.isFinite(closeValue)) {
        return;
      }
      const prevClose = index > 0 ? Number(lineData[index - 1][1]) : closeValue;
      const openValue = Number.isFinite(prevClose) ? prevClose : closeValue;
      const neighborValues = [openValue, closeValue];
      const nextClose = index < lineData.length - 1 ? Number(lineData[index + 1][1]) : null;
      if (Number.isFinite(nextClose)) {
        neighborValues.push(nextClose);
      }
      if (Number.isFinite(prevClose)) {
        neighborValues.push(prevClose);
      }
      const highValue = Math.max(...neighborValues);
      const lowValue = Math.min(...neighborValues);
      const candle = [timestamp, openValue, closeValue, lowValue, highValue];
      candles.push(candle);
    });
    return candles;
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
      cvdPoints.forEach(([ts, price]) => {
        const tsNum = Number(ts);
        const priceNum = Number(price);
        if (Number.isFinite(tsNum) && Number.isFinite(priceNum) && !lookup.has(tsNum)) {
          lookup.set(tsNum, priceNum);
        }
      });
    }
    return lookup;
  }

  function findNearestIndex(series, targetTs) {
    if (!Array.isArray(series) || !Number.isFinite(targetTs) || series.length === 0) {
      return -1;
    }
    let low = 0;
    let high = series.length - 1;
    let bestIndex = -1;
    let bestDiff = Infinity;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const ts = Number(series[mid]?.[0]);
      if (!Number.isFinite(ts)) {
        break;
      }
      const diff = Math.abs(ts - targetTs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = mid;
      }
      if (ts < targetTs) {
        low = mid + 1;
      } else if (ts > targetTs) {
        high = mid - 1;
      } else {
        break;
      }
    }
    return bestIndex;
  }

  function updateAxisPointer(chart, timestamp) {
    if (!chart || !Number.isFinite(timestamp)) return;
    chart.dispatchAction({ type: 'updateAxisPointer', xAxisIndex: 0, value: timestamp });
  }

  function ensureTooltipSync() {
    if (tooltipSyncBound) {
      return;
    }

    heatmapChart.on('updateAxisPointer', (event) => {
      const ts = Number(event?.axesInfo?.[0]?.value);
      if (!Number.isFinite(ts) || isSyncingPointer) {
        return;
      }
      isSyncingPointer = true;
      const idx = findNearestIndex(syncState.cvdSeriesAll, ts);
      if (idx !== -1) {
        cvdChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
      }
      updateAxisPointer(cvdChart, ts);
      const heatIdx = syncState.heatmapIndexMap.get(ts);
      if (Number.isInteger(heatIdx)) {
        heatmapChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: heatIdx });
      }
      const candleIdx = syncState.candlestickIndexMap.get(ts);
      if (Number.isInteger(candleIdx)) {
        heatmapChart.dispatchAction({ type: 'showTip', seriesIndex: 1, dataIndex: candleIdx });
      }
      isSyncingPointer = false;
    });

    cvdChart.on('updateAxisPointer', (event) => {
      const ts = Number(event?.axesInfo?.[0]?.value);
      if (!Number.isFinite(ts) || isSyncingPointer) {
        return;
      }
      isSyncingPointer = true;
      updateAxisPointer(heatmapChart, ts);
      const heatIdx = syncState.heatmapIndexMap.get(ts);
      if (Number.isInteger(heatIdx)) {
        heatmapChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: heatIdx });
      }
      const idx = findNearestIndex(syncState.cvdSeriesAll, ts);
      if (idx !== -1) {
        cvdChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
      }
      const candleIdx = syncState.candlestickIndexMap.get(ts);
      if (Number.isInteger(candleIdx)) {
        heatmapChart.dispatchAction({ type: 'showTip', seriesIndex: 1, dataIndex: candleIdx });
      }
      isSyncingPointer = false;
    });

    tooltipSyncBound = true;
  }

  function buildHeatmapOption(heatmap, candlesticks, priceBounds, lineSeries) {
    const timestamps = Array.isArray(heatmap?.timestamps)
      ? heatmap.timestamps
      : Array.isArray(heatmap?.rows)
      ? heatmap.rows
      : [];
    if (!heatmap || !Array.isArray(timestamps) || !Array.isArray(heatmap.matrix) || !timestamps.length) {
      return null;
    }

    const centers = deriveBinCenters(heatmap);
    const heatmapData = [];
    const timestampIndexMap = new Map();
    const logBase = Number(heatmap.meta?.scale?.logBase) || 10;
    const clipThreshold = Number(heatmap.meta?.scale?.clip) || 0;

    let computedMaxValue = 0;

    heatmap.matrix.forEach((row, rowIndex) => {
      const ts = Number(timestamps[rowIndex]);
      if (!Number.isFinite(ts) || !Array.isArray(row)) return;
      const baseIndex = heatmapData.length;
      row.forEach((value, colIndex) => {
        const price = Number(centers[colIndex]);
        const numericValue = Number(value);
        if (!Number.isFinite(price) || !Number.isFinite(numericValue)) return;
        heatmapData.push([ts, price, numericValue]);
        computedMaxValue = Math.max(computedMaxValue, numericValue);
      });
      if (!timestampIndexMap.has(ts)) {
        const centerIdx = Math.max(0, Math.min(row.length - 1, Math.floor(row.length / 2)));
        timestampIndexMap.set(ts, baseIndex + centerIdx);
      }
    });

    const rangeStart = Number(timestamps[0]);
    const rangeEnd = Number(timestamps[timestamps.length - 1]);
    const filteredCandles = Array.isArray(candlesticks)
      ? candlesticks.filter(([ts]) => {
          if (!Number.isFinite(ts)) return false;
          if (Number.isFinite(rangeStart) && ts < rangeStart) return false;
          if (Number.isFinite(rangeEnd) && ts > rangeEnd) return false;
          return true;
        })
      : [];

    const candlestickIndexMap = new Map();
    filteredCandles.forEach((candle, index) => {
      const tsValue = Number(candle?.[0]);
      if (Number.isFinite(tsValue) && !candlestickIndexMap.has(tsValue)) {
        candlestickIndexMap.set(tsValue, index);
      }
    });

    const maxValue = Math.max(Number(heatmap.maxValue) || 0, computedMaxValue, 1);
    const minPrice = Number.isFinite(priceBounds?.min) ? priceBounds.min : null;
    const maxPrice = Number.isFinite(priceBounds?.max) ? priceBounds.max : null;

    const hasCandles = Array.isArray(filteredCandles) && filteredCandles.length > 0;
    const priceLine = Array.isArray(lineSeries)
      ? lineSeries
          .filter(([ts, close]) => Number.isFinite(ts) && Number.isFinite(close))
          .map(([ts, close]) => [Number(ts), Number(close)])
      : [];

    const option = {
      backgroundColor: 'transparent',
      grid: { left: 110, right: 90, top: 70, bottom: 60 },
      tooltip: {
        trigger: 'item',
        borderColor: '#1b3455',
        backgroundColor: 'rgba(10, 20, 40, 0.9)',
        borderWidth: 1,
        formatter(params) {
          if (!params) return '';
          if (params.seriesType === 'candlestick') {
            const value = Array.isArray(params.value) ? params.value : [];
            const ts = Number(value[0] ?? params.data?.[0]);
            const open = Number(value[1]);
            const close = Number(value[2]);
            const low = Number(value[3]);
            const high = Number(value[4]);
            const title = Number.isFinite(ts) ? formatTimestampLong(ts) : params.name || '';
            return [
              `<div class="tooltip-title">${title}</div>`,
              `<div>Open&nbsp;<strong>${formatCurrency(open)}</strong></div>`,
              `<div>High&nbsp;<strong>${formatCurrency(high)}</strong></div>`,
              `<div>Low&nbsp;<strong>${formatCurrency(low)}</strong></div>`,
              `<div>Close&nbsp;<strong>${formatCurrency(close)}</strong></div>`,
            ]
              .filter(Boolean)
              .join('');
          }
          if (!params.value) return '';
          const [ts, price, value] = params.value;
          const liquidity = formatLiquidity(value, logBase);
          const clipped = clipThreshold > 0 && fromLogValue(value, logBase) >= clipThreshold;
          const badge = clipped
            ? '<span style="margin-left:8px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.12);color:#fbbf24;font-size:11px;letter-spacing:0.05em;">CLIPPED</span>'
            : '';
          return [
            `<div class="tooltip-title">${formatTimestampLong(ts)}</div>`,
            `<div>Price&nbsp;<strong>${formatCurrency(price)}</strong></div>`,
            `<div>Liquidity&nbsp;<strong>${liquidity}</strong>${badge}</div>`,
          ].join('');
        },
      },
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: 'vertical',
        left: 36,
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
        formatter: (value) => formatLiquidity(value, logBase),
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
        ...(hasCandles
          ? [
              {
                id: 'price-candles',
                name: 'Price',
                type: 'candlestick',
                encode: { x: 0, y: [1, 2, 3, 4] },
                data: filteredCandles,
                itemStyle: {
                  color: 'rgba(34, 211, 238, 0.85)',
                  color0: 'rgba(248, 113, 113, 0.85)',
                  borderColor: '#22d3ee',
                  borderColor0: '#f87171',
                },
                emphasis: { focus: 'series' },
                barWidth: '65%',
                zlevel: 3,
              },
            ]
          : []),
        ...(priceLine.length
          ? [
              {
                id: 'price-line',
                name: 'Price Close',
                type: 'line',
                data: priceLine,
                smooth: true,
                showSymbol: false,
                lineStyle: {
                  color: 'rgba(255, 255, 255, 0.8)',
                  width: 1.5,
                },
                emphasis: { focus: 'series' },
                zlevel: 4,
              },
            ]
          : []),
      ],
      textStyle: {
        fontFamily: 'Rajdhani, sans-serif',
      },
    };

    return { option, timestampIndexMap, candlestickIndexMap };
  }

  function buildCvdOption(cvd, priceLookup) {
    if (!cvd || !cvd.series || !Array.isArray(cvd.buckets)) {
      return null;
    }

    const legendNames = [];
    const series = [];

    cvd.buckets.forEach((bucket) => {
      const key = bucket.key;
      const name = bucket.label || key;
      legendNames.push(name);
      const rawSeries = Array.isArray(cvd.series?.[key]) ? cvd.series[key] : [];
      const data = rawSeries
        .map(([ts, val]) => [Number(ts), Number(val)])
        .filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val));
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
        position: 'right',
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
      const heatmapTimes = Array.isArray(heatmap?.timestamps)
        ? heatmap.timestamps
        : Array.isArray(heatmap?.rows)
        ? heatmap.rows
        : [];
      if (heatmapTimes.length) {
        timestamps.push(heatmapTimes[heatmapTimes.length - 1]);
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
        .map(([ts, close]) => [Number(ts), Number(close)])
        .filter(([ts, val]) => Number.isFinite(ts) && Number.isFinite(val))
        .sort((a, b) => a[0] - b[0]);
      const candles = buildCandlestickData(lineData);
      const priceBounds = computeCandlestickBounds(candles);
      const heatmapOptionData = buildHeatmapOption(heatmap, candles, priceBounds, lineData);
      const cvdPriceSeries = Array.isArray(cvd?.price) ? cvd.price : [];
      const priceLookup = buildPriceLookup(lineData, cvdPriceSeries);
      const cvdOption = buildCvdOption(cvd, priceLookup);

      if (heatmapOptionData && heatmapOptionData.option) {
        heatmapChart.setOption(heatmapOptionData.option, true);
        chartState.heatmapHasData = true;
        setEmptyVisible(heatmapEmpty, false);
        syncState.heatmapIndexMap = heatmapOptionData.timestampIndexMap || new Map();
        const heatmapTimestamps = Array.isArray(heatmap?.timestamps)
          ? heatmap.timestamps
          : Array.isArray(heatmap?.rows)
          ? heatmap.rows
          : [];
        syncState.heatmapTimestamps = heatmapTimestamps;
        syncState.candlestickIndexMap = heatmapOptionData.candlestickIndexMap || new Map();
      } else {
        heatmapChart.clear();
        chartState.heatmapHasData = false;
        setEmptyVisible(heatmapEmpty, true);
        syncState.heatmapIndexMap = new Map();
        syncState.heatmapTimestamps = [];
        syncState.candlestickIndexMap = new Map();
      }

      if (cvdOption) {
        cvdChart.setOption(cvdOption, true);
        chartState.cvdHasData = true;
        setEmptyVisible(cvdEmpty, false);
        syncState.cvdSeriesAll = Array.isArray(cvd?.series?.all) ? cvd.series.all : [];
      } else {
        cvdChart.clear();
        chartState.cvdHasData = false;
        setEmptyVisible(cvdEmpty, true);
        syncState.cvdSeriesAll = [];
      }

      updateMetadata({ cvd, heatmap, price, lineData });
      setStatus('online', 'Online');
      ensureTooltipSync();
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
