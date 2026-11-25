const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/technicians?profession=&city=&search=&minRating=&lat=&lng=
// With lat+lng the results carry distanceKm and are ranked nearest-first
// (rating breaks ties) so a client sees the closest suitable pros on top.
router.get('/', (req, res) => {
  const { profession, city, search, minRating, lat, lng } = req.query;
  res.json({ technicians: store.searchTechnicians({ profession, city, search, minRating, lat, lng }).map((t) => store.publicTechnician(t)) });
});

// GET /api/technicians/me — the logged-in technician's own profile.
router.get('/me', authenticate, requireRole('technician'), (req, res, next) => {
  const tech = store.findTechnicianByUserId(req.user.id);
  if (!tech) return next(ApiError.notFound('Technician profile not found'));
  res.json({ technician: store.publicTechnician(tech, { owner: true, withReviews: true }) });
});

// PATCH /api/technicians/me — update own profile.
router.patch('/me', authenticate, requireRole('technician'), (req, res, next) => {
  const tech = store.findTechnicianByUserId(req.user.id);
  if (!tech) return next(ApiError.notFound('Technician profile not found'));
  if (req.body.profession && !store.listProfessions().some((p) => p.id === req.body.profession)) {
    return next(ApiError.badRequest('Unknown profession'));
  }
  const updated = store.updateTechnicianProfile(tech.id, req.body);
  res.json({ technician: store.publicTechnician(updated, { owner: true, withReviews: true }) });
});

// GET /api/technicians/:id — public profile.
router.get('/:id', (req, res, next) => {
  const tech = store.findTechnicianById(req.params.id);
  if (!tech) return next(ApiError.notFound('Technician not found'));
  if (tech.addressActive === false) return next(ApiError.notFound('Technician not found'));
  res.json({ technician: store.publicTechnician(tech, { withReviews: true }) });
});

module.exports = router;
