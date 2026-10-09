process.env.NODE_ENV = 'test';
const test = require('node:test');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.disconnect();
});

// Import all modular test suites
require('./booking.test');
require('./auth.test');
require('./b2b_domain.test');
require('./concurrency.test');
require('./lifecycle.test');
require('./search_redos.test');
require('./tenant_isolation.test');
require('./health.test');
require('./phase2_2.test');
require('./analytics.test');
require('./optimization.test');
require('./phase3_1.test');
require('./phase3_2.test');
require('./phase4_4.test');
require('./rbac_account_model.test');
require('./driver_experience_features.test');
require('./signup_verification.test');
require('./totp_mfa.test');
require('./operator_onboarding.test');
require('./payment_flow.test');
