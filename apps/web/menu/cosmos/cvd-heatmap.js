(function () {
  'use strict';

  const symbol = 'BTCUSDT';
  const heatmapEl = document.getElementById('heatmapChart');
  const cvdEl = document.getElementById('cvdChart');
  const statusEl = document.querySelector('[data-status]');
  const updatedEl = document.querySelector('[data-updated]');
  const priceEl = document.querySelector('[data-price]');
  const symbolEl = document.querySelector('[data-symbol]');

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

  const bucketColors = {
    all: '#00f5ff',
    bucket0: '#22d3ee',
    bucket1: '#8b5cf6',
    bucket2: '#ec4899',
    bucket3: '#facc15',
    bucket4: '#fb7185',
  };

  function setStatus(state, label) {
    if (!statusEl) return;
    statusEl.dataset.statusState = state;
    statusEl.textContent = label;
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

  function buildHeatmapOption(heatmap, priceSeries) {
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
    const filteredPriceSeries = Array.isArray(priceSeries)
      ? priceSeries
          .filter((point) =>
            point && Number.isFinite(point.timestamp) && Number.isFinite(point.price)
              ? (!Number.isFinite(rangeStart) || point.timestamp >= rangeStart) &&
                (!Number.isFinite(rangeEnd) || point.timestamp <= rangeEnd)
              : false
          )
          .map((point) => [point.timestamp, point.price])
      : [];

    const maxValue = Math.max(heatmap.maxValue || 0, 1);

    return {
      backgroundColor: 'transparent',
      grid: { left: 70, right: 110, top: 80, bottom: 60 },
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
        label: { backgroundColor: 'rgba(18, 32, 64, 0.8)', borderColor: '#00f5ff', borderWidth: 1 },
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
          name: 'Price',
          type: 'line',
          data: filteredPriceSeries,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#3ab4ff', width: 2.2 },
          tooltip: { show: false },
        },
      ],
      textStyle: {
        fontFamily: 'Rajdhani, sans-serif',
      },
    };
  }

  function buildCvdOption(cvd) {
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
        valueFormatter: (value) => `${formatNumber(value)} USDT`,
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

  function updateMetadata({ cvd, heatmap, price }) {
    if (priceEl) {
      const current = price && price.meta && Number.isFinite(price.meta.lastPrice)
        ? price.meta.lastPrice
        : heatmap && Number.isFinite(heatmap.lastPrice)
          ? heatmap.lastPrice
          : null;
      priceEl.textContent = current ? formatCurrency(current) : '--';
    }

    if (updatedEl) {
      const timestamps = [];
      if (cvd && Number.isFinite(cvd.meta?.lastTimestamp)) {
        timestamps.push(cvd.meta.lastTimestamp);
      }
      if (Array.isArray(heatmap?.timestamps) && heatmap.timestamps.length) {
        timestamps.push(heatmap.timestamps[heatmap.timestamps.length - 1]);
      }
      if (Array.isArray(price?.points) && price.points.length) {
        timestamps.push(price.points[price.points.length - 1].timestamp);
      }
      const latest = timestamps.length ? Math.max(...timestamps) : null;
      updatedEl.textContent = latest ? formatTimestampLong(latest) : '--';
    }
  }

  async function loadData(isRefresh) {
    try {
      setStatus('loading', isRefresh ? 'Refreshing…' : 'Loading…');
      const [heatmap, cvd, price] = await Promise.all([
        fetchJson(`/api/heatmap?symbol=${symbol}&bins=120&limit=720`),
        fetchJson(`/api/cvd?symbol=${symbol}&tf=1m&limit=1440`),
        fetchJson(`/api/price?symbol=${symbol}&tf=1m&limit=1440`),
      ]);

      const heatmapOption = buildHeatmapOption(heatmap, price.points);
      const cvdOption = buildCvdOption(cvd);

      if (heatmapOption) {
        heatmapChart.setOption(heatmapOption, true);
      }
      if (cvdOption) {
        cvdChart.setOption(cvdOption, true);
      }

      updateMetadata({ cvd, heatmap, price });
      setStatus('online', 'Online');
    } catch (error) {
      console.error('Failed to refresh dashboard:', error);
      setStatus('error', 'Error');
    }
  }

  window.addEventListener('resize', () => {
    heatmapChart.resize();
    cvdChart.resize();
  });

  loadData(false);
  setInterval(() => loadData(true), 60_000);
})();
