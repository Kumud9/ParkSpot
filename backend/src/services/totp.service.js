const crypto = require('crypto');
const { generateSecret, generateSync, verifySync, generateURI } = require('otplib');
const QRCode = require('qrcode');
const { AppError } = require('../errors');

const MFA_CHALLENGE_TTL_MINUTES = parseInt(process.env.MFA_CHALLENGE_TTL_MINUTES || '15', 10);
const MFA_MAX_ATTEMPTS = parseInt(process.env.MFA_MAX_ATTEMPTS || '5', 10);

/**
 * Derives a strictly 32-byte encryption key from TOTP_ENCRYPTION_KEY or fallback JWT_SECRET.
 */
function getEncryptionKey() {
  const rawKey =
    process.env.TOTP_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'parkspot-totp-default-dev-secret-key-32b';
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts the raw TOTP secret using AES-256-GCM.
 * Never stores or exposes plaintext secrets at rest.
 */
function encryptSecret(plaintextSecret) {
  if (!plaintextSecret || typeof plaintextSecret !== 'string') {
    throw new AppError(500, 'CRYPTO_ERROR', 'Invalid secret to encrypt.');
  }
  const key = getEncryptionKey();
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
 * Decrypts the stored TOTP secret using AES-256-GCM and verifies the authentication tag.
 */
function decryptSecret({ encrypted, iv, tag }) {
  if (!encrypted || !iv || !tag) {
    throw new AppError(500, 'CRYPTO_ERROR', 'Incomplete encrypted secret payload.');
  }
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_err) {
    throw new AppError(500, 'CRYPTO_ERROR', 'Failed to decrypt TOTP secret.');
  }
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
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateOtpauthUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateCurrentTotp,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode
};
