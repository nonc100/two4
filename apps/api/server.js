// API server
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
app.use(express.json());
app.use('/api', require('./router'));

const PORT = process.env.API_PORT || 3100;
app.listen(PORT, () => console.log(`api server on ${PORT}`));
