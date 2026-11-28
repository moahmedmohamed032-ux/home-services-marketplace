const express = require('express');
const store = require('../core/store');

const router = express.Router();

// GET /api/professions — all professions with live technician counts.
router.get('/', async (req, res, next) => {
  try {
    res.json({ professions: await store.listProfessions() });
  } catch (err) { next(err); }
});

// GET /api/professions/meta/cities — distinct cities for filter dropdowns.
router.get('/meta/cities', async (req, res, next) => {
  try {
    res.json({ cities: await store.listCities() });
  } catch (err) { next(err); }
});

// GET /api/professions/meta/areas — areas a technician can apply from; `public` says whether customers can already book there.
router.get('/meta/areas', async (req, res, next) => {
  try {
    res.json({ areas: await store.listRegistrationAreas() });
  } catch (err) { next(err); }
});

module.exports = router;
