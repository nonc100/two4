// Web server
const http = require('http');
const express = require('express');
const path = require('path');

// simple .env loader
try {
  const envPath = path.join(__dirname, '..', '..', '.env');
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
const PORT = process.env.WEB_PORT || 3000;

app.use(express.static(__dirname));
app.use('/menu', express.static(path.join(__dirname, 'menu')));
app.use('/seed', express.static(path.join(__dirname, 'seed')));
app.use('/cosmos', express.static(path.join(__dirname, 'cosmos')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`web server on ${PORT}`));
