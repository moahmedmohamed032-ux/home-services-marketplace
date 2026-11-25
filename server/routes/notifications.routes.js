const express = require('express');
const store = require('../core/store');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — latest notifications for the logged-in user + unread count.
router.get('/', authenticate, async (req, res, next) => {
  try { res.json(await store.notificationsFor(req.user.id)); } catch (err) { next(err); }
});

// POST /api/notifications/read — mark some (body.ids) or all as read.
router.post('/read', authenticate, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(String) : null;
    res.json({ marked: await store.markNotificationsRead(req.user.id, ids) });
  } catch (err) { next(err); }
});

module.exports = router;
