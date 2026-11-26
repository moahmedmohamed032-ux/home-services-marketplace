const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/technicians?profession=&city=&search=&minRating=&lat=&lng=
router.get('/', async (req, res, next) => {
  try {
    const { profession, city, search, minRating, lat, lng } = req.query;
    const techs = await store.searchTechnicians({ profession, city, search, minRating, lat, lng });
    const out = [];
    for (const t of techs) out.push(await store.publicTechnician(t));
    res.json({ technicians: out });
  } catch (err) { next(err); }
});

// GET /api/technicians/me — the logged-in technician's own profile.
router.get('/me', authenticate, requireRole('technician'), async (req, res, next) => {
  try {
    const tech = await store.findTechnicianByUserId(req.user.id);
    if (!tech) return next(ApiError.notFound('Technician profile not found'));
    res.json({ technician: await store.publicTechnician(tech, { owner: true, withReviews: true }) });
  } catch (err) { next(err); }
});

// PATCH /api/technicians/me — update own profile.
router.patch('/me', authenticate, requireRole('technician'), async (req, res, next) => {
  try {
    const tech = await store.findTechnicianByUserId(req.user.id);
    if (!tech) return next(ApiError.notFound('Technician profile not found'));
    if (req.body.profession && !(await store.listProfessions()).some((p) => p.id === req.body.profession)) {
      return next(ApiError.badRequest('Unknown profession'));
    }
    const updated = await store.updateTechnicianProfile(tech.id, req.body);
    res.json({ technician: await store.publicTechnician(updated, { owner: true, withReviews: true }) });
  } catch (err) { next(err); }
});

// GET /api/technicians/:id — public profile.
router.get('/:id', async (req, res, next) => {
  try {
    const tech = await store.findTechnicianById(req.params.id);
    if (!tech) return next(ApiError.notFound('Technician not found'));
    if (tech.addressActive === false || tech.approved === false) return next(ApiError.notFound('Technician not found'));
    res.json({ technician: await store.publicTechnician(tech, { withReviews: true }) });
  } catch (err) { next(err); }
});

module.exports = router;
