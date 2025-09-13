const express = require('express');
const router = express.Router();
const current = require('./current');

router.get('/current', current);

module.exports = router;
