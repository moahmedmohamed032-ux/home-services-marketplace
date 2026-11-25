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
    requireFields(req.body, ['name', 'password', 'role']);
    const { name, password, role, city, profession, yearsExperience, hourlyRate, bio, lat, lng, phone, phonePublic, address, addressActive } = req.body;
    const email = String(req.body.email || '').trim();
    assertPassword(password);
    assertRole(role);
    // Email is optional: a valid Egyptian mobile number is enough to register and log in.
    if (!email && !String(phone || '').trim()) throw ApiError.badRequest('Enter a mobile number or an email address');
    if (email) {
      assertEmail(email);
      if (await store.findUserByEmail(email)) throw ApiError.conflict('Email is already registered');
    }
    if (String(phone || '').trim()) {
      if (!store.isEgPhone(phone)) throw ApiError.badRequest('Enter a valid Egyptian mobile number (e.g. 01012345678)');
      if (await store.findUserByPhone(phone)) throw ApiError.conflict('Phone number is already registered');
    }
    if (role === 'technician') {
      requireFields(req.body, ['profession', 'phone']);
      if (!(await store.listProfessions()).some((p) => p.id === profession)) {
        throw ApiError.badRequest('Unknown profession');
      }
    }

    const user = await store.createUser({
      name: String(name).trim(), email, phone: String(phone || '').trim() ? phone : undefined,
      passwordHash: await hashPassword(password), role, city, lat, lng,
    });
    if (role === 'technician') {
      await store.createTechnicianProfile(user, { profession, city, yearsExperience, hourlyRate, bio, lat, lng, phone: store.normalizePhone(phone), phonePublic, address, addressActive });
    }
    res.status(201).json(authPayload(user));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', rateLimiter, async (req, res, next) => {
  try {
    const identifier = req.body.identifier || req.body.email;
    requireFields({ identifier, password: req.body.password }, ['identifier', 'password']);
    const { password } = req.body;
    const user = await store.findUserByLogin(identifier);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Wrong email/phone or password');
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

// POST /api/auth/change-password — signed-in user changes their own password.
router.post('/change-password', rateLimiter, authenticate, async (req, res, next) => {
  try {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const { currentPassword, newPassword } = req.body;
    assertPassword(newPassword);
    if (String(newPassword).length > 128) throw ApiError.badRequest('Password is too long');
    const user = await store.findUserById(req.user.id);
    if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is wrong');
    }
    await store.setUserPassword(user.id, await hashPassword(newPassword));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
