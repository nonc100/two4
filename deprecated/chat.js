// @deprecated
const express = require('express');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL_ID = process.env.MODEL_ID || 'openrouter/auto';
const OPENROUTER_SITE_URL  = process.env.OPENROUTER_SITE_URL  || 'https://two4-production.up.railway.app';
const OPENROUTER_SITE_NAME = process.env.OPENROUTER_SITE_NAME || 'TWO4 Seed AI';

router.post('/', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });

    const { messages } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_SITE_URL,
        'X-Title': OPENROUTER_SITE_NAME,
      },
      body: JSON.stringify({ model: MODEL_ID, messages, temperature: 0.7, max_tokens: 800 })
    });

    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      return res.status(502).json({ error: 'openrouter upstream', detail: t });
    }

    const data = await r.json();
    res.json({ reply: data?.choices?.[0]?.message?.content || '(no content)' });
  } catch (e) {
    res.status(500).json({ error: 'chat error', detail: String(e) });
  }
});

module.exports = router;
