// Gateway server
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');

// simple .env loader
try {
  const envPath = path.join(__dirname, '.env');
  require('fs').readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
} catch {}

const app = express();

function proxy(target) {
  return (req, res) => {
    const url = new URL(req.originalUrl, target);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = { method: req.method, headers: { ...req.headers, host: url.host } };
    const p = lib.request(url, opts, pr => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res, { end: true });
    });
    req.pipe(p, { end: true });
  };
}

app.use('/api', proxy('http://localhost:3100'));
app.use('/', proxy('http://localhost:3000'));

const PORT = process.env.PORT || 3200;
app.listen(PORT, () => console.log(`gateway on ${PORT}`));
