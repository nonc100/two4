// External API providers and keys
module.exports = {
  binance: {
    base: 'https://api.binance.com',
    key: process.env.BINANCE_API_KEY || ''
  },
  openMeteo: {
    base: 'https://api.open-meteo.com/v1'
  },
  naver: {
    base: 'https://rss.naver.com'
  }
};
