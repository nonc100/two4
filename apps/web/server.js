const express = require("express");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;

// static 파일 서빙
app.use(express.static(path.join(__dirname)));

// 모든 요청을 index.html로 라우팅
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
