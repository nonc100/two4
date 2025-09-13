const express = require('express');
const Parser = require('rss-parser');
const router = express.Router();
const parser = new Parser();

// 네이버 주요 카테고리 RSS (키 불필요)
const feeds = {
  newsflash: "https://rss.naver.com/newsflash.rss",
  economy:   "https://rss.naver.com/economy/economy_general.rss",
  politics:  "https://rss.naver.com/politics/politics_general.rss",
  society:   "https://rss.naver.com/society/society_general.rss",
  world:     "https://rss.naver.com/world/world_general.rss",
  it:        "https://rss.naver.com/science/science_general.rss",
};

// GET /api/news?cat=newsflash
router.get('/', async (req, res) => {
  const cat = req.query.cat || 'newsflash';
  const url = feeds[cat] || feeds.newsflash;

  try {
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 8).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    res.json({ category: cat, items });
  } catch (e) {
    res.status(500).json({ error: 'news fetch failed' });
  }
});

module.exports = router;
