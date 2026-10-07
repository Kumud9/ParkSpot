const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const lotRoutes = require('./routes/lots');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const v1Routes = require('./routes/v1');

const { globalLimiter } = require('./middleware/rateLimit');
const { errorHandler } = require('./errors');
const { connectDatabase } = require('./db');
const { startLifecycleWorker, stopLifecycleWorker } = require('./services/booking.service');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured.');
}

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'parkspot-api'
  });
});

// Liveness Health Check (exempt from rate limits)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Readiness Health Check (Verifies database connectivity safely)
app.get('/api/health/ready', async (_req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    if (!isConnected) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }

    // Ping the active database
    await mongoose.connection.db.admin().ping();

    res.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Global API rate limiter
app.use('/api', globalLimiter);

// Mount Legacy/Backward-compatible routes for existing client
app.use('/api/auth', authRoutes);
app.use('/api/lots', lotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/vehicles', require('./routes/v1/vehicle.routes'));
app.use('/api/admin', adminRoutes);

// Mount Version 1 B2B routes
app.use('/api/v1', v1Routes);

// Fallback 404 handler
app.use((_req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } })
);

// Centralized error handler
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
const host = '0.0.0.0';

if (require.main === module) {
  connectDatabase()
    .then(() => {
      app.listen(port, host, () => {
        console.log(`ParkSpot API listening on ${host}:${port}`);
        startLifecycleWorker(60000);
      });
    })
    .catch((error) => {
      console.error('Unable to connect to MongoDB.', error);
      process.exit(1);
    });
}

module.exports = { app, startLifecycleWorker, stopLifecycleWorker };
