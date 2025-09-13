const express = require('express');
const router = express.Router();

router.use('/finance', require('./finance/router'));
router.use('/weather', require('./weather/router'));
router.use('/news', require('./news/router'));
router.use('/new', require('./new/router'));

module.exports = router;
