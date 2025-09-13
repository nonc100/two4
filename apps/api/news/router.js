const express = require('express');
const router = express.Router();
const headlines = require('./headlines');

router.get('/headlines', headlines);

module.exports = router;
