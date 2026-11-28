const express = require('express');
const dental = require('../core/dental');
const rateLimiter = require('../middleware/rateLimiter');
const cache = require('../core/cache');
const { authenticate, requireRole } = require('../middleware/auth');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };

const pub = express.Router();
const gated = (fn) => [async (req, res, next) => { try { await dental.requirePublic(); next(); } catch (e) { next(e); } }, wrap(fn)];
pub.get('/status', wrap(async (req, res) => res.json({ enabled: await dental.isPublic() })));
// Registration form needs the guide ranges (to validate prices); nothing else is public while the guide is dark.
pub.get('/register-options', wrap(async (req, res) => res.json({ procedures: (await dental.listProcedures()).map((p) => ({ id: p.id, nameAr: p.nameAr, min: p.min, max: p.max })) })));
pub.get('/procedures', ...gated(async (req, res) => res.json({ procedures: await dental.listProcedures(), cities: await dental.cityCounts() })));
pub.get('/clinics', ...gated(async (req, res) => res.json({ clinics: await dental.listClinics({ city: req.query.city, procedure: req.query.procedure }) })));
pub.get('/clinics/:id', ...gated(async (req, res) => res.json({ clinic: await dental.getClinic(req.params.id) })));
pub.post('/clinics', rateLimiter, wrap(async (req, res) => res.status(201).json({ clinic: await dental.registerClinic(req.body || {}) })));
pub.post('/appointments', rateLimiter, ...gated(async (req, res) => res.status(201).json({ appointment: await dental.createAppointment(req.body || {}) })));

const admin = express.Router();
admin.use(authenticate, requireRole('admin'));
admin.get('/procedures', wrap(async (req, res) => res.json({ procedures: await dental.listProcedures() })));
admin.get('/clinics', wrap(async (req, res) => res.json({ clinics: await dental.adminClinics() })));
admin.patch('/clinics/:id', wrap(async (req, res) => res.json({ clinic: await dental.adminUpdateClinic(req.params.id, req.body || {}) })));
admin.get('/providers', wrap(async (req, res) => res.json(await dental.adminProviders(req.query))));
admin.patch('/providers/:id', wrap(async (req, res) => res.json({ provider: await dental.adminUpdateProvider(req.params.id, req.body || {}) })));
admin.get('/appointments', wrap(async (req, res) => res.json({ appointments: await dental.adminAppointments() })));
admin.patch('/appointments/:id', wrap(async (req, res) => res.json({ appointment: await dental.adminUpdateAppointment(req.params.id, req.body || {}) })));
admin.patch('/procedures/:id', wrap(async (req, res) => res.json({ procedure: await dental.adminUpdateProcedure(req.params.id, req.body || {}) })));

const directory = express.Router();
directory.get('/suggest', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  const q = String(req.query.q || '').slice(0, 100);
  res.json(await cache.wrap('dir', `s:${q}`, async () => ({ suggestions: await dental.directorySuggest(req.query.q) })));
}));
directory.get('/', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  const key = `d:${JSON.stringify(Object.keys(req.query).sort().map((k) => [k, String(req.query[k]).slice(0, 100)])).slice(0, 400)}`;
  res.json(await cache.wrap('dir', key, () => dental.publicDirectory(req.query)));
}));

module.exports = { pub, admin, directory };
