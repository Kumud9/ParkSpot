const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../src');
const { connectDatabase } = require('../src/db');
const { User, Organization } = require('../src/models');
const authService = require('../src/services/auth.service');

function makeRequest(server, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const payload = body !== null ? JSON.stringify(body) : null;
    if (payload !== null) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

test('PARKSPOT SIGNUP VERIFICATION: Secure 2-Step OTP Verification Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const suffix = Date.now();
  const testDriverEmail = `driver-otp-${suffix}@test.com`;
  const testOperatorEmail = `operator-otp-${suffix}@test.com`;
  let driverSignupRes, operatorSignupRes;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: { $in: [testDriverEmail, testOperatorEmail] } });
    if (operatorSignupRes?.user?.organizationId) {
      await Organization.deleteOne({ _id: operatorSignupRes.user.organizationId });
    }
  });

  // 1. Signup creates an unverified account
  await t.test('1. Signup creates an unverified account with PENDING_VERIFICATION status', async () => {
    const res = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Driver Verification Test',
      email: testDriverEmail,
      password: 'StrongPassword@123',
      accountType: 'DRIVER'
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'PENDING_VERIFICATION');
    assert.equal(res.body.requiresVerification, true);
    assert.equal(res.body.user.isVerified, false);
    assert.ok(res.body.verificationToken, 'Should return temporary verificationToken');

    driverSignupRes = res.body;
  });

  // 2. OTP is generated
  await t.test('2. OTP is generated securely upon signup', async () => {
    assert.ok(driverSignupRes.devOtp, 'OTP must be generated');
    assert.equal(driverSignupRes.devOtp.length, 6, 'OTP must be 6 digits');
    assert.match(driverSignupRes.devOtp, /^\d{6}$/, 'OTP must be numeric digits');
  });

  // 3. OTP is stored hashed, never plaintext
  await t.test('3. OTP is stored hashed in MongoDB and never in plaintext', async () => {
    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.ok(dbUser);
    assert.ok(dbUser.verificationOtpHash, 'Hash must exist in MongoDB');
    assert.notEqual(dbUser.verificationOtpHash, driverSignupRes.devOtp, 'MongoDB must never store plaintext OTP');
    assert.ok(dbUser.verificationOtpExpiresAt, 'Expiration timestamp must be recorded in MongoDB');
  });

  // 4. User cannot access protected functionality before verification
  await t.test('4. User cannot access protected functionality with signup token before verification', async () => {
    const protectedRes = await makeRequest(
      server,
      '/api/v1/auth/me',
      'GET',
      driverSignupRes.verificationToken
    );

    assert.equal(protectedRes.status, 403);
    assert.equal(protectedRes.body.error?.code, 'VERIFICATION_REQUIRED');
  });

  // 5. Unverified user cannot log in
  await t.test('5. Unverified user cannot log in before verifying OTP', async () => {
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });

    assert.equal(loginRes.status, 403);
    assert.equal(loginRes.body.error?.code, 'VERIFICATION_REQUIRED');
  });

  // 6. Incorrect OTP is rejected
  await t.test('6. Incorrect OTP is rejected with INVALID_OTP', async () => {
    const verifyRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: '999999'
    });

    assert.equal(verifyRes.status, 400);
    assert.equal(verifyRes.body.error?.code, 'INVALID_OTP');
  });

  // 7. Expired OTP is rejected
  await t.test('7. Expired OTP is rejected with OTP_EXPIRED', async () => {
    await User.updateOne(
      { email: testDriverEmail },
      { verificationOtpExpiresAt: new Date(Date.now() - 1000) }
    );

    const expiredRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: driverSignupRes.devOtp
    });

    assert.equal(expiredRes.status, 400);
    assert.equal(expiredRes.body.error?.code, 'OTP_EXPIRED');

    // Restore expiry
    await User.updateOne(
      { email: testDriverEmail },
      { verificationOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) }
    );
  });

  // 8. Resend cooldown works (within 60s)
  await t.test('8. Resend cooldown blocks rapid repeated OTP generation', async () => {
    const resendRes = await makeRequest(server, '/api/v1/auth/resend-signup-otp', 'POST', null, {
      email: testDriverEmail
    });

    assert.equal(resendRes.status, 429);
    assert.equal(resendRes.body.error?.code, 'OTP_RESEND_COOLDOWN');
  });

  // 9. Resending invalidates previous OTP (simulating cooldown elapsed)
  let activeOtp;
  await t.test('9. Resending after cooldown invalidates previous OTP and generates new OTP', async () => {
    await User.updateOne(
      { email: testDriverEmail },
      { verificationLastSentAt: new Date(Date.now() - 65 * 1000) }
    );

    const resendRes = await makeRequest(server, '/api/v1/auth/resend-signup-otp', 'POST', null, {
      email: testDriverEmail
    });

    assert.equal(resendRes.status, 200);
    assert.ok(resendRes.body.devOtp);
    activeOtp = resendRes.body.devOtp;
    assert.notEqual(activeOtp, driverSignupRes.devOtp);

    // Old OTP must now fail
    const oldOtpRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: driverSignupRes.devOtp
    });
    assert.equal(oldOtpRes.status, 400);
    assert.equal(oldOtpRes.body.error?.code, 'INVALID_OTP');
  });

  // 10. Attempt limit works
  await t.test('10. Attempt limit works and triggers OTP_ATTEMPTS_EXCEEDED after limit', async () => {
    await User.updateOne(
      { email: testDriverEmail },
      { verificationAttempts: 5 }
    );

    const limitRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: activeOtp
    });

    assert.equal(limitRes.status, 400);
    assert.equal(limitRes.body.error?.code, 'OTP_ATTEMPTS_EXCEEDED');

    // Reset attempts to 0 for next tests
    await User.updateOne(
      { email: testDriverEmail },
      { verificationAttempts: 0 }
    );
  });

  // 11. Correct OTP verifies successfully
  let verifiedSessionToken;
  await t.test('11. Correct OTP verifies successfully, activates account, and clears OTP hash', async () => {
    const successRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: activeOtp
    });

    assert.equal(successRes.status, 200);
    assert.equal(successRes.body.status, 'VERIFIED');
    assert.ok(successRes.body.token);
    assert.equal(successRes.body.user.isVerified, true);
    verifiedSessionToken = successRes.body.token;

    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.equal(dbUser.isVerified, true);
    assert.equal(dbUser.verificationOtpHash, null);
    assert.equal(dbUser.verificationOtpExpiresAt, null);
  });

  // 12. Already verified accounts cannot be verified again
  await t.test('12. Already verified accounts cannot be verified again', async () => {
    const reVerifyRes = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testDriverEmail,
      otp: activeOtp
    });

    assert.equal(reVerifyRes.status, 400);
    assert.equal(reVerifyRes.body.error?.code, 'ACCOUNT_ALREADY_VERIFIED');
  });

  // 13. Existing login/authentication works after verification
  await t.test('13. User can log in normally and access protected APIs after verification', async () => {
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });

    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.user.isVerified, true);

    const meRes = await makeRequest(server, '/api/v1/auth/me', 'GET', loginRes.body.token);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.email, testDriverEmail);
  });

  // 14. Both Driver and Operator signup work
  await t.test('14. Operator signup and verification flow functions properly', async () => {
    const opSignup = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Operator Multi Facility',
      email: testOperatorEmail,
      password: 'StrongPassword@123',
      accountType: 'OPERATOR',
      organizationName: `Operator Corp ${suffix}`
    });

    assert.equal(opSignup.status, 201);
    assert.equal(opSignup.body.user.accountType, 'OPERATOR');
    assert.equal(opSignup.body.user.internalRole, 'OWNER');
    assert.equal(opSignup.body.user.isVerified, false);
    operatorSignupRes = opSignup.body;

    const opVerify = await makeRequest(server, '/api/v1/auth/verify-signup', 'POST', null, {
      email: testOperatorEmail,
      otp: opSignup.body.devOtp
    });

    assert.equal(opVerify.status, 200);
    assert.equal(opVerify.body.user.isVerified, true);
    assert.equal(opVerify.body.user.accountType, 'OPERATOR');

    const opLogin = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testOperatorEmail,
      password: 'StrongPassword@123'
    });
    assert.equal(opLogin.status, 200);
    assert.equal(opLogin.body.user.accountType, 'OPERATOR');
  });
});
