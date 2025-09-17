'use strict';

const NEWS_ENDPOINT = 'https://newsdata.io/api/1/news';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const SUMMARY_ARTICLE_LIMIT = 6;
const FETCH_TIMEOUT_MS = Number(process.env.NEWS_API_TIMEOUT_MS || 10000);

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

module.exports = async function newsKoPlugin(fastify) {
  const newsApiKey = process.env.NEWSDATA_API_KEY;
  if (!newsApiKey) {
    fastify.log.error('NEWSDATA_API_KEY is not configured');
  }

  fastify.get('/api/news-ko', async (request, reply) => {
    if (!newsApiKey) {
      reply.code(500);
      return { ok: false, error: 'NEWSDATA_API_KEY is not configured' };
    }

    const { q, category, country, page, summarize, limit } = request.query || {};
    const perPage = Math.min(Math.max(Number(limit) || Number(process.env.NEWS_DEFAULT_LIMIT || 8), 1), 20);
    const selectedCountry = (country || process.env.NEWS_DEFAULT_COUNTRY || 'kr').toLowerCase();
    const url = new URL(NEWS_ENDPOINT);
    url.searchParams.set('apikey', newsApiKey);
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
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 502;
      reply.code(statusCode);
      return {
        ok: false,
        error: 'Failed to retrieve Korean news feed',
        detail: error.message
      };
    }
  });
};
