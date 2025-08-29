// apps/web/menu/server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ------- 디버그 로그 (서버 기동 시 현재 경로 / 파일 목록 출력) -------
console.log('[Two4] __dirname =', __dirname);
try {
  const files = fs.readdirSync(__dirname);
  console.log('[Two4] files in __dirname =', files);
} catch (e) {
  console.log('[Two4] readdir error', e);
}

// ------- 정적 서빙 (menu 폴더 전체) -------
app.use(express.static(__dirname));

// ------- 루트: index.html -------
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------- Fallback: 직접 경로 매핑 (혹시 정적서빙이 안 먹을 때 대비) -------
app.get('/style.css', (_req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});
app.get('/media/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'media', req.params.name));
});

// ------- 상태/디버그 엔드포인트 -------
app.get('/__debug', (_req, res) => {
  const out = {
    dirname: __dirname,
    cwd: process.cwd(),
    files: (() => {
      try { return fs.readdirSync(__dirname); } catch { return 'err'; }
    })(),
    media: (() => {
      try { return fs.readdirSync(path.join(__dirname, 'media')); } catch { return 'err'; }
    })(),
    ts: new Date().toISOString(),
  };
  res.json(out);
});

// ------- start -------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Two4] serving on :${PORT}`);
});

export default app;
