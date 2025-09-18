'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');
const { URL } = require('node:url');

const sharp = require('sharp');

const {
  CACHE_CONTROL_HEADER,
  IMAGE_CONTENT_TYPE,
  getObject,
  headObject,
  putObject,
  buildCacheHeaders
} = require('../../lib/s3');

const DEFAULT_WIDTH = Number(process.env.LOGO_CACHE_DEFAULT_WIDTH || 28);
const RAW_ALLOWED_WIDTHS = String(process.env.LOGO_CACHE_ALLOWED_WIDTHS || '20,24,28,32,48,64,96,128')
  .split(',')
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isFinite(value) && value >= 16 && value <= 256);
const ALLOWED_WIDTHS = RAW_ALLOWED_WIDTHS.length ? RAW_ALLOWED_WIDTHS : [20, 24, 28, 32, 48, 64, 96, 128];
const MAX_IMAGE_BYTES = Number(process.env.LOGO_CACHE_MAX_BYTES || 5 * 1024 * 1024);
const FETCH_TIMEOUT_MS = Number(process.env.LOGO_CACHE_FETCH_TIMEOUT_MS || 6000);
const USER_AGENT = process.env.LOGO_CACHE_USER_AGENT || 'two4-logo-cache/1.0';
const WEBP_QUALITY = clampNumber(Number(process.env.LOGO_CACHE_WEBP_QUALITY || 80), 1, 100);
const WEBP_EFFORT = clampNumber(Number(process.env.LOGO_CACHE_WEBP_EFFORT || 4), 0, 6);
const PREWARM_MAX_ITEMS = clampNumber(Number(process.env.LOGO_CACHE_PREWARM_MAX_ITEMS || 32), 1, 100);
const RATE_LIMIT_WINDOW_MS = clampNumber(Number(process.env.LOGO_CACHE_RATE_LIMIT_WINDOW_MS || 60_000), 1000, 10 * 60_000);
const RATE_LIMIT_MAX_REQUESTS = clampNumber(Number(process.env.LOGO_CACHE_RATE_LIMIT_MAX_REQUESTS || 60), 1, 1000);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '0',
  '169.254.169.254'
]);

const rateLimitState = new Map();

class LogoCacheError extends Error {
  constructor(message, statusCode = 500, code = 'LOGO_CACHE_ERROR', cause) {
    super(message);
    this.name = 'LogoCacheError';
    this.statusCode = statusCode;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function buildCacheKey(urlString, width) {
  const hash = crypto.createHash('sha1').update(urlString).digest('hex').slice(0, 16);
  return `logos/${hash}_${width}.webp`;
}

function parseWidth(rawWidth) {
  if (rawWidth === undefined || rawWidth === null || rawWidth === '') return DEFAULT_WIDTH;
  const width = Number.parseInt(rawWidth, 10);
  if (!Number.isFinite(width)) {
    throw new LogoCacheError('Query parameter "w" must be an integer', 400, 'INVALID_WIDTH');
  }
  if (!ALLOWED_WIDTHS.includes(width)) {
    throw new LogoCacheError('Requested size is not allowed', 400, 'UNSUPPORTED_WIDTH');
  }
  return width;
}

function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new LogoCacheError('Query parameter "url" is required', 400, 'MISSING_URL');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new LogoCacheError('Query parameter "url" must be a valid absolute URL', 400, 'INVALID_URL', error);
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new LogoCacheError('Only http and https URLs are allowed', 400, 'INVALID_PROTOCOL');
  }

  return parsed;
}

function isPrivateIPv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map((octet) => Number.parseInt(octet, 10));
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const normalized = ip.toLowerCase();
  const mappedIndex = normalized.lastIndexOf('::ffff:');
  if (mappedIndex !== -1) {
    const candidate = normalized.slice(mappedIndex + 7);
    if (candidate && net.isIPv4(candidate)) {
      return isPrivateIPv4(candidate);
    }
  }
  if (normalized === '::1' || normalized === '::') return true;
  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
  if (Number.isFinite(firstHextet)) {
    if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true; // fc00::/7
    if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // fe80::/10
  }
  return false;
}

function isBlockedIp(ip) {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.localhost')) return true;
  if (lower.endsWith('.local')) return true;
  if (lower === 'two4') return true;
  return false;
}

async function ensureAddressAllowed(url) {
  const hostname = url.hostname;
  if (!hostname) {
    throw new LogoCacheError('URL hostname is required', 400, 'INVALID_URL_HOST');
  }

  if (isBlockedHostname(hostname)) {
    throw new LogoCacheError('URL hostname is not allowed', 400, 'BLOCKED_HOST');
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new LogoCacheError('IP addresses in private or loopback ranges are not allowed', 400, 'BLOCKED_IP');
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  } catch (error) {
    throw new LogoCacheError('DNS lookup for the provided URL failed', 502, 'DNS_LOOKUP_FAILED', error);
  }

  for (const address of addresses) {
    if (isBlockedIp(address.address)) {
      throw new LogoCacheError('URL resolves to a disallowed address', 400, 'BLOCKED_RESOLVED_IP');
    }
  }
}

async function downloadImage(url, log) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
      }
    });

    const finalUrl = new URL(response.url);
    await ensureAddressAllowed(finalUrl);

    if (!response.ok) {
      throw new LogoCacheError(`Upstream responded with status ${response.status}`, 502, 'UPSTREAM_FETCH_FAILED');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!/^image\//i.test(contentType)) {
      throw new LogoCacheError('Upstream response was not an image', 502, 'INVALID_CONTENT_TYPE');
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new LogoCacheError('Upstream image exceeded the maximum allowed size', 502, 'IMAGE_TOO_LARGE');
      }
    }

    if (!response.body) {
      throw new LogoCacheError('Upstream response did not include a body', 502, 'EMPTY_UPSTREAM_BODY');
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        try {
          await reader.cancel();
        } catch (_) {
          // ignore cancel errors
        }
        throw new LogoCacheError('Upstream image exceeded the maximum allowed size', 502, 'IMAGE_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof LogoCacheError) {
      throw error;
    }
    if (error.name === 'AbortError') {
      throw new LogoCacheError('Upstream fetch failed', 502, 'UPSTREAM_FETCH_FAILED', error);
    }
    throw new LogoCacheError('Failed to fetch upstream logo', 502, 'UPSTREAM_FETCH_FAILED', error);
  } finally {
    clearTimeout(timeout);
  }
}

async function processImage(buffer, width) {
  try {
    const pipeline = sharp(buffer, { failOn: 'none' })
      .resize(width, width, { fit: 'cover', position: 'centre' })
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT });
    return await pipeline.toBuffer();
  } catch (error) {
    throw new LogoCacheError('Failed to process upstream image', 502, 'IMAGE_PROCESSING_FAILED', error);
  }
}

async function fetchAndCache(url, width, cacheKey, log) {
  const downloaded = await downloadImage(url, log);
  const processed = await processImage(downloaded, width);

  let putResult;
  try {
    putResult = await putObject(cacheKey, processed, {
      cacheControl: CACHE_CONTROL_HEADER,
      contentType: IMAGE_CONTENT_TYPE
    });
  } catch (error) {
    throw new LogoCacheError('Failed to write cached logo to S3', 500, 'S3_PUT_FAILED', error);
  }

  return { buffer: processed, etag: putResult?.ETag };
}

function applyCacheHeaders(reply, headers) {
  Object.entries(headers).forEach(([key, value]) => {
    if (value) reply.header(key, value);
  });
}

function enforceRateLimit(ip) {
  if (!ip || RATE_LIMIT_MAX_REQUESTS <= 0) return true;
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

async function handleGetLogo(request, reply, app) {
  if (!enforceRateLimit(request.ip)) {
    return reply.code(429).send({ ok: false, error: 'Too Many Requests' });
  }

  const width = parseWidth(request.query?.w);
  const url = normalizeUrl(request.query?.url);
  await ensureAddressAllowed(url);

  const cacheKey = buildCacheKey(url.toString(), width);

  let cached;
  try {
    cached = await getObject(cacheKey);
  } catch (error) {
    app.log.error({ err: error, cacheKey }, 'Failed to read cached logo from S3');
    throw new LogoCacheError('Failed to read cached logo from storage', 500, 'S3_GET_FAILED', error);
  }

  if (cached && cached.Body) {
    applyCacheHeaders(reply, buildCacheHeaders(cached.ETag));
    if (cached.LastModified instanceof Date) {
      reply.header('Last-Modified', cached.LastModified.toUTCString());
    } else if (cached.LastModified) {
      reply.header('Last-Modified', new Date(cached.LastModified).toUTCString());
    }
    if (typeof cached.ContentLength === 'number') {
      reply.header('Content-Length', String(cached.ContentLength));
    }
    return reply.send(cached.Body);
  }

  const result = await fetchAndCache(url, width, cacheKey, app.log);
  applyCacheHeaders(reply, buildCacheHeaders(result.etag));
  reply.header('Content-Length', String(result.buffer.length));
  return reply.send(result.buffer);
}

async function handlePrewarm(request, reply, app) {
  if (!enforceRateLimit(request.ip)) {
    return reply.code(429).send({ ok: false, error: 'Too Many Requests' });
  }

  const items = Array.isArray(request.body?.items) ? request.body.items.slice(0, PREWARM_MAX_ITEMS) : null;
  if (!items || items.length === 0) {
    return reply.code(400).send({ ok: false, error: 'Request body must include a non-empty items array' });
  }

  const results = [];

  for (const item of items) {
    const rawUrl = item?.url;
    const rawWidth = item?.w;
    try {
      const width = parseWidth(rawWidth);
      const url = normalizeUrl(rawUrl);
      await ensureAddressAllowed(url);
      const cacheKey = buildCacheKey(url.toString(), width);

      const head = await headObject(cacheKey);
      if (head) {
        results.push({ url: url.toString(), w: width, ok: true, cached: true });
        continue;
      }

      await fetchAndCache(url, width, cacheKey, app.log);
      results.push({ url: url.toString(), w: width, ok: true, cached: false });
    } catch (error) {
      if (error instanceof LogoCacheError) {
        results.push({ url: rawUrl, w: rawWidth, ok: false, error: error.message, code: error.code });
      } else {
        app.log.error({ err: error, url: rawUrl }, 'Unexpected error during logo prewarm');
        results.push({ url: rawUrl, w: rawWidth, ok: false, error: 'Internal error' });
      }
    }
  }

  return reply.send({ ok: true, items: results });
}

function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LogoCacheError) {
      app.log.warn({ err: error, req: { id: request.id } }, 'Logo cache error');
      reply.code(error.statusCode || 500).send({ ok: false, error: error.message, code: error.code });
      return;
    }

    app.log.error({ err: error, req: { id: request.id } }, 'Unexpected error while processing logo request');
    reply.code(500).send({ ok: false, error: 'Internal Server Error' });
  });
}

module.exports = async function logoCacheRoutes(app) {
  registerErrorHandler(app);

  app.get('/api/logo', async (request, reply) => {
    await handleGetLogo(request, reply, app);
  });

  app.post('/api/logo/prewarm', async (request, reply) => {
    await handlePrewarm(request, reply, app);
  });
};
