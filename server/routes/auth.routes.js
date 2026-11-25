const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { hashPassword, comparePassword, signToken } = require('../utils/crypto');
const { requireFields, assertEmail, assertPassword, assertRole } = require('../utils/validators');
const rateLimiter = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function authPayload(user) {
  return { token: signToken(user), user: store.publicUser(user) };
}

// POST /api/auth/register — creates a client or a technician (with profile).
router.post('/register', rateLimiter, async (req, res, next) => {
  try {
    requireFields(req.body, ['name', 'email', 'password', 'role']);
    const { name, email, password, role, city, profession, yearsExperience, hourlyRate, bio, lat, lng, phone, phonePublic, address, addressActive } = req.body;
    assertEmail(email);
    assertPassword(password);
    assertRole(role);
    if (await store.findUserByEmail(email)) throw ApiError.conflict('Email is already registered');
    if (role === 'technician') {
      requireFields(req.body, ['profession']);
      if (!(await store.listProfessions()).some((p) => p.id === profession)) {
        throw ApiError.badRequest('Unknown profession');
      }
    }

    const user = await store.createUser({
      name: String(name).trim(), email: String(email).trim(),
      passwordHash: await hashPassword(password), role, city, lat, lng,
    });
    if (role === 'technician') {
      await store.createTechnicianProfile(user, { profession, city, yearsExperience, hourlyRate, bio, lat, lng, phone, phonePublic, address, addressActive });
    }
    res.status(201).json(authPayload(user));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', rateLimiter, async (req, res, next) => {
  try {
    requireFields(req.body, ['email', 'password']);
    const { email, password } = req.body;
    const user = await store.findUserByEmail(email);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Wrong email or password');
    }
    if (user.active === false) throw ApiError.unauthorized('Account is deactivated');
    res.json(authPayload(user));
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — current session user (+ technician profile if any).
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const technician = (await store.findTechnicianByUserId(req.user.id)) || null;
    res.json({ user: store.publicUser(req.user), technician: technician ? await store.publicTechnician(technician, { owner: true, withReviews: true }) : null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
