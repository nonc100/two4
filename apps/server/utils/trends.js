const express = require('express');
const Parser = require('rss-parser');
const router = express.Router();
const parser = new Parser();

// GET /api/trends
router.get('/', async (_req, res) => {
  try {
    const feed = await parser.parseURL('https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR');
    const items = (feed.items || []).slice(0, 10).map(i => ({
      title: i.title, link: i.link, pubDate: i.pubDate
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'trends fetch failed' });
  }
});

module.exports = router;
