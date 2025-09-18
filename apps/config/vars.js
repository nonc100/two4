export const CONFIG = {
  adminToken: process.env.ADMIN_TOKEN,
  modelId: process.env.MODEL_ID,

  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.AWS_BUCKET_NAME,
    region: process.env.AWS_REGION,
  },

  binance: process.env.BINANCE_API_KEY,
  coingecko: process.env.COINGECKO_API_KEY,
  newsdata: process.env.NEWSDATA_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,

  mongoUri: process.env.MONGODB_URI,
};
