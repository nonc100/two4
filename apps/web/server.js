// apps/web/server.js  (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;

// /apps/web 폴더 정적 서빙 (index.html 포함)
app.use(express.static(__dirname));

// SPA 라우팅(필요 시): 기타 경로는 index.html로
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log(`✅ web server listening on ${PORT}`));
