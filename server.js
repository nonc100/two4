const express = require('express');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'apps/web')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'apps/web/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행중입니다.`);
});
