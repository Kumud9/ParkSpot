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
  assert.equal(regResult.user.accountType, 'DRIVER');
  assert.equal(regResult.user.internalRole, null);

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
  assert.equal(loginResult.user.accountType, 'DRIVER');
  assert.equal(loginResult.user.internalRole, null);

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

  // 5. Register Operator with Organization
  const b2bEmail = `b2bowner-${Date.now()}@test.com`;
  const b2bResult = await authService.register({
    name: 'B2B Owner User',
    email: b2bEmail,
    password: 'Password@123',
    accountType: 'OPERATOR',
    organizationName: 'Global Parking Corp'
  });

  assert.equal(b2bResult.user.accountType, 'OPERATOR');
  assert.equal(b2bResult.user.internalRole, 'OWNER');
  assert.ok(b2bResult.user.organizationId, 'Operator must be linked to an organization');

  // Verify login as Operator returns authoritative accountType and internalRole
  const b2bLogin = await authService.login({
    email: b2bEmail,
    password: 'Password@123'
  });
  assert.equal(b2bLogin.user.accountType, 'OPERATOR');
  assert.equal(b2bLogin.user.internalRole, 'OWNER');

  // Cleanup
  await User.deleteMany({ email: { $in: [email, b2bEmail] } });
  if (b2bResult.user.organizationId) {
    await Organization.deleteOne({ _id: b2bResult.user.organizationId });
  }
});
