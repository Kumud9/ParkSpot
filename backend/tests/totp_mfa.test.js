const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../src');
const { connectDatabase } = require('../src/db');
const { User, Organization } = require('../src/models');
const totpService = require('../src/services/totp.service');

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

test('PARKSPOT TOTP 2FA: Authenticator Two-Factor Authentication Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const suffix = Date.now();
  const testDriverEmail = `driver-totp-${suffix}@test.com`;
  const testOperatorEmail = `operator-totp-${suffix}@test.com`;

  let driverSignupRes, operatorSignupRes;
  let driverRawSecret, driverRecoveryCodes;
  let driverSessionToken;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: { $in: [testDriverEmail, testOperatorEmail] } });
    if (operatorSignupRes?.user?.organizationId) {
      await Organization.deleteOne({ _id: operatorSignupRes.user.organizationId });
    }
  });

  // ==========================================
  // SIGNUP & ENROLLMENT TESTS
  // ==========================================

  await t.test('1. Valid signup returns setup challenge with QR data URL, manual key, and recovery codes', async () => {
    const res = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Driver TOTP User',
      email: testDriverEmail,
      password: 'StrongPassword@123',
      accountType: 'DRIVER'
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.requiresMfaSetup, true);
    assert.equal(res.body.user.isVerified, false);
    assert.equal(res.body.user.mfaEnabled, false);
    assert.ok(res.body.setupToken, 'Must provide short-lived setupToken');
    assert.ok(res.body.qrCodeDataUrl, 'Must return real QR code Data URL');
    assert.match(res.body.qrCodeDataUrl, /^data:image\/png;base64,/, 'QR must be PNG base64 data URL');
    assert.ok(res.body.manualSetupKey, 'Must provide setup key for manual entry');
    assert.ok(Array.isArray(res.body.recoveryCodes), 'Must provide backup recovery codes');
    assert.equal(res.body.recoveryCodes.length, 8, 'Must provide 8 recovery codes');

    driverSignupRes = res.body;
    driverRawSecret = res.body.manualSetupKey;
    driverRecoveryCodes = res.body.recoveryCodes;
  });

  await t.test('2. TOTP secret is encrypted at rest in MongoDB and never stored plaintext', async () => {
    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.ok(dbUser);
    assert.ok(dbUser.totpSecretEncrypted, 'Encrypted secret must exist');
    assert.ok(dbUser.totpSecretIv, 'IV nonce must exist');
    assert.ok(dbUser.totpSecretAuthTag, 'Authentication tag must exist');
    assert.notEqual(dbUser.totpSecretEncrypted, driverRawSecret, 'Database must never store plaintext secret');

    // Decrypt and confirm secret integrity
    const decrypted = totpService.decryptSecret({
      encrypted: dbUser.totpSecretEncrypted,
      iv: dbUser.totpSecretIv,
      tag: dbUser.totpSecretAuthTag
    });
    assert.equal(decrypted, driverRawSecret, 'Decrypted secret must match generated secret');
  });

  await t.test('3. Recovery codes are stored only as SHA-256 hashes, never plaintext', async () => {
    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.ok(Array.isArray(dbUser.mfaRecoveryCodeHashes));
    assert.equal(dbUser.mfaRecoveryCodeHashes.length, 8);

    for (const code of driverRecoveryCodes) {
      assert.ok(!dbUser.mfaRecoveryCodeHashes.includes(code), 'Plaintext code must NOT be in DB');
    }
  });

  await t.test('4. Setup challenge token cannot access protected APIs', async () => {
    const protectedRes = await makeRequest(server, '/api/v1/auth/me', 'GET', driverSignupRes.setupToken);
    assert.equal(protectedRes.status, 403);
    assert.equal(protectedRes.body.error?.code, 'VERIFICATION_REQUIRED');
  });

  await t.test('5. Invalid TOTP code is rejected during setup', async () => {
    const res = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: driverSignupRes.setupToken,
      code: '000000'
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'INVALID_OTP');
  });

  await t.test('6. Valid TOTP code verifies setup, enables MFA, and activates account', async () => {
    // Generate valid TOTP token from raw secret
    const validCode = totpService.generateCurrentTotp(driverRawSecret);

    const res = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: driverSignupRes.setupToken,
      code: validCode
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'VERIFIED');
    assert.ok(res.body.token, 'Must return full session JWT');
    assert.equal(res.body.user.isVerified, true);
    assert.equal(res.body.user.mfaEnabled, true);

    // Verify secret is NOT returned in user payload
    assert.equal(res.body.user.totpSecretEncrypted, undefined);
    assert.equal(res.body.user.manualSetupKey, undefined);

    driverSessionToken = res.body.token;

    // Check DB state
    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.equal(dbUser.isVerified, true);
    assert.equal(dbUser.mfaEnabled, true);
    assert.ok(dbUser.mfaVerifiedAt);
  });

  await t.test('7. Authenticated user can access protected /me API with issued JWT', async () => {
    const res = await makeRequest(server, '/api/v1/auth/me', 'GET', driverSessionToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, testDriverEmail);
    assert.equal(res.body.user.isVerified, true);
    assert.equal(res.body.user.mfaEnabled, true);
    assert.equal(res.body.user.totpSecretEncrypted, undefined);
  });

  await t.test('8. Completed setup challenge cannot be verified again', async () => {
    const validCode = totpService.generateCurrentTotp(driverRawSecret);
    const res = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: driverSignupRes.setupToken,
      code: validCode
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'ACCOUNT_ALREADY_VERIFIED');
  });

  // ==========================================
  // LOGIN 2FA FLOW TESTS
  // ==========================================

  let loginMfaToken;

  await t.test('9. Password login with MFA enabled produces short-lived MFA challenge (NO session JWT yet)', async () => {
    const res = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.requiresMfa, true);
    assert.equal(res.body.status, 'MFA_REQUIRED');
    assert.ok(res.body.mfaToken, 'Must provide short-lived mfaToken challenge');
    assert.equal(res.body.token, undefined, 'Session JWT must NOT be issued before MFA verification');

    loginMfaToken = res.body.mfaToken;
  });

  await t.test('10. MFA challenge token cannot access protected endpoints', async () => {
    const res = await makeRequest(server, '/api/v1/auth/me', 'GET', loginMfaToken);
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'VERIFICATION_REQUIRED');
  });

  await t.test('11. Incorrect code on /mfa/verify-login is rejected', async () => {
    const res = await makeRequest(server, '/api/v1/auth/mfa/verify-login', 'POST', null, {
      mfaToken: loginMfaToken,
      code: '123456'
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'INVALID_OTP');
  });

  await t.test('12. Valid TOTP code completes login and issues full session JWT', async () => {
    const validCode = totpService.generateCurrentTotp(driverRawSecret);
    const res = await makeRequest(server, '/api/v1/auth/mfa/verify-login', 'POST', null, {
      mfaToken: loginMfaToken,
      code: validCode
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token, 'Must issue session JWT');
    assert.equal(res.body.user.email, testDriverEmail);
  });

  // ==========================================
  // BACKUP RECOVERY CODE TESTS
  // ==========================================

  await t.test('13. Valid backup recovery code authenticates user and burns the code', async () => {
    // Initiate fresh login to get an MFA challenge
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });
    assert.ok(loginRes.body.mfaToken);

    const firstRecoveryCode = driverRecoveryCodes[0];

    const recoveryRes = await makeRequest(server, '/api/v1/auth/mfa/verify-recovery', 'POST', null, {
      mfaToken: loginRes.body.mfaToken,
      recoveryCode: firstRecoveryCode
    });

    assert.equal(recoveryRes.status, 200);
    assert.equal(recoveryRes.body.success, true);
    assert.ok(recoveryRes.body.token, 'Must issue session JWT upon recovery verification');

    // Confirm that the code is consumed in MongoDB (7 remaining out of 8)
    const dbUser = await User.findOne({ email: testDriverEmail });
    assert.equal(dbUser.mfaRecoveryCodeHashes.length, 7);
  });

  await t.test('14. Used recovery code is permanently burned and cannot be reused', async () => {
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });

    const usedRecoveryCode = driverRecoveryCodes[0];

    const reuseRes = await makeRequest(server, '/api/v1/auth/mfa/verify-recovery', 'POST', null, {
      mfaToken: loginRes.body.mfaToken,
      recoveryCode: usedRecoveryCode
    });

    assert.equal(reuseRes.status, 400);
    assert.equal(reuseRes.body.error?.code, 'INVALID_RECOVERY_CODE');
  });

  await t.test('15. Invalid recovery code format or non-existent code is rejected', async () => {
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testDriverEmail,
      password: 'StrongPassword@123'
    });

    const fakeRes = await makeRequest(server, '/api/v1/auth/mfa/verify-recovery', 'POST', null, {
      mfaToken: loginRes.body.mfaToken,
      recoveryCode: 'DEAD-BEEF'
    });

    assert.equal(fakeRes.status, 400);
    assert.equal(fakeRes.body.error?.code, 'INVALID_RECOVERY_CODE');
  });

  // ==========================================
  // OPERATOR ROLE & MFA INTEGRATION
  // ==========================================

  await t.test('16. Operator signup enrolls in TOTP MFA and preserves facility assignment', async () => {
    const res = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Operator TOTP User',
      email: testOperatorEmail,
      password: 'StrongPassword@123',
      accountType: 'OPERATOR',
      organizationName: 'TOTP Ops Enterprise'
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.requiresMfaSetup, true);
    assert.equal(res.body.accountType, 'OPERATOR');
    assert.ok(res.body.manualSetupKey);
    assert.ok(res.body.qrCodeDataUrl);

    operatorSignupRes = res.body;

    const opCode = totpService.generateCurrentTotp(res.body.manualSetupKey);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: res.body.setupToken,
      code: opCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.accountType, 'OPERATOR');
    assert.equal(verifyRes.body.user.facilityId, null, 'New Operator starts with null facility until onboarding');
  });
});
