const Parser = require('rss-parser');
const parser = new Parser();

const feeds = {
  newsflash: 'https://rss.naver.com/newsflash.rss',
  economy:   'https://rss.naver.com/economy/economy_general.rss',
  politics:  'https://rss.naver.com/politics/politics_general.rss',
  society:   'https://rss.naver.com/society/society_general.rss',
  world:     'https://rss.naver.com/world/world_general.rss',
  it:        'https://rss.naver.com/science/science_general.rss'
};

module.exports = async function headlines(req, res) {
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
};
