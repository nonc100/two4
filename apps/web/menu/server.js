// apps/web/menu/server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 폴더 경로
const MENU_DIR = __dirname;                  // apps/web/menu
const WEB_DIR  = path.join(__dirname, '..'); // apps/web
const MEDIA_DIR = path.join(WEB_DIR, 'media');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 디버그 로그
console.log('[Two4] MENU_DIR =', MENU_DIR);
console.log('[Two4] WEB_DIR  =', WEB_DIR);
try {
  console.log('[Two4] files in MENU_DIR =', fs.readdirSync(MENU_DIR));
  console.log('[Two4] files in WEB_DIR  =', fs.readdirSync(WEB_DIR));
} catch (e) { console.log('[Two4] readdir error', e); }

// ✅ 정적 서빙: menu 먼저, 그 다음 web(부모)도 함께
app.use(express.static(MENU_DIR));     // /menu/* html들
app.use(express.static(WEB_DIR));      // /style.css, /index.html 등
app.use('/media', express.static(MEDIA_DIR)); // /media/*

// 루트는 부모(web)의 index.html 반환
app.get('/', (_req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// 상태/디버그
app.get('/__debug', (_req, res) => {
  const out = {
    MENU_DIR, WEB_DIR, MEDIA_DIR,
    menuFiles: (() => { try { return fs.readdirSync(MENU_DIR) } catch { return 'err' } })(),
    webFiles:  (() => { try { return fs.readdirSync(WEB_DIR)  } catch { return 'err' } })(),
    mediaFiles:(() => { try { return fs.readdirSync(MEDIA_DIR)} catch { return 'err' } })(),
    ts: new Date().toISOString(),
  };
  res.json(out);
});

app.listen(PORT, '0.0.0.0', () => console.log(`[Two4] serving on :${PORT}`));

export default app;
