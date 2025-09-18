'use strict';

const crypto = require('node:crypto');

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const CACHE_CONTROL_HEADER = 'public, max-age=31536000, immutable';
const IMAGE_CONTENT_TYPE = 'image/webp';

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const memoryStore = new Map();
const isS3Enabled = Boolean(bucketName);

let client = null;

if (isS3Enabled) {
  client = new S3Client({
    region,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
  });
} else {
  console.warn('AWS_BUCKET_NAME is not set. Falling back to in-memory logo cache.');
}

function normalizeBody(body) {
  if (body == null) return Buffer.alloc(0);
  return Buffer.isBuffer(body) ? body : Buffer.from(body);
}

function memoryHead(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  return {
    ETag: entry.etag,
    ContentLength: entry.body.length,
    LastModified: entry.lastModified
  };
}

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  return {
    Body: Buffer.from(entry.body),
    ETag: entry.etag,
    ContentLength: entry.body.length,
    LastModified: entry.lastModified
  };
}

async function headObject(key) {
  if (!isS3Enabled) {
    return memoryHead(key);
  }

  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    return result;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.Code === 'NotFound' || error?.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

async function getObject(key) {
  if (!isS3Enabled) {
    return memoryGet(key);
  }

  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    return result;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.Code === 'NoSuchKey' || error?.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

async function putObject(key, body, { cacheControl = CACHE_CONTROL_HEADER, contentType = IMAGE_CONTENT_TYPE } = {}) {
  if (!isS3Enabled) {
    const normalized = normalizeBody(body);
    const etag = `"${crypto.createHash('md5').update(normalized).digest('hex')}"`;
    memoryStore.set(key, {
      body: normalized,
      cacheControl,
      contentType,
      lastModified: new Date(),
      etag
    });
    return { ETag: etag };
  }

  const response = await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      CacheControl: cacheControl,
      ContentType: contentType
    })
  );
  return response;
}

function buildCacheHeaders(etag) {
  const headers = {
    'Cache-Control': CACHE_CONTROL_HEADER,
    'Content-Type': IMAGE_CONTENT_TYPE
  };
  if (etag) headers.ETag = etag;
  return headers;
}

module.exports = {
  client,
  bucketName,
  CACHE_CONTROL_HEADER,
  IMAGE_CONTENT_TYPE,
  headObject,
  getObject,
  putObject,
  buildCacheHeaders
};
