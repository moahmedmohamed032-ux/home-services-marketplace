const express = require('express');
const store = require('../core/store');

const router = express.Router();

// GET /api/professions — all professions with live technician counts.
router.get('/', (req, res) => {
  res.json({ professions: store.listProfessions() });
});

// GET /api/professions/meta/cities — distinct cities for filter dropdowns.
router.get('/meta/cities', (req, res) => {
  res.json({ cities: store.listCities() });
});

module.exports = router;
