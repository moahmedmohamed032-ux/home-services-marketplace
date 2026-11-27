const express = require('express');
const dental = require('../core/dental');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate, requireRole } = require('../middleware/auth');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };

const pub = express.Router();
pub.get('/procedures', wrap(async (req, res) => res.json({ procedures: await dental.listProcedures(), cities: await dental.cityCounts() })));
pub.get('/clinics', wrap(async (req, res) => res.json({ clinics: await dental.listClinics({ city: req.query.city, procedure: req.query.procedure }) })));
pub.get('/clinics/:id', wrap(async (req, res) => res.json({ clinic: await dental.getClinic(req.params.id) })));
pub.post('/clinics', rateLimiter, wrap(async (req, res) => res.status(201).json({ clinic: await dental.registerClinic(req.body || {}) })));
pub.post('/appointments', rateLimiter, wrap(async (req, res) => res.status(201).json({ appointment: await dental.createAppointment(req.body || {}) })));

const admin = express.Router();
admin.use(authenticate, requireRole('admin'));
admin.get('/clinics', wrap(async (req, res) => res.json({ clinics: await dental.adminClinics() })));
admin.patch('/clinics/:id', wrap(async (req, res) => res.json({ clinic: await dental.adminUpdateClinic(req.params.id, req.body || {}) })));
admin.get('/appointments', wrap(async (req, res) => res.json({ appointments: await dental.adminAppointments() })));
admin.patch('/appointments/:id', wrap(async (req, res) => res.json({ appointment: await dental.adminUpdateAppointment(req.params.id, req.body || {}) })));
admin.patch('/procedures/:id', wrap(async (req, res) => res.json({ procedure: await dental.adminUpdateProcedure(req.params.id, req.body || {}) })));

module.exports = { pub, admin };
