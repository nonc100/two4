(function () {
  const RANGE_PRESETS = {
    '12h': { tf: '1m', limit: 720 },
    '1d': { tf: '1m', limit: 1440 },
    '3d': { tf: '5m', limit: 864 },
    '1w': { tf: '15m', limit: 672 },
    '2w': { tf: '1h', limit: 336 },
  };
  const TIMEFRAME_TO_MS = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
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

  const overlayState = {
    container: null,
    chart: null,
    series: null,
    shapesRoot: null,
    candles: [],
    fvgs: [],
    obs: [],
    bucketMs: 60_000,
    volumeBuckets: new Map(),
  };
  let overlayRaf = null;
  let overlayObserver = null;

  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'overlay-chart';
  const overlayShapes = document.createElement('div');
  overlayShapes.className = 'overlay-primitives';
  overlayContainer.appendChild(overlayShapes);
  chartEl.appendChild(overlayContainer);
  overlayState.container = overlayContainer;
  overlayState.shapesRoot = overlayShapes;

  initOverlayChart();

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

  function timeframeToMs(tf) {
    return TIMEFRAME_TO_MS[tf] || 60_000;
  }

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

  function clearOverlay() {
    if (overlayState.series) {
      try {
        overlayState.series.setData([]);
      } catch (_) {
        // ignore rendering errors during disposal
      }
    }
    overlayState.candles = [];
    overlayState.fvgs = [];
    overlayState.obs = [];
    overlayState.volumeBuckets = new Map();
    if (overlayState.shapesRoot) {
      overlayState.shapesRoot.innerHTML = '';
    }
  }

  function setEmptyVisible(visible) {
    if (!emptyState) return;
    emptyState.hidden = !visible;
    if (visible) {
      chart.clear();
      clearOverlay();
    }
  }

  function initOverlayChart(retry = 0) {
    if (!overlayState.container) {
      return;
    }
    if (overlayState.chart) {
      return;
    }
    const LW = window.LightweightCharts;
    if (!LW || typeof LW.createChart !== 'function') {
      if (retry < 6) {
        setTimeout(() => initOverlayChart(retry + 1), 500);
      } else {
        console.warn('[LiqHeatmap] LightweightCharts unavailable. Overlay disabled.');
      }
      return;
    }
    overlayState.chart = LW.createChart(overlayState.container, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#e8f3ff',
        fontFamily: "'Rajdhani', sans-serif",
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: {
        visible: false,
        secondsVisible: true,
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: { mode: LW.CrosshairMode.Hidden },
      handleScroll: false,
      handleScale: false,
    });
    overlayState.series = overlayState.chart.addCandlestickSeries({
      upColor: '#4cf0ff',
      downColor: '#ff47c4',
      wickUpColor: '#4cf0ff',
      wickDownColor: '#ff47c4',
      borderVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    overlayState.chart.timeScale().fitContent();
    if (overlayState.candles.length) {
      try {
        overlayState.series.setData(overlayState.candles);
        overlayState.chart.timeScale().fitContent();
      } catch (error) {
        console.warn('[LiqHeatmap] Deferred overlay sync failed:', error);
      }
      scheduleOverlayRender();
    }

    if (typeof ResizeObserver !== 'undefined') {
      overlayObserver = new ResizeObserver(() => {
        if (!overlayState.container || !overlayState.chart) {
          return;
        }
        const rect = overlayState.container.getBoundingClientRect();
        overlayState.chart.resize(rect.width, rect.height);
        scheduleOverlayRender();
      });
      overlayObserver.observe(overlayState.container);
    } else {
      window.addEventListener('resize', scheduleOverlayRender);
    }
  }

  function scheduleOverlayRender() {
    if (overlayRaf) {
      cancelAnimationFrame(overlayRaf);
    }
    overlayRaf = requestAnimationFrame(() => {
      overlayRaf = null;
      renderOverlayPrimitives();
    });
  }

  function buildVolumeBuckets(payload) {
    const buckets = new Map();
    const longs = Array.isArray(payload?.longSeries) ? payload.longSeries : [];
    const shorts = Array.isArray(payload?.shortSeries) ? payload.shortSeries : [];
    longs.forEach((row) => {
      const ts = Number(row?.[0]);
      const value = Number(row?.[1]);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) {
        return;
      }
      const entry = buckets.get(ts) || { long: 0, short: 0 };
      entry.long += value;
      buckets.set(ts, entry);
    });
    shorts.forEach((row) => {
      const ts = Number(row?.[0]);
      const value = Number(row?.[1]);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) {
        return;
      }
      const entry = buckets.get(ts) || { long: 0, short: 0 };
      entry.short += value;
      buckets.set(ts, entry);
    });
    return buckets;
  }

  function computeFvgVolume(fvg) {
    if (!fvg || !overlayState.candles.length || !overlayState.bucketMs) {
      return { bullish: 0, bearish: 0, long: 0, short: 0 };
    }
    const buckets = overlayState.volumeBuckets;
    if (!(buckets instanceof Map) || buckets.size === 0) {
      return { bullish: 0, bearish: 0, long: 0, short: 0 };
    }
    const used = new Set();
    let totalLong = 0;
    let totalShort = 0;
    for (let idx = fvg.startIndex; idx <= fvg.endIndex && idx < overlayState.candles.length; idx += 1) {
      const candle = overlayState.candles[idx];
      if (!candle) {
        continue;
      }
      const key = Math.floor((candle.time * 1000) / overlayState.bucketMs) * overlayState.bucketMs;
      if (used.has(key)) {
        continue;
      }
      used.add(key);
      const entry = buckets.get(key);
      if (entry) {
        totalLong += Number(entry.long) || 0;
        totalShort += Number(entry.short) || 0;
      }
    }
    const total = totalLong + totalShort;
    const bullish = total > 0 ? (totalShort / total) * 100 : 0;
    const bearish = total > 0 ? (totalLong / total) * 100 : 0;
    return { bullish, bearish, long: totalLong, short: totalShort };
  }

  function detectFairValueGaps(candles) {
    if (!Array.isArray(candles) || candles.length < 3) {
      return [];
    }
    const result = [];
    const maxLookahead = 160;
    for (let i = 1; i < candles.length - 1; i += 1) {
      const prev = candles[i - 1];
      const curr = candles[i];
      const next = candles[i + 1];
      if (!prev || !curr || !next) {
        continue;
      }
      if (
        Number.isFinite(prev.high) &&
        Number.isFinite(curr.low) &&
        Number.isFinite(next.low) &&
        prev.high < next.low &&
        curr.low > prev.high
      ) {
        const gapTop = next.low;
        const gapBottom = prev.high;
        const gapSize = gapTop - gapBottom;
        if (!Number.isFinite(gapSize) || gapSize <= 0) {
          continue;
        }
        const refPrice = Number.isFinite(curr.close) ? Math.abs(curr.close) : Math.abs(curr.open || gapTop);
        if (!Number.isFinite(refPrice) || refPrice === 0) {
          continue;
        }
        const ratio = gapSize / refPrice;
        if (ratio < 0.0003) {
          continue;
        }
        const limit = Math.min(candles.length - 1, i + maxLookahead);
        let endIndex = limit;
        for (let j = i + 1; j <= limit; j += 1) {
          if (Number.isFinite(candles[j].low) && candles[j].low <= gapBottom) {
            endIndex = j;
            break;
          }
        }
        result.push({
          type: 'bullish',
          startIndex: Math.max(0, i - 1),
          endIndex,
          startTime: curr.time,
          endTime: candles[endIndex]?.time ?? curr.time,
          top: gapTop,
          bottom: gapBottom,
        });
      } else if (
        Number.isFinite(prev.low) &&
        Number.isFinite(curr.high) &&
        Number.isFinite(next.high) &&
        prev.low > next.high &&
        curr.high < prev.low
      ) {
        const gapTop = prev.low;
        const gapBottom = next.high;
        const gapSize = gapTop - gapBottom;
        if (!Number.isFinite(gapSize) || gapSize <= 0) {
          continue;
        }
        const refPrice = Number.isFinite(curr.close) ? Math.abs(curr.close) : Math.abs(curr.open || gapTop);
        if (!Number.isFinite(refPrice) || refPrice === 0) {
          continue;
        }
        const ratio = gapSize / refPrice;
        if (ratio < 0.0003) {
          continue;
        }
        const limit = Math.min(candles.length - 1, i + maxLookahead);
        let endIndex = limit;
        for (let j = i + 1; j <= limit; j += 1) {
          if (Number.isFinite(candles[j].high) && candles[j].high >= gapTop) {
            endIndex = j;
            break;
          }
        }
        result.push({
          type: 'bearish',
          startIndex: Math.max(0, i - 1),
          endIndex,
          startTime: curr.time,
          endTime: candles[endIndex]?.time ?? curr.time,
          top: gapTop,
          bottom: gapBottom,
        });
      }
    }
    return result.slice(-40);
  }

  function detectOrderBlocks(candles) {
    if (!Array.isArray(candles) || candles.length < 5) {
      return [];
    }
    const result = [];
    const lookback = 8;
    const lookahead = 18;
    for (let i = lookback; i < candles.length - 1; i += 1) {
      const candle = candles[i];
      if (!candle) {
        continue;
      }
      const range = candle.high - candle.low;
      if (!Number.isFinite(range) || range <= 0) {
        continue;
      }
      const body = Math.abs(candle.close - candle.open);
      if (!Number.isFinite(body) || body / range < 0.4) {
        continue;
      }
      if (candle.close < candle.open) {
        const windowStart = Math.max(0, i - lookback);
        let prevHigh = candle.high;
        for (let k = windowStart; k <= i; k += 1) {
          prevHigh = Math.max(prevHigh, candles[k].high);
        }
        let breakoutIndex = null;
        const limit = Math.min(candles.length - 1, i + lookahead);
        for (let j = i + 1; j <= limit; j += 1) {
          if (candles[j].close > prevHigh) {
            breakoutIndex = j;
            break;
          }
        }
        if (breakoutIndex != null) {
          let endIndex = limit;
          for (let j = breakoutIndex; j <= limit; j += 1) {
            if (candles[j].close < candle.close || candles[j].low < candle.low) {
              endIndex = j;
              break;
            }
          }
          result.push({
            type: 'bullish',
            startIndex: i,
            endIndex,
            startTime: candle.time,
            endTime: candles[endIndex]?.time ?? candle.time,
            top: candle.open,
            bottom: Math.min(candle.low, candle.close),
          });
        }
      } else if (candle.close > candle.open) {
        const windowStart = Math.max(0, i - lookback);
        let prevLow = candle.low;
        for (let k = windowStart; k <= i; k += 1) {
          prevLow = Math.min(prevLow, candles[k].low);
        }
        let breakdownIndex = null;
        const limit = Math.min(candles.length - 1, i + lookahead);
        for (let j = i + 1; j <= limit; j += 1) {
          if (candles[j].close < prevLow) {
            breakdownIndex = j;
            break;
          }
        }
        if (breakdownIndex != null) {
          let endIndex = limit;
          for (let j = breakdownIndex; j <= limit; j += 1) {
            if (candles[j].close > candle.close || candles[j].high > candle.high) {
              endIndex = j;
              break;
            }
          }
          result.push({
            type: 'bearish',
            startIndex: i,
            endIndex,
            startTime: candle.time,
            endTime: candles[endIndex]?.time ?? candle.time,
            top: Math.max(candle.high, candle.close),
            bottom: candle.open,
          });
        }
      }
    }
    return result.slice(-30);
  }

  function renderOverlayPrimitives() {
    if (!overlayState.chart || !overlayState.series || !overlayState.shapesRoot) {
      return;
    }
    overlayState.shapesRoot.innerHTML = '';
    if (!overlayState.candles.length) {
      return;
    }
    const timeScale = overlayState.chart.timeScale();
    const fvgs = (overlayState.fvgs || []).slice(-14);
    const obs = (overlayState.obs || []).slice(-12);

    fvgs.forEach((fvg) => {
      if (!fvg) return;
      const left = timeScale.timeToCoordinate(fvg.startTime);
      const right = timeScale.timeToCoordinate(fvg.endTime);
      const topCoord = overlayState.series.priceToCoordinate(fvg.top);
      const bottomCoord = overlayState.series.priceToCoordinate(fvg.bottom);
      if (
        left == null ||
        right == null ||
        topCoord == null ||
        bottomCoord == null ||
        !Number.isFinite(left) ||
        !Number.isFinite(right) ||
        !Number.isFinite(topCoord) ||
        !Number.isFinite(bottomCoord)
      ) {
        return;
      }
      const x = Math.min(left, right);
      const y = Math.min(topCoord, bottomCoord);
      const width = Math.max(6, Math.abs(right - left));
      const height = Math.max(12, Math.abs(bottomCoord - topCoord));
      const node = document.createElement('div');
      node.className = `fvg-box ${fvg.type}`;
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      node.style.zIndex = '1';
      const bar = document.createElement('div');
      bar.className = 'fvg-volume-bar';
      const bull = document.createElement('span');
      const bear = document.createElement('span');
      const bullPct = Math.max(0, Math.min(100, Math.round(fvg.volume?.bullish ?? 0)));
      const bearPct = Math.max(0, Math.min(100, Math.round(fvg.volume?.bearish ?? 0)));
      const bullFlex = bullPct > 0 ? bullPct : 1;
      const bearFlex = bearPct > 0 ? bearPct : 1;
      bull.className = `bull${bullPct <= 0 ? ' empty' : ''}`;
      bear.className = `bear${bearPct <= 0 ? ' empty' : ''}`;
      bull.style.flex = String(bullFlex);
      bear.style.flex = String(bearFlex);
      bull.textContent = `${bullPct}%`;
      bear.textContent = `${bearPct}%`;
      bar.append(bull, bear);
      node.append(bar);
      overlayState.shapesRoot.append(node);
    });

    obs.forEach((ob) => {
      if (!ob) return;
      const left = timeScale.timeToCoordinate(ob.startTime);
      const right = timeScale.timeToCoordinate(ob.endTime);
      const topCoord = overlayState.series.priceToCoordinate(ob.top);
      const bottomCoord = overlayState.series.priceToCoordinate(ob.bottom);
      if (
        left == null ||
        right == null ||
        topCoord == null ||
        bottomCoord == null ||
        !Number.isFinite(left) ||
        !Number.isFinite(right) ||
        !Number.isFinite(topCoord) ||
        !Number.isFinite(bottomCoord)
      ) {
        return;
      }
      const x = Math.min(left, right);
      const y = Math.min(topCoord, bottomCoord);
      const width = Math.max(4, Math.abs(right - left));
      const height = Math.max(10, Math.abs(bottomCoord - topCoord));
      const node = document.createElement('div');
      node.className = `ob-box ${ob.type}`;
      node.style.transform = `translate(${x}px, ${y}px)`;
      node.style.width = `${width}px`;
      node.style.height = `${height}px`;
      node.style.zIndex = '2';
      const label = document.createElement('span');
      label.className = 'ob-label';
      label.textContent = ob.type === 'bullish' ? 'Bull OB' : 'Bear OB';
      node.append(label);
      overlayState.shapesRoot.append(node);
    });
  }

  function updateOverlay(payload, candles) {
    if (!overlayState.container) {
      return;
    }
    if (!overlayState.chart) {
      initOverlayChart();
    }
    const validCandles = Array.isArray(candles)
      ? candles
          .map((item) => ({
            time: Math.floor(Number(item?.time) || 0),
            open: Number(item?.open),
            high: Number(item?.high),
            low: Number(item?.low),
            close: Number(item?.close),
          }))
          .filter((item) =>
            Number.isFinite(item.time) &&
            Number.isFinite(item.open) &&
            Number.isFinite(item.high) &&
            Number.isFinite(item.low) &&
            Number.isFinite(item.close)
          )
          .sort((a, b) => a.time - b.time)
      : [];

    overlayState.candles = validCandles;
    overlayState.bucketMs = timeframeToMs(payload?.timeframe);
    overlayState.volumeBuckets = buildVolumeBuckets(payload);

    if (overlayState.series) {
      try {
        overlayState.series.setData(validCandles);
        if (validCandles.length) {
          overlayState.chart.timeScale().fitContent();
        }
      } catch (error) {
        console.warn('[LiqHeatmap] Failed to render overlay series:', error);
      }
    }

    if (!validCandles.length) {
      overlayState.fvgs = [];
      overlayState.obs = [];
      scheduleOverlayRender();
      return;
    }

    const fvgs = detectFairValueGaps(validCandles).map((fvg) => ({
      ...fvg,
      volume: computeFvgVolume(fvg),
    }));
    overlayState.fvgs = fvgs;
    overlayState.obs = detectOrderBlocks(validCandles);
    scheduleOverlayRender();
  }

  function buildHeatmapOption(payload) {
    if (!payload || !Array.isArray(payload.timestamps) || !payload.timestamps.length) {
      return null;
    }
    const centers = payload.priceBins?.centers || [];
    const heatmapData = [];
    const priceExtents = [];
    payload.matrix.forEach((row, rowIndex) => {
      const ts = payload.timestamps[rowIndex];
      row.forEach((value, colIndex) => {
        const price = centers[colIndex];
        if (!Number.isFinite(price)) {
          return;
        }
        heatmapData.push([ts, price, Number(value)]);
        priceExtents.push(Number(price));
      });
    });

    const priceSeries = Array.isArray(payload.priceSeries)
      ? payload.priceSeries
          .filter((point) => Number.isFinite(point?.[1]))
          .map(([ts, price]) => {
            const tsNumber = Number(ts);
            const priceNumber = Number(price);
            if (Number.isFinite(priceNumber)) {
              priceExtents.push(priceNumber);
            }
            return [tsNumber, priceNumber];
          })
      : [];

    const maxValue = Math.max(1, Number(payload.maxValue) || 0);
    const clip = Number(payload.meta?.clip) || 0;
    const hasPrices = priceExtents.length > 0;
    const priceMin = hasPrices ? Math.min(...priceExtents) : null;
    const priceMax = hasPrices ? Math.max(...priceExtents) : null;
    let axisMin = Number.isFinite(priceMin) ? priceMin : payload.priceBins?.min ?? null;
    let axisMax = Number.isFinite(priceMax) ? priceMax : payload.priceBins?.max ?? null;
    if (Number.isFinite(axisMin) && Number.isFinite(axisMax)) {
      const range = Math.max(axisMax - axisMin, 0);
      const padding = range > 0 ? range * 0.05 : Math.max(Math.abs(axisMax) * 0.01, 1);
      axisMin -= padding;
      axisMax += padding;
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: {
        top: 24,
        left: 60,
        right: 80,
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
        position: 'right',
        scale: true,
        min: axisMin,
        max: axisMax,
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

  function render(payload, candles) {
    if (!payload || !Array.isArray(payload.timestamps) || payload.timestamps.length === 0) {
      setEmptyVisible(true);
      updateTotals(payload);
      updateMeta(payload);
      updateOverlay(payload || {}, []);
      return;
    }
    setEmptyVisible(false);
    const option = buildHeatmapOption(payload);
    if (option) {
      chart.setOption(option, true);
    }
    updateTotals(payload);
    updateMeta(payload);
    updateOverlay(payload, candles);
  }

  async function fetchCandles(symbol, timeframe, limit, signal) {
    if (!symbol || !timeframe) {
      return [];
    }
    const safeLimit = Math.max(120, Math.min(1500, Number(limit) || 720));
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', String(symbol).toUpperCase());
    url.searchParams.set('interval', timeframe);
    url.searchParams.set('limit', String(safeLimit));
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((row) => ({
        time: Math.floor(Number(row?.[0]) / 1000),
        open: Number(row?.[1]),
        high: Number(row?.[2]),
        low: Number(row?.[3]),
        close: Number(row?.[4]),
        volume: Number(row?.[5]),
      }))
      .filter((item, idx, arr) => {
        if (!Number.isFinite(item.time) || !Number.isFinite(item.open) || !Number.isFinite(item.high) || !Number.isFinite(item.low) || !Number.isFinite(item.close)) {
          return false;
        }
        if (idx > 0 && item.time === arr[idx - 1].time) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.time - b.time);
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
      const heatmapPromise = fetch(`/api/liquidations?${params.toString()}`, {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      });
      const candlesPromise = fetchCandles(state.symbol, preset.tf, preset.limit + 20, controller.signal).catch((error) => {
        if (error.name !== 'AbortError') {
          console.warn('[LiqHeatmap] Candle fetch failed:', error);
        }
        return [];
      });
      const [payload, candles] = await Promise.all([heatmapPromise, candlesPromise]);
      render(payload, candles);
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
    if (overlayState.chart && overlayState.container) {
      const rect = overlayState.container.getBoundingClientRect();
      overlayState.chart.resize(rect.width, rect.height);
      scheduleOverlayRender();
    }
  });
})();
