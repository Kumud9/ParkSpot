const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { User, Organization } = require('../src/models');
const authService = require('../src/services/auth.service');

test('auth: registration, login, and B2B role credentials verification', async () => {
  await connectDatabase();

  const email = `authtest-${Date.now()}@test.com`;

  // 1. Register new consumer driver user
  const regResult = await authService.register({
    name: 'Test Consumer',
    email,
    password: 'Password@123',
    role: 'USER'
  });

  assert.ok(regResult.token, 'Registration must return a JWT');
  assert.equal(regResult.user.email, email);
  assert.equal(regResult.user.role, 'USER');

  // 2. Reject duplicate email registration
  await assert.rejects(
    async () => {
      await authService.register({
        name: 'Duplicate User',
        email,
        password: 'Password@123'
      });
    },
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'EMAIL_IN_USE');
      return true;
    }
  );

  // 3. Login with correct credentials
  const loginResult = await authService.login({
    email,
    password: 'Password@123'
  });
  assert.ok(loginResult.token, 'Login must return a JWT');
  assert.equal(loginResult.user.email, email);

  // 4. Reject login with invalid password
  await assert.rejects(
    async () => {
      await authService.login({
        email,
        password: 'WrongPassword@123'
      });
    },
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'INVALID_CREDENTIALS');
      return true;
    }
  );

  // 5. Register B2B Owner with Organization
  const b2bEmail = `b2bowner-${Date.now()}@test.com`;
  const b2bResult = await authService.register({
    name: 'B2B Owner User',
    email: b2bEmail,
    password: 'Password@123',
    organizationName: 'Global Parking Corp',
    role: 'OWNER'
  });

  assert.equal(b2bResult.user.role, 'OWNER');
  assert.ok(b2bResult.user.organizationId, 'B2B owner must be linked to an organization');

  // Cleanup
  await User.deleteMany({ email: { $in: [email, b2bEmail] } });
  if (b2bResult.user.organizationId) {
    await Organization.deleteOne({ _id: b2bResult.user.organizationId });
  }
});
