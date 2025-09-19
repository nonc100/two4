'use strict';

const NEWS_ENDPOINT = 'https://newsdata.io/api/1/news';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const SUMMARY_ARTICLE_LIMIT = 6;
const FETCH_TIMEOUT_MS = Number(process.env.NEWS_API_TIMEOUT_MS || 10000);
const Parser = require('rss-parser');
const FALLBACK_RSS_TIMEOUT_MS = Number(process.env.NEWS_RSS_TIMEOUT_MS || Math.min(FETCH_TIMEOUT_MS, 8000));
const FALLBACK_RSS_FEEDS = [
  { url: 'https://www.coindeskkorea.com/rss/allArticle.xml', name: '코인데스크코리아' },
  { url: 'https://www.tokenpost.kr/rss', name: '토큰포스트' },
  { url: 'https://www.blockmedia.co.kr/feed', name: '블록미디어' }
];
const FALLBACK_DEFAULT_QUERY = [
  '크립토',
  '암호화폐',
  '가상화폐',
  '비트코인',
  '이더리움',
  '블록체인',
  '코인',
  '디지털 자산',
  '스테이블코인',
  'web3',
  'defi',
  'crypto',
  'cryptocurrency',
  'bitcoin',
  'ethereum',
  'blockchain',
  'digital asset',
  'stablecoin',
  'token',
  'nft'
].join(' OR ');

const rssParser = new Parser({
  timeout: FALLBACK_RSS_TIMEOUT_MS,
  requestOptions: {
    timeout: FALLBACK_RSS_TIMEOUT_MS,
    headers: {
      'User-Agent': process.env.NEWS_FALLBACK_USER_AGENT || 'two4.app-news-fallback/1.0'
    }
  }
});

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === '') return defaultValue;
    return ['1', 'true', 'y', 'yes', 'on'].includes(lowered);
  }
  return defaultValue;
}

function sanitizeText(input) {
  if (!input) return '';
  return String(input).replace(/\s+/g, ' ').trim();
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  return [String(value)];
}

function parseDate(value) {
  if (!value) return { iso: null, timestamp: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { iso: null, timestamp: null };
  return { iso: date.toISOString(), timestamp: date.getTime() };
}

async function fetchJsonWithTimeout(url, { headers } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: Object.assign({ Accept: 'application/json' }, headers || {})
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      const parseError = new Error('Failed to parse upstream JSON response');
      parseError.cause = error;
      parseError.body = text;
      parseError.statusCode = 502;
      throw parseError;
    }

    if (!response.ok) {
      const upstreamError = new Error(`Upstream responded with status ${response.status}`);
      upstreamError.statusCode = response.status;
      upstreamError.body = payload || text;
      throw upstreamError;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const abortError = new Error('Request to upstream provider timed out');
      abortError.statusCode = 504;
      throw abortError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapArticle(result, index) {
  const id = result.article_id || result.link || `article-${index}`;
  const title = sanitizeText(result.title);
  const description = sanitizeText(result.description || result.content);
  const { iso: publishedAt, timestamp } = parseDate(result.pubDate || result.pubDateTime || result.pubDate_tz);

  return {
    id,
    title: title || '제목 없음',
    description: description || '',
    link: result.link || null,
    source: result.source_id || (Array.isArray(result.creator) ? result.creator[0] : null),
    categories: normalizeArray(result.category),
    keywords: normalizeArray(result.keywords),
    imageUrl: result.image_url || null,
    language: result.language || 'ko',
    country: normalizeArray(result.country),
    rawPubDate: result.pubDate || null,
    publishedAt,
    publishedTimestamp: timestamp,
    summary: null,
    _rawForSummary: sanitizeText(result.content || result.description)
  };
}

function pickSummaryForArticle(article, summaryMap, index) {
  const candidates = [
    article.id,
    String(article.id),
    article.title,
    `article-${index}`,
    String(index)
  ].filter(Boolean);

  for (const key of candidates) {
    if (summaryMap.has(key)) {
      return sanitizeText(summaryMap.get(key));
    }
  }
  return '';
}

function parseSummaryContent(content) {
  if (!content) return [];
  try {
    const direct = JSON.parse(content);
    if (Array.isArray(direct)) return direct;
    if (direct && Array.isArray(direct.summaries)) return direct.summaries;
  } catch (error) {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        // ignore parse error from fallback attempt
      }
    }
  }
  return [];
}

function extractSourceFromItem(item) {
  if (!item) return '';
  if (typeof item.source === 'string') return item.source;
  if (item.source && typeof item.source === 'object') {
    if (typeof item.source.title === 'string') return item.source.title;
    if (typeof item.source._ === 'string') return item.source._;
  }
  if (typeof item.creator === 'string') return item.creator;
  if (typeof item.author === 'string') return item.author;
  return '';
}

function extractImageFromItem(item) {
  if (!item) return null;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (Array.isArray(item.enclosures) && item.enclosures.length > 0) {
    const first = item.enclosures.find((entry) => entry && entry.url);
    if (first && first.url) return first.url;
  }
  const mediaContent = item['media:content'] || item['media:thumbnail'];
  if (Array.isArray(mediaContent)) {
    const firstMedia = mediaContent.find((entry) => entry && (entry.url || (entry.$ && entry.$.url)));
    if (firstMedia) return firstMedia.url || (firstMedia.$ && firstMedia.$.url) || null;
  } else if (mediaContent) {
    if (typeof mediaContent.url === 'string') return mediaContent.url;
    if (mediaContent.$ && typeof mediaContent.$.url === 'string') return mediaContent.$.url;
  }
  return null;
}

function mapFallbackItem(item, index, feed) {
  const id = item.guid || item.id || item.link || `${feed.name || 'rss'}-${index}`;
  const title = sanitizeText(item.title);
  const description = sanitizeText(item.contentSnippet || item.content || item.summary);
  const { iso: publishedAt, timestamp } = parseDate(item.isoDate || item.pubDate);

  return {
    id,
    title: title || '제목 없음',
    description,
    summary: description,
    link: item.link || null,
    source: sanitizeText(extractSourceFromItem(item) || feed.name || feed.url || 'RSS'),
    categories: normalizeArray(item.categories),
    keywords: normalizeArray(item.categories),
    imageUrl: extractImageFromItem(item),
    language: 'ko',
    country: ['kr'],
    rawPubDate: item.pubDate || item.isoDate || null,
    publishedAt,
    publishedTimestamp: timestamp
  };
}

function extractKeywordsFromQuery(query) {
  if (!query) return FALLBACK_DEFAULT_QUERY.split(' OR ');
  if (Array.isArray(query)) {
    return query
      .map((entry) => sanitizeText(entry))
      .filter(Boolean);
  }
  const normalized = sanitizeText(String(query));
  if (!normalized) return FALLBACK_DEFAULT_QUERY.split(' OR ');
  const parts = normalized
    .split(/\s+OR\s+/i)
    .map((part) => sanitizeText(part))
    .filter(Boolean);
  return parts.length > 0 ? parts : FALLBACK_DEFAULT_QUERY.split(' OR ');
}

async function fetchFallbackArticles({ limit = 8, query, fastify }) {
  const articles = [];
  await Promise.all(
    FALLBACK_RSS_FEEDS.map(async (feed) => {
      try {
        const feedData = await rssParser.parseURL(feed.url);
        const items = Array.isArray(feedData?.items) ? feedData.items : [];
        items.slice(0, limit * 2).forEach((item, index) => {
          articles.push(mapFallbackItem(item, index, feed));
        });
      } catch (error) {
        fastify?.log?.warn({ err: error, feed: feed.url }, 'Fallback RSS feed fetch failed');
      }
    })
  );

  if (articles.length === 0) {
    return [];
  }

  const seen = new Set();
  const deduped = [];
  for (const article of articles) {
    const key = article.link || article.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    deduped.push(article);
  }

  deduped.sort((a, b) => {
    const aTs = typeof a.publishedTimestamp === 'number' ? a.publishedTimestamp : 0;
    const bTs = typeof b.publishedTimestamp === 'number' ? b.publishedTimestamp : 0;
    return bTs - aTs;
  });

  const keywords = extractKeywordsFromQuery(query)
    .map((keyword) => keyword.toLowerCase())
    .filter(Boolean);
  const filtered = keywords.length
    ? deduped.filter((article) => {
        const bucket = [article.title, article.summary, article.description]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase())
          .join(' ');
        return bucket && keywords.some((keyword) => bucket.includes(keyword));
      })
    : deduped;
  const selected = filtered.length > 0 ? filtered : deduped;

  return selected.slice(0, limit).map((article) => ({
    ...article,
    summary: article.summary || article.description || ''
  }));
}

async function summarizeArticles(articles, fastify) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return;
  if (!articles.length) return;

  const subset = articles.slice(0, Math.min(SUMMARY_ARTICLE_LIMIT, articles.length));
  const payloadForModel = subset.map((article) => ({
    id: article.id,
    title: article.title,
    description: article.description,
    content: article._rawForSummary
  }));

  const messages = [
    {
      role: 'system',
      content: '당신은 데이터 저널리스트입니다. 각 한국어 기사를 두 문장 이하로 간결하게 요약하고 JSON 배열로만 응답하세요.'
    },
    {
      role: 'user',
      content: `다음 기사를 요약해 주세요. JSON 배열 형태로, 각 항목은 {"id": "기사 ID", "summary": "요약"} 구조여야 합니다.\n${JSON.stringify(payloadForModel)}`
    }
  ];

  const body = {
    model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
    messages,
    temperature: 0.2,
    max_tokens: 700
  };

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://two4.app',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Two4 Echoes'
      },
      body: JSON.stringify(body)
    });

    const json = await response.json();
    if (!response.ok) {
      const error = new Error(`OpenRouter responded with status ${response.status}`);
      error.statusCode = response.status;
      error.body = json;
      throw error;
    }

    const messageContent = json?.choices?.[0]?.message?.content;
    const summaries = parseSummaryContent(messageContent);
    if (!Array.isArray(summaries) || summaries.length === 0) {
      fastify.log.warn({ messageContent }, 'OpenRouter did not return a parsable summary payload');
      return;
    }

    const summaryMap = new Map();
    for (const entry of summaries) {
      if (!entry) continue;
      const key = entry.id || entry.articleId || entry.title;
      const summaryText = entry.summary || entry.synopsis || entry.text;
      if (!key || !summaryText) continue;
      summaryMap.set(String(key), summaryText);
    }

    subset.forEach((article, index) => {
      const summaryText = pickSummaryForArticle(article, summaryMap, index);
      if (summaryText) {
        article.summary = summaryText;
      }
    });
  } catch (error) {
    fastify.log.warn({ err: error }, 'Failed to summarize articles via OpenRouter');
  }
}

function buildFallbackMeta({ q, category, selectedCountry, page, perPage }) {
  return {
    fetchedAt: new Date().toISOString(),
    totalResults: null,
    nextPage: null,
    query: {
      q: q || null,
      category: category || null,
      country: selectedCountry,
      page: page || null,
      limit: perPage,
      summarize: false
    },
    fallback: {
      used: true,
      provider: 'rss',
      sources: FALLBACK_RSS_FEEDS.map((feed) => feed.name || feed.url)
    }
  };
}

async function respondWithFallback({ fastify, reply, perPage, q, category, selectedCountry, page, error }) {
  try {
    const fallbackArticles = await fetchFallbackArticles({ limit: perPage, query: q, fastify });
    if (fallbackArticles.length > 0) {
      const fallbackMeta = buildFallbackMeta({ q, category, selectedCountry, page, perPage });
      fallbackMeta.totalResults = fallbackArticles.length;

      reply.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return {
        ok: true,
        provider: 'rss-fallback',
        meta: fallbackMeta,
        articles: fallbackArticles
      };
    }
  } catch (fallbackError) {
    fastify.log.warn({ err: fallbackError }, 'Fallback RSS fetch for Korean news failed');
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
  if (statusCode) {
    reply.code(statusCode);
  }

  return {
    ok: false,
    error: 'Failed to retrieve Korean news feed',
    detail: error?.message || 'Upstream news provider unavailable'
  };
}

module.exports = async function newsKoPlugin(fastify) {
  const newsApiKey = process.env.NEWSDATA_API_KEY;
  if (!newsApiKey) {
    fastify.log.error('NEWSDATA_API_KEY is not configured');
  }

  fastify.get('/api/news-ko', async (request, reply) => {
    const { q, category, country, page, summarize, limit } = request.query || {};
    const perPage = Math.min(Math.max(Number(limit) || Number(process.env.NEWS_DEFAULT_LIMIT || 8), 1), 20);
    const selectedCountry = (country || process.env.NEWS_DEFAULT_COUNTRY || 'kr').toLowerCase();
    const url = new URL(NEWS_ENDPOINT);
    url.searchParams.set('language', 'ko');
    if (selectedCountry) {
      url.searchParams.set('country', selectedCountry);
    }
    if (q) {
      url.searchParams.set('q', String(q));
    }
    if (category) {
      url.searchParams.set('category', String(category));
    }
    if (page) {
      url.searchParams.set('page', String(page));
    }

    if (!newsApiKey) {
      fastify.log.warn('NEWSDATA_API_KEY is not configured; serving fallback RSS feed');
      return respondWithFallback({
        fastify,
        reply,
        perPage,
        q,
        category,
        selectedCountry,
        page,
        error: Object.assign(new Error('NEWSDATA_API_KEY is not configured'), { statusCode: 500 })
      });
    }

    url.searchParams.set('apikey', newsApiKey);

    try {
      const upstream = await fetchJsonWithTimeout(url.toString());
      const results = Array.isArray(upstream?.results) ? upstream.results : [];
      const sliced = results.slice(0, perPage).map((item, index) => mapArticle(item, index));

      const shouldSummarize = parseBoolean(summarize, false);
      if (shouldSummarize) {
        await summarizeArticles(sliced, fastify);
      }

      sliced.forEach((article) => {
        if (!article.summary) {
          article.summary = article.description || '';
        }
        delete article._rawForSummary;
      });

      const meta = {
        fetchedAt: new Date().toISOString(),
        totalResults: upstream?.totalResults ?? null,
        nextPage: upstream?.nextPage || null,
        query: {
          q: q || null,
          category: category || null,
          country: selectedCountry,
          page: page || null,
          limit: perPage,
          summarize: shouldSummarize && Boolean(process.env.OPENROUTER_API_KEY)
        }
      };

      reply.header('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
      return {
        ok: true,
        provider: 'newsdata.io',
        meta,
        articles: sliced
      };
    } catch (error) {
      fastify.log.error({ err: error }, 'Failed to fetch Korean news');
      return respondWithFallback({
        fastify,
        reply,
        perPage,
        q,
        category,
        selectedCountry,
        page,
        error
      });
    }
  });
};
