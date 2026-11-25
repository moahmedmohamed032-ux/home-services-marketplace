const express = require('express');
const cors = require('cors');
const logger = require('./core/logger');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./core/ApiError');

const authRoutes = require('./routes/auth.routes');
const professionRoutes = require('./routes/professions.routes');
const technicianRoutes = require('./routes/technicians.routes');
const bookingRoutes = require('./routes/bookings.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(logger);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'fanni-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/professions', professionRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/bookings', bookingRoutes);

app.use('/api', (req, res, next) => next(ApiError.notFound(`No route: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

module.exports = app;
