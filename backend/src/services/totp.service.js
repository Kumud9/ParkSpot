const crypto = require('crypto');
const { generateSecret, generateSync, verifySync, generateURI } = require('otplib');
const QRCode = require('qrcode');
const { AppError } = require('../errors');

const MFA_CHALLENGE_TTL_MINUTES = parseInt(process.env.MFA_CHALLENGE_TTL_MINUTES || '15', 10);
const MFA_MAX_ATTEMPTS = parseInt(process.env.MFA_MAX_ATTEMPTS || '5', 10);

/**
 * Validates that TOTP encryption configuration is present, secure, and stable during startup.
 */
function validateTotpConfig() {
  const primaryKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!primaryKey) {
    throw new Error('TOTP_ENCRYPTION_KEY must be configured for two-factor authentication.');
  }
  if (primaryKey.length < 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must be at least 32 characters or 64 hex characters.');
  }
}

/**
 * Derives the authoritative 32-byte encryption key strictly from process.env.TOTP_ENCRYPTION_KEY.
 * Never generates a random key on restart or derives from JWT_SECRET for new encryptions.
 */
function getPrimaryEncryptionKey() {
  const rawKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new AppError(500, 'CRYPTO_ERROR', 'TOTP_ENCRYPTION_KEY is not configured.');
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Returns candidate decryption keys in priority order to safely support key rotation
 * and historical legacy deployments without data loss.
 */
function getCandidateDecryptionKeys() {
  const primaryRaw = process.env.TOTP_ENCRYPTION_KEY;
  const keys = [];

  if (primaryRaw) {
    // 1. Authoritative primary key (SHA-256 digest of configured key)
    keys.push(crypto.createHash('sha256').update(primaryRaw).digest());
    // 2. Direct 32-byte hex buffer if 64 hex characters
    if (/^[a-f0-9]{64}$/i.test(primaryRaw.trim())) {
      keys.push(Buffer.from(primaryRaw.trim(), 'hex'));
    }
  }

  // 3. User-configured legacy keys for secure key rotation
  if (process.env.TOTP_LEGACY_KEYS) {
    const customLegacy = process.env.TOTP_LEGACY_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    for (const raw of customLegacy) {
      keys.push(crypto.createHash('sha256').update(raw).digest());
      if (/^[a-f0-9]{64}$/i.test(raw)) {
        keys.push(Buffer.from(raw, 'hex'));
      }
    }
  }

  // 4. Known historical deployment keys supported for backward compatibility
  const historicalKeyStrings = [
    // Historical deployment secret
    'fb81df88f8ee4740432d8e1e8651a96772b1ffa0a40010c5aa39451c83f3f68c3cc0a5fa18095a34550fd6df8fd7536efa21bc4278bd3e34b8f82aca6fdb5cf6',
    // Fallback secret used during previous local development
    'parkspot-local-development-secret-change-before-deployment'
  ];

  for (const str of historicalKeyStrings) {
    keys.push(crypto.createHash('sha256').update(str).digest());
  }

  return keys;
}

/**
 * Attempts decryption using a specific key buffer.
 * Returns decrypted string on success, or null on GCM authentication failure.
 */
function tryDecryptPayload({ encrypted, iv, tag }, keyBuffer) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_e) {
    return null;
  }
}

/**
 * Encrypts the raw TOTP secret using AES-256-GCM using the active primary key.
 * Never stores or exposes plaintext secrets at rest.
 */
function encryptSecret(plaintextSecret) {
  if (!plaintextSecret || typeof plaintextSecret !== 'string') {
    throw new AppError(500, 'CRYPTO_ERROR', 'Invalid secret to encrypt.');
  }
  const key = getPrimaryEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintextSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag
  };
}

/**
 * Decrypts the stored TOTP secret using AES-256-GCM.
 * Supports primary key and historical legacy keyring for seamless backward compatibility.
 */
function decryptSecret({ encrypted, iv, tag }) {
  const result = decryptSecretWithMeta({ encrypted, iv, tag });
  return result.secret;
}

/**
 * Decrypts the stored TOTP secret and indicates whether a legacy key was used.
 */
function decryptSecretWithMeta({ encrypted, iv, tag }) {
  if (!encrypted || !iv || !tag) {
    throw new AppError(500, 'CRYPTO_ERROR', 'Incomplete encrypted secret payload.');
  }

  // 1. Try primary key first
  const primaryKey = getPrimaryEncryptionKey();
  const primaryDecrypted = tryDecryptPayload({ encrypted, iv, tag }, primaryKey);
  if (primaryDecrypted) {
    return { secret: primaryDecrypted, isLegacy: false };
  }

  // 2. Safely test candidate legacy keys from the keyring
  const candidateKeys = getCandidateDecryptionKeys().slice(1);
  for (const key of candidateKeys) {
    const decrypted = tryDecryptPayload({ encrypted, iv, tag }, key);
    if (decrypted) {
      return { secret: decrypted, isLegacy: true };
    }
  }

  throw new AppError(500, 'CRYPTO_ERROR', 'Failed to decrypt TOTP secret.');
}

/**
 * Generates a new random Base32 TOTP secret.
 */
function generateTotpSecret() {
  return generateSecret();
}

/**
 * Generates an otpauth:// URI compliant with Google Authenticator / Authy.
 */
function generateOtpauthUri({ email, secret }) {
  return generateURI({
    issuer: 'ParkSpot',
    label: email,
    secret
  });
}

/**
 * Generates a real PNG Data URL for QR code scanning.
 */
async function generateQrCodeDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#25221B',
      light: '#FFFFFF'
    }
  });
}

/**
 * Verifies a 6-digit TOTP code against the decrypted secret with clock drift window.
 */
function verifyTotpCode({ secret, code }) {
  if (!code || typeof code !== 'string') return false;
  const normalized = code.trim();
  if (normalized.length !== 6 || !/^\d{6}$/.test(normalized)) return false;

  try {
    const res = verifySync({
      token: normalized,
      secret,
      window: 1 // allows 1 step before and after (±30s drift)
    });
    return res && res.valid === true;
  } catch (_err) {
    return false;
  }
}

/**
 * Generates the current valid TOTP token for testing/automation.
 */
function generateCurrentTotp(secret) {
  return generateSync({ secret });
}

/**
 * Generates 8 one-time backup recovery codes and their secure SHA-256 hashes.
 * Format: XXXX-XXXX (e.g. 7F3A-9C2E)
 */
function generateRecoveryCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);

    const hash = crypto.createHash('sha256').update(formatted).digest('hex');
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verifies and burns a one-time recovery code.
 */
function verifyAndConsumeRecoveryCode({ inputCode, hashedCodes }) {
  if (!inputCode || typeof inputCode !== 'string' || !Array.isArray(hashedCodes)) {
    return { valid: false, remainingHashes: hashedCodes };
  }

  // Normalize: uppercase, trimmed, ensure hyphen format XXXX-XXXX if 8 chars without hyphen
  let cleaned = inputCode.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
  if (cleaned.length === 8) {
    cleaned = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  } else {
    cleaned = inputCode.trim().toUpperCase();
  }

  const inputHash = crypto.createHash('sha256').update(cleaned).digest('hex');
  const index = hashedCodes.indexOf(inputHash);

  if (index === -1) {
    return { valid: false, remainingHashes: hashedCodes };
  }

  // Code is valid! Consume it by removing from array
  const remainingHashes = hashedCodes.filter((_, idx) => idx !== index);
  return { valid: true, remainingHashes };
}

module.exports = {
  MFA_CHALLENGE_TTL_MINUTES,
  MFA_MAX_ATTEMPTS,
  validateTotpConfig,
  getPrimaryEncryptionKey,
  getCandidateDecryptionKeys,
  encryptSecret,
  decryptSecret,
  decryptSecretWithMeta,
  generateTotpSecret,
  generateOtpauthUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateCurrentTotp,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode
};
