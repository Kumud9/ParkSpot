const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../src');
const { connectDatabase } = require('../src/db');
const { User, Organization, ParkingLot } = require('../src/models');
const totpService = require('../src/services/totp.service');
const crypto = require('crypto');

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

test('PARKSPOT 2FA: Backward Compatibility, Keyring, and Account Verification Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const suffix = Date.now();
  const testNewDriverEmail = `new-driver-${suffix}@test.com`;
  const testNewOperatorEmail = `new-operator-${suffix}@test.com`;
  const testLegacyUserEmail = `legacy-user-${suffix}@test.com`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({
      email: { $in: [testNewDriverEmail, testNewOperatorEmail, testLegacyUserEmail] }
    });
  });

  // =========================================================================
  // 1. CONFIGURATION & STARTUP VALIDATION
  // =========================================================================
  await t.test('1. Startup validation succeeds with valid TOTP_ENCRYPTION_KEY', () => {
    assert.doesNotThrow(() => {
      totpService.validateTotpConfig();
    });
  });

  await t.test('2. Startup validation throws error if encryption key is missing or too short', () => {
    const origKey = process.env.TOTP_ENCRYPTION_KEY;
    try {
      delete process.env.TOTP_ENCRYPTION_KEY;
      assert.throws(() => totpService.validateTotpConfig(), /TOTP_ENCRYPTION_KEY must be configured/);

      process.env.TOTP_ENCRYPTION_KEY = 'short-key';
      assert.throws(() => totpService.validateTotpConfig(), /at least 32 characters/);
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = origKey;
    }
  });

  // =========================================================================
  // 2. EXISTING ACCOUNTS DECRYPTION (DATABASE VERIFICATION)
  // =========================================================================
  await t.test('3. Existing Driver accounts decrypt TOTP secret successfully', async () => {
    // Find any existing verified driver in DB with 2FA
    const existingDriver = await User.findOne({
      mfaEnabled: true,
      accountType: 'DRIVER',
      totpSecretEncrypted: { $ne: null }
    });

    assert.ok(existingDriver, 'Must find at least one existing driver with 2FA enabled in database');

    const decrypted = totpService.decryptSecret({
      encrypted: existingDriver.totpSecretEncrypted,
      iv: existingDriver.totpSecretIv,
      tag: existingDriver.totpSecretAuthTag
    });

    assert.ok(decrypted, 'Decryption must return plaintext secret string');
    assert.equal(typeof decrypted, 'string');
    assert.ok(decrypted.length >= 16, 'Base32 TOTP secret must have valid length');

    // Generating current code from decrypted secret must produce valid 6-digit TOTP
    const currentCode = totpService.generateCurrentTotp(decrypted);
    assert.match(currentCode, /^\d{6}$/);
    assert.equal(totpService.verifyTotpCode({ secret: decrypted, code: currentCode }), true);
  });

  await t.test('4. Existing Operator accounts decrypt TOTP secret successfully', async () => {
    // Find existing operator in DB with 2FA
    const existingOperator = await User.findOne({
      mfaEnabled: true,
      accountType: 'OPERATOR',
      totpSecretEncrypted: { $ne: null }
    });

    assert.ok(existingOperator, 'Must find at least one existing operator with 2FA enabled in database');

    const decrypted = totpService.decryptSecret({
      encrypted: existingOperator.totpSecretEncrypted,
      iv: existingOperator.totpSecretIv,
      tag: existingOperator.totpSecretAuthTag
    });

    assert.ok(decrypted);
    assert.equal(typeof decrypted, 'string');
    assert.ok(decrypted.length >= 16);

    const currentCode = totpService.generateCurrentTotp(decrypted);
    assert.match(currentCode, /^\d{6}$/);
    assert.equal(totpService.verifyTotpCode({ secret: decrypted, code: currentCode }), true);
  });

  // =========================================================================
  // 3. LEGACY ENCRYPTION FORMAT COMPATIBILITY & SEAMLESS MIGRATION
  // =========================================================================
  await t.test('5. Legacy account encrypted with historical key decrypts and auto-migrates to primary key', async () => {
    // Manually create a user encrypted with historical .env.example key
    const rawSecret = totpService.generateTotpSecret();
    const legacyKeyStr = 'fb81df88f8ee4740432d8e1e8651a96772b1ffa0a40010c5aa39451c83f3f68c3cc0a5fa18095a34550fd6df8fd7536efa21bc4278bd3e34b8f82aca6fdb5cf6';
    const legacyKey = crypto.createHash('sha256').update(legacyKeyStr).digest();

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    let legacyEncrypted = cipher.update(rawSecret, 'utf8', 'hex');
    legacyEncrypted += cipher.final('hex');
    const legacyTag = cipher.getAuthTag().toString('hex');

    const bcrypt = require('bcryptjs');
    const { plainCodes, hashedCodes } = totpService.generateRecoveryCodes();

    const legacyUser = await User.create({
      name: 'Legacy Key Test User',
      email: testLegacyUserEmail,
      passwordHash: await bcrypt.hash('LegacyPassword@123', 10),
      accountType: 'DRIVER',
      role: 'DRIVER',
      isVerified: true,
      mfaEnabled: true,
      totpSecretEncrypted: legacyEncrypted,
      totpSecretIv: iv.toString('hex'),
      totpSecretAuthTag: legacyTag,
      mfaRecoveryCodeHashes: hashedCodes,
      mfaAttempts: 0
    });

    // Verify decryptSecretWithMeta detects legacy key
    const { secret, isLegacy } = totpService.decryptSecretWithMeta({
      encrypted: legacyUser.totpSecretEncrypted,
      iv: legacyUser.totpSecretIv,
      tag: legacyUser.totpSecretAuthTag
    });
    assert.equal(secret, rawSecret);
    assert.equal(isLegacy, true, 'Must identify as legacy format');

    // Test Login flow for legacy user
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testLegacyUserEmail,
      password: 'LegacyPassword@123',
      accountType: 'DRIVER'
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.requiresMfa, true);
    assert.ok(loginRes.body.mfaToken);

    // Verify invalid code rejected
    const invalidRes = await makeRequest(server, '/api/v1/auth/mfa/verify-login', 'POST', null, {
      mfaToken: loginRes.body.mfaToken,
      code: '000000'
    });
    assert.equal(invalidRes.status, 400);

    // Verify valid TOTP code succeeds and logs in
    const validCode = totpService.generateCurrentTotp(rawSecret);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-login', 'POST', null, {
      mfaToken: loginRes.body.mfaToken,
      code: validCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.ok(verifyRes.body.token, 'Must return session JWT');

    // Verify that the record was automatically re-encrypted with the primary key
    const updatedUser = await User.findOne({ email: testLegacyUserEmail });
    assert.notEqual(updatedUser.totpSecretEncrypted, legacyEncrypted, 'Ciphertext must be re-encrypted');

    // Confirm that the updated record now decrypts directly with the PRIMARY key (isLegacy: false)
    const afterMeta = totpService.decryptSecretWithMeta({
      encrypted: updatedUser.totpSecretEncrypted,
      iv: updatedUser.totpSecretIv,
      tag: updatedUser.totpSecretAuthTag
    });
    assert.equal(afterMeta.secret, rawSecret, 'Decrypted secret must remain unchanged');
    assert.equal(afterMeta.isLegacy, false, 'Must now be encrypted with primary key');
  });

  // =========================================================================
  // 4. NEWLY REGISTERED DRIVER & OPERATOR ACCOUNTS
  // =========================================================================
  let newDriverSetupToken, newDriverRawSecret, newDriverRecoveryCodes;
  let newOperatorSetupToken, newOperatorRawSecret;

  await t.test('6. Newly registered driver encrypts with primary key and completes 2FA verification', async () => {
    const signupRes = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'New Driver Account',
      email: testNewDriverEmail,
      password: 'Password@2026',
      accountType: 'DRIVER'
    });

    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.requiresMfaSetup, true);
    newDriverSetupToken = signupRes.body.setupToken;
    newDriverRawSecret = signupRes.body.manualSetupKey;
    newDriverRecoveryCodes = signupRes.body.recoveryCodes;

    const dbUser = await User.findOne({ email: testNewDriverEmail });
    assert.ok(dbUser.totpSecretEncrypted);

    // Confirm newly registered account is directly decryptable with PRIMARY key
    const primaryKey = totpService.getPrimaryEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', primaryKey, Buffer.from(dbUser.totpSecretIv, 'hex'));
    decipher.setAuthTag(Buffer.from(dbUser.totpSecretAuthTag, 'hex'));
    let dec = decipher.update(dbUser.totpSecretEncrypted, 'hex', 'utf8');
    dec += decipher.final('utf8');
    assert.equal(dec, newDriverRawSecret, 'New user must use primary key');

    // Verify setup with valid code
    const validCode = totpService.generateCurrentTotp(newDriverRawSecret);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: newDriverSetupToken,
      code: validCode
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.mfaEnabled, true);
  });

  await t.test('7. Newly registered operator encrypts with primary key and completes 2FA verification', async () => {
    const signupRes = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'New Operator Account',
      email: testNewOperatorEmail,
      password: 'Password@2026',
      accountType: 'OPERATOR',
      organizationName: 'Primary Key Ops'
    });

    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.requiresMfaSetup, true);
    newOperatorSetupToken = signupRes.body.setupToken;
    newOperatorRawSecret = signupRes.body.manualSetupKey;

    const dbUser = await User.findOne({ email: testNewOperatorEmail });
    const { isLegacy, secret } = totpService.decryptSecretWithMeta({
      encrypted: dbUser.totpSecretEncrypted,
      iv: dbUser.totpSecretIv,
      tag: dbUser.totpSecretAuthTag
    });
    assert.equal(isLegacy, false);
    assert.equal(secret, newOperatorRawSecret);

    // Verify setup
    const validCode = totpService.generateCurrentTotp(newOperatorRawSecret);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: newOperatorSetupToken,
      code: validCode
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.accountType, 'OPERATOR');
  });

  // =========================================================================
  // 5. RECOVERY CODE VERIFICATION & BURNING
  // =========================================================================
  await t.test('8. Recovery code authentication verifies and burns code safely', async () => {
    // Driver login
    const loginRes = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testNewDriverEmail,
      password: 'Password@2026',
      accountType: 'DRIVER'
    });

    assert.equal(loginRes.status, 200);
    const mfaToken = loginRes.body.mfaToken;

    // Use first recovery code
    const codeToUse = newDriverRecoveryCodes[0];
    const recRes = await makeRequest(server, '/api/v1/auth/mfa/verify-recovery', 'POST', null, {
      mfaToken,
      recoveryCode: codeToUse
    });

    assert.equal(recRes.status, 200);
    assert.equal(recRes.body.success, true);
    assert.ok(recRes.body.token);

    // Second login attempt using the same recovery code must fail (burned)
    const loginRes2 = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testNewDriverEmail,
      password: 'Password@2026',
      accountType: 'DRIVER'
    });

    const reuseRes = await makeRequest(server, '/api/v1/auth/mfa/verify-recovery', 'POST', null, {
      mfaToken: loginRes2.body.mfaToken,
      recoveryCode: codeToUse
    });

    assert.equal(reuseRes.status, 400);
    assert.equal(reuseRes.body.error?.code, 'INVALID_RECOVERY_CODE');
  });

  // =========================================================================
  // 6. ROLE-BASED ACCESS CONTROL INTEGRITY
  // =========================================================================
  await t.test('9. Driver cannot access operator console; Operator preserves RBAC scope', async () => {
    // Log in driver
    const driverLogin = await makeRequest(server, '/api/v1/auth/login', 'POST', null, {
      email: testNewDriverEmail,
      password: 'Password@2026',
      accountType: 'DRIVER'
    });

    const driverCode = totpService.generateCurrentTotp(newDriverRawSecret);
    const driverAuth = await makeRequest(server, '/api/v1/auth/mfa/verify-login', 'POST', null, {
      mfaToken: driverLogin.body.mfaToken,
      code: driverCode
    });

    // Driver JWT attempting operator endpoint
    const opEndpoint = await makeRequest(server, '/api/v1/analytics/summary', 'GET', driverAuth.body.token);
    assert.equal(opEndpoint.status, 403, 'Driver must be forbidden from operator endpoints');
  });
});
