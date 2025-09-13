# Web Application

This directory contains the main web app and a Cosmos crypto dashboard under `menu/cosmos`.

## Installing dependencies

Install the main app packages:

```bash
cd apps/web
npm install
```

The Cosmos dashboard has its own `package.json`. Install its packages separately:

```bash
cd apps/web/menu/cosmos
npm install
```

To avoid nested installs, you can move the Cosmos dependencies into `apps/web/package.json` and manage them with the main app.

## Running

Start the web server from this directory:

```bash
npm start
```

After installing its dependencies, you can run the Cosmos dashboard by executing `node server.js` inside `menu/cosmos`.
