'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const CACHE_CONTROL_HEADER = 'public, max-age=31536000, immutable';
const IMAGE_CONTENT_TYPE = 'image/webp';

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!bucketName) {
  throw new Error('AWS_BUCKET_NAME must be configured to use the logo cache');
}

const client = new S3Client({
  region,
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
});

async function headObject(key) {
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
