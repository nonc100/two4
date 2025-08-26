// apps/web/server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일(index.html, css, 이미지 등)을 /apps/web에서 서빙
app.use(express.static(path.join(__dirname)));

// 모든 라우트는 index.html로 보내서 SPA도 동작
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
