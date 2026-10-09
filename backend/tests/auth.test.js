process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { User, Organization } = require('../src/models');
const authService = require('../src/services/auth.service');
const totpService = require('../src/services/totp.service');


test('auth: 2-step signup verification, OTP security, rate limits, and authentication flow', async (t) => {
  await connectDatabase();

  const email = `authtest-${Date.now()}@test.com`;

  // 1. Signup creates an unverified account
  const regResult = await authService.register({
    name: 'Test Consumer',
    email,
    password: 'Password@123',
    role: 'USER'
  });

  assert.equal(regResult.status, 'PENDING_VERIFICATION');
  assert.equal(regResult.user.email, email);
  assert.equal(regResult.user.role, 'USER');
  assert.equal(regResult.user.accountType, 'DRIVER');
  assert.equal(regResult.user.internalRole, null);
  assert.equal(regResult.user.isVerified, false, 'User must be unverified upon signup');

  // 2. OTP is generated and 3. OTP is stored hashed, NEVER in plaintext
  const rawOtp = regResult.devOtp;
  assert.ok(rawOtp, 'OTP must be generated upon signup');
  assert.equal(rawOtp.length, 6, 'OTP must be exactly 6 digits');

  const createdUser = await User.findById(regResult.user.id);
  assert.ok(createdUser.verificationOtpHash, 'Hashed OTP must exist in database');
  assert.notEqual(createdUser.verificationOtpHash, rawOtp, 'Plaintext OTP must NEVER be stored');
  assert.ok(createdUser.verificationOtpExpiresAt, 'Expiration timestamp must be recorded');
  assert.equal(createdUser.isVerified, false);

  // 4. User cannot log in before verification
  await assert.rejects(
    async () => {
      await authService.login({
        email,
        password: 'Password@123'
      });
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'VERIFICATION_REQUIRED');
      return true;
    }
  );

  // 5. Reject duplicate email registration
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

  // 6. Incorrect OTP is rejected
  await assert.rejects(
    async () => {
      await authService.verifySignupOtp({
        email,
        otp: '000000'
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'INVALID_OTP');
      return true;
    }
  );

  // Verify attempt count incremented
  const userAfterAttempt = await User.findById(regResult.user.id);
  assert.equal(userAfterAttempt.verificationAttempts, 1);

  // 7. Expired OTP is rejected
  createdUser.verificationOtpExpiresAt = new Date(Date.now() - 1000);
  await createdUser.save();

  await assert.rejects(
    async () => {
      await authService.verifySignupOtp({
        email,
        otp: rawOtp
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'OTP_EXPIRED');
      return true;
    }
  );

  // Restore valid expiry for subsequent tests
  createdUser.verificationOtpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await createdUser.save();

  // 8. Resend cooldown works (trying immediately within 60s cooldown)
  await assert.rejects(
    async () => {
      await authService.resendSignupOtp({ email });
    },
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, 'OTP_RESEND_COOLDOWN');
      return true;
    }
  );

  // 9. Resending invalidates previous OTP (simulating cooldown elapsed)
  createdUser.verificationLastSentAt = new Date(Date.now() - 65 * 1000);
  await createdUser.save();

  const resendRes = await authService.resendSignupOtp({ email });
  assert.ok(resendRes.success);
  const newOtp = resendRes.devOtp;
  assert.ok(newOtp, 'New OTP must be generated on resend');

  // Old OTP must now fail
  await assert.rejects(
    async () => {
      await authService.verifySignupOtp({
        email,
        otp: rawOtp
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'INVALID_OTP');
      return true;
    }
  );

  // 10. Attempt limit works (test exhaustion after 5 failures)
  const attemptUser = await User.findById(regResult.user.id);
  attemptUser.verificationAttempts = 5;
  await attemptUser.save();

  await assert.rejects(
    async () => {
      await authService.verifySignupOtp({
        email,
        otp: newOtp
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'OTP_ATTEMPTS_EXCEEDED');
      return true;
    }
  );

  // Reset attempts to allow successful verification
  attemptUser.verificationAttempts = 0;
  await attemptUser.save();

  // 11. Correct OTP verifies successfully
  const verifyRes = await authService.verifySignupOtp({
    email,
    otp: newOtp
  });

  assert.equal(verifyRes.status, 'VERIFIED');
  assert.ok(verifyRes.token, 'Verification must return a live session token');
  assert.equal(verifyRes.user.isVerified, true);

  const verifiedDbUser = await User.findById(regResult.user.id);
  assert.equal(verifiedDbUser.isVerified, true);
  assert.equal(verifiedDbUser.verificationOtpHash, null, 'OTP hash must be deleted upon verification');

  // 12. Already verified accounts cannot be verified again
  await assert.rejects(
    async () => {
      await authService.verifySignupOtp({
        email,
        otp: newOtp
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'ACCOUNT_ALREADY_VERIFIED');
      return true;
    }
  );

  // 13. Login works successfully after verification
  let loginResult = await authService.login({
    email,
    password: 'Password@123'
  });
  if (loginResult.requiresMfa) {
    const dbUser = await User.findOne({ email });
    const secret = totpService.decryptSecret({
      encrypted: dbUser.totpSecretEncrypted,
      iv: dbUser.totpSecretIv,
      tag: dbUser.totpSecretAuthTag
    });
    loginResult = await authService.verifyMfaLogin({
      email,
      mfaToken: loginResult.mfaToken,
      code: totpService.generateCurrentTotp(secret)
    });
  }
  assert.ok(loginResult.token, 'Login must return an authenticated JWT');
  assert.equal(loginResult.user.email, email);
  assert.equal(loginResult.user.accountType, 'DRIVER');
  assert.equal(loginResult.user.internalRole, null);
  assert.equal(loginResult.user.isVerified, true);

  // 14. Operator signup with 2-step OTP verification
  const b2bEmail = `b2bowner-${Date.now()}@test.com`;
  const b2bResult = await authService.register({
    name: 'B2B Owner User',
    email: b2bEmail,
    password: 'Password@123',
    accountType: 'OPERATOR',
    organizationName: 'Global Parking Corp'
  });

  assert.equal(b2bResult.status, 'PENDING_VERIFICATION');
  assert.equal(b2bResult.user.accountType, 'OPERATOR');
  assert.equal(b2bResult.user.internalRole, 'OWNER');
  assert.ok(b2bResult.devOtp, 'Operator OTP must be generated');

  // Verify Operator account
  const b2bVerify = await authService.verifySignupOtp({
    email: b2bEmail,
    otp: b2bResult.devOtp
  });
  assert.equal(b2bVerify.status, 'VERIFIED');
  assert.equal(b2bVerify.user.isVerified, true);

  // Verify login as Operator returns authoritative accountType and internalRole
  let b2bLogin = await authService.login({
    email: b2bEmail,
    password: 'Password@123'
  });
  if (b2bLogin.requiresMfa) {
    const dbUser = await User.findOne({ email: b2bEmail });
    const secret = totpService.decryptSecret({
      encrypted: dbUser.totpSecretEncrypted,
      iv: dbUser.totpSecretIv,
      tag: dbUser.totpSecretAuthTag
    });
    b2bLogin = await authService.verifyMfaLogin({
      email: b2bEmail,
      mfaToken: b2bLogin.mfaToken,
      code: totpService.generateCurrentTotp(secret)
    });
  }
  assert.equal(b2bLogin.user.accountType, 'OPERATOR');
  assert.equal(b2bLogin.user.internalRole, 'OWNER');

  // Cleanup
  await User.deleteMany({ email: { $in: [email, b2bEmail] } });
  if (b2bResult.user.organizationId) {
    await Organization.deleteOne({ _id: b2bResult.user.organizationId });
  }

});
