import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const DEFAULT_KEY_VERSION = env.CREDENTIAL_CURRENT_KEY_VERSION || 'v1';

/**
 * Loads the active key ring from environment configuration.
 * Returns a Map of keyVersion -> 32-byte Buffer.
 */
export function getKeyRing() {
  const keyRing = new Map();

  // 1. Check for JSON key ring (multi-key support for key rotation)
  if (process.env.CREDENTIAL_KEY_RING) {
    try {
      const parsed = JSON.parse(process.env.CREDENTIAL_KEY_RING);
      for (const [ver, val] of Object.entries(parsed)) {
        keyRing.set(ver, normalizeKey(val));
      }
    } catch (err) {
      console.error('Failed to parse CREDENTIAL_KEY_RING JSON:', err);
    }
  }

  // 2. Default key from env.CREDENTIAL_ENCRYPTION_KEY
  const defaultKeyStr = env.CREDENTIAL_ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (defaultKeyStr && !keyRing.has(DEFAULT_KEY_VERSION)) {
    keyRing.set(DEFAULT_KEY_VERSION, normalizeKey(defaultKeyStr));
  }

  return keyRing;
}

/**
 * Validates and converts key string (hex or raw) into 32-byte Buffer
 */
function normalizeKey(keyStr) {
  if (Buffer.isBuffer(keyStr)) {
    if (keyStr.length !== 32) {
      throw new Error(`Encryption key must be exactly 32 bytes (256 bits). Received ${keyStr.length} bytes.`);
    }
    return keyStr;
  }

  if (typeof keyStr !== 'string') {
    throw new Error('Encryption key must be a string or Buffer.');
  }

  // Check if 64-char hex string
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    return Buffer.from(keyStr, 'hex');
  }

  // Check if raw 32 bytes string
  const buf = Buffer.from(keyStr, 'utf8');
  if (buf.length === 32) {
    return buf;
  }

  // Fallback: derive 32-byte key using sha256 to guarantee 256 bits if arbitrary length provided
  return crypto.createHash('sha256').update(keyStr).digest();
}

/**
 * Encrypts a plaintext secret using AES-256-GCM with a fresh unique IV.
 *
 * @param {string} plaintext - The plaintext secret to encrypt
 * @param {string} [keyVersion] - Key version identifier
 * @returns {string} Formatted string: `${keyVersion}:${ivHex}:${tagHex}:${ciphertextHex}`
 */
export function encryptSecret(plaintext, keyVersion = DEFAULT_KEY_VERSION) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }

  const ring = getKeyRing();
  const key = ring.get(keyVersion);

  if (!key) {
    throw new Error(`Encryption failed: Key version '${keyVersion}' not found in key ring. Operation failed closed.`);
  }

  // Generate unique cryptographically secure 12-byte IV for this operation
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Format: key_version:iv:tag:ciphertext
  return `${keyVersion}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an authenticated encrypted payload using AES-256-GCM.
 *
 * @param {string} payload - Payload formatted as `${keyVersion}:${ivHex}:${tagHex}:${ciphertextHex}`
 * @returns {string} Decrypted plaintext utf8 string
 */
export function decryptSecret(payload) {
  if (!payload || typeof payload !== 'string') {
    return null;
  }

  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted secret format. Expected version:iv:tag:ciphertext.');
  }

  const [version, ivHex, tagHex, ciphertextHex] = parts;

  const ring = getKeyRing();
  const key = ring.get(version);

  if (!key) {
    throw new Error(`Decryption failed: Key version '${version}' is missing or retired. Operation failed closed.`);
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Decryption failed: Invalid IV length (${iv.length} bytes, expected ${IV_LENGTH}).`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Decryption failed: Invalid Auth Tag length (${authTag.length} bytes, expected ${AUTH_TAG_LENGTH}).`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });

  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('Decryption failed: Authenticated payload verification failed or payload has been tampered with.');
  }
}

/**
 * Re-encrypts an encrypted payload under a new key version without exposing plaintext.
 *
 * @param {string} payload - Existing encrypted payload
 * @param {string} targetKeyVersion - New key version to encrypt under
 * @returns {{ newPayload: string, newVersion: string }}
 */
export function rotateSecret(payload, targetKeyVersion) {
  const decrypted = decryptSecret(payload);
  const newPayload = encryptSecret(decrypted, targetKeyVersion);
  return {
    newPayload,
    newVersion: targetKeyVersion
  };
}

/**
 * Masks a secret string for UI presentation.
 */
export function maskSecret(secret, maskChar = '•', length = 12) {
  if (!secret) return '';
  return maskChar.repeat(length);
}

/**
 * Masks a username/email for safe preview in lists without full exposure.
 */
export function maskUsername(username) {
  if (!username || typeof username !== 'string') return '';
  if (username.includes('@')) {
    const [local, domain] = username.split('@');
    if (local.length <= 2) {
      return `${local[0] || ''}***@${domain}`;
    }
    return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
  }
  if (username.length <= 4) {
    return `${username[0]}***`;
  }
  return `${username.slice(0, 2)}***${username.slice(-2)}`;
}
