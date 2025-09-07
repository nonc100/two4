// apps/web/menu/server.js
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); // npm i node-fetch 필요 (구버전일 경우 require 가능)
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // .env에 정의해줘야 함
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // .env에 정의해줘야 함

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 💡 정적 파일 라우트 (예: /menu/*.html, /tidewave)
app.use(express.static(path.join(__dirname)));
app.use('/tidewave', express.static(path.join(__dirname, 'tidewave')));

// 🩺 Health Check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'two4-cosmos', at: Date.now() });
});

// 📂 Read file API
app.get('/fs/read', (req, res) => {
  const filePath = path.resolve(__dirname, '../../..', req.query.path || '');
  if (!fs.existsSync(filePath)) return res.json({ ok: false, error: 'File not found' });

  const content = fs.readFileSync(filePath, 'utf8');
  res.json({ ok: true, data: content });
});

// 💾 Save file API
app.post('/fs/save', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ ok: false, error: 'Invalid token' });

  const { path: relativePath, content } = req.body;
  const filePath = path.resolve(__dirname, '../../..', relativePath || '');
  fs.writeFileSync(filePath, content, 'utf8');

  res.json({ ok: true, bytes: content.length });
});

// 🤖 AI API (Claude via OpenRouter)
app.post('/ai/claude', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ ok: false, error: 'Invalid token' });

  const { prompt } = req.body;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mixtral-8x7b', // or gpt-4, claude-2, etc.
        messages: [
          { role: 'system', content: '너는 코드 수정 비서야. 사용자의 지시를 코드 수정 명령처럼 해석해.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '응답 없음';
    res.json({ ok: true, text });
  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

// 🚀 서버 시작
app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});
