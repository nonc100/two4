const express = require('express');
const router = express.Router();
const price = require('./price');
const ohlc = require('./ohlc');

router.get('/price', price);
router.get('/ohlc', ohlc);

module.exports = router;
