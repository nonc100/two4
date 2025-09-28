// apps/web/menu/server.js (Node.js only)
import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.COSMOS_PORT || process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname)); // menu 폴더 정적 서빙
app.use("/media", express.static(path.join(__dirname, "..", "media")));

// ✅ Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "two4-cosmos", at: Date.now() });
});

// ✅ 안전한 파일 경로 처리
const ROOT = __dirname;
function safePath(relPath) {
  if (!relPath) throw new Error("path required");
  let p = String(relPath).replace(/^[/\\]+/, "");
  if (p.startsWith("apps/web/")) p = p.slice("apps/web/".length);
  const abs = path.join(ROOT, p);
  if (!abs.startsWith(ROOT)) throw new Error("path out of bounds");
  return abs;
}

// ✅ 파일 읽기
app.get("/fs/read", async (req, res) => {
  try {
    const abs = safePath(req.query.path);
    const data = await fs.readFile(abs, "utf8");
    res.json({ ok: true, path: req.query.path, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ✅ 파일 저장
app.post("/fs/save", async (req, res) => {
  try {
    const { path: p, content = "" } = req.body || {};
    const abs = safePath(p);
    await fs.writeFile(abs, content, "utf8");
    res.json({ ok: true, path: p, bytes: Buffer.byteLength(content, "utf8") });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 404 처리
app.use((req, res, next) => {
  if (req.accepts("html")) return next();
  res.status(404).end();
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Menu server running at http://localhost:${PORT}`);
});