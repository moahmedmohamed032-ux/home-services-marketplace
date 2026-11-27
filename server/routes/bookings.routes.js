const express = require('express');
const store = require('../core/store');
const ApiError = require('../core/ApiError');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireFields, assertRating } = require('../utils/validators');

const router = express.Router();

// POST /api/bookings — client books a technician.
router.post('/', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    requireFields(req.body, ['technicianId', 'date', 'description', 'address']);
    const { technicianId, date, description, address, clientLat, clientLng } = req.body;
    const tech = await store.findTechnicianById(technicianId);
    if (!tech || tech.approved === false) throw ApiError.notFound('Technician not found');
    if (Number.isNaN(Date.parse(date))) throw ApiError.badRequest('Invalid booking date');
    const booking = await store.createBooking({
      clientId: req.user.id, technicianId, date, description, address, clientLat, clientLng,
    });
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/nearest — "nearest available technician": notifies the 3 closest, first to accept wins.
router.post('/nearest', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    requireFields(req.body, ['profession', 'date', 'description', 'address']);
    if (Number.isNaN(Date.parse(req.body.date))) throw ApiError.badRequest('Invalid booking date');
    const { profession, city, date, description, address, clientLat, clientLng } = req.body;
    const out = await store.createNearestRequest({ clientId: req.user.id, profession, city, date, description, address, clientLat, clientLng });
    res.status(201).json(out);
  } catch (err) { next(err); }
});

// POST /api/bookings/:id/choose — customer picks one accepted offer of a nearest request.
router.post('/:id/choose', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    const booking = await store.findBookingById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (booking.clientId !== req.user.id) throw ApiError.forbidden('Not your booking');
    res.json({ booking: await store.chooseNearestOffer(booking) });
  } catch (err) { next(err); }
});

// GET /api/bookings/mine — the client's own bookings.
router.get('/mine', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    res.json({ bookings: await store.bookingsForClient(req.user.id) });
  } catch (err) { next(err); }
});

// GET /api/bookings/incoming — requests addressed to the logged-in technician.
router.get('/incoming', authenticate, requireRole('technician'), async (req, res, next) => {
  try {
    res.json({ bookings: await store.bookingsForTechnician(req.user.id) });
  } catch (err) { next(err); }
});

// PATCH /api/bookings/:id/status — state machine:
//   client: pending|accepted -> cancelled
//   technician: pending -> accepted|declined, accepted -> in_progress -> awaiting_confirmation (+finalAmount)
//   client: awaiting_confirmation -> in_progress (reopen). completed happens when the invoice is paid (cash confirmed by the technician, or online).
router.patch('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!store.BOOKING_STATUS.includes(status)) throw ApiError.badRequest('Unknown status');
    const booking = await store.findBookingById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found');

    if (req.user.role === 'client') {
      if (booking.clientId !== req.user.id) throw ApiError.forbidden('Not your booking');
      if (status === 'completed') {
        throw ApiError.badRequest('A job completes when its invoice is paid');
      } else if (status === 'in_progress') {
        if (booking.status !== 'awaiting_confirmation') throw ApiError.badRequest(`Cannot reopen a ${booking.status} booking`);
      } else {
        if (status !== 'cancelled') throw ApiError.forbidden('Clients can only cancel, confirm or reopen bookings');
        if (!['pending', 'accepted'].includes(booking.status)) {
          throw ApiError.badRequest(`Cannot cancel a ${booking.status} booking`);
        }
      }
    } else {
      const tech = await store.findTechnicianByUserId(req.user.id);
      if (!tech || booking.technicianId !== tech.id) throw ApiError.forbidden('Not your booking');
      if (booking.dispatchId && !booking.chosen && !['accepted', 'declined'].includes(status)) {
        throw ApiError.badRequest('Waiting for the customer to choose a technician');
      }
      const allowed =
        (booking.status === 'pending' && ['accepted', 'declined'].includes(status)) ||
        (booking.status === 'accepted' && status === 'in_progress') ||
        (['accepted', 'in_progress'].includes(booking.status) && status === 'awaiting_confirmation');
      if (!allowed) throw ApiError.badRequest(`Cannot move booking from ${booking.status} to ${status}`);
    }

    const updated = status === 'awaiting_confirmation'
      ? await store.submitFinalAmount(booking, req.body.finalAmount)
      : await store.setBookingStatus(booking, status);
    res.json({ booking: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/review — client reviews a completed booking.
router.post('/:id/review', authenticate, requireRole('client'), async (req, res, next) => {
  try {
    requireFields(req.body, ['rating']);
    assertRating(req.body.rating);
    const booking = await store.findBookingById(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (booking.clientId !== req.user.id) throw ApiError.forbidden('Not your booking');
    if (booking.status !== 'completed') throw ApiError.badRequest('Only completed bookings can be reviewed');
    if (booking.review) throw ApiError.conflict('Booking already reviewed');
    const updated = await store.addReview(booking, req.body);
    res.status(201).json({ booking: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
