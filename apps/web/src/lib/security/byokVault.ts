import { dbClient } from '@/lib/api/IndexDBClient';

const KEY_STORAGE = 'settings_byok_crypto_key';
const CIPHER_PREFIX = 'v1';
const IV_BYTES = 12;

type EncryptedApiKey = `${typeof CIPHER_PREFIX}.${string}.${string}`;

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const isEncryptedApiKey = (value: unknown): value is EncryptedApiKey =>
  typeof value === 'string' && value.startsWith(`${CIPHER_PREFIX}.`);

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await dbClient.getItem<CryptoKey>(KEY_STORAGE);
  if (stored) return stored;

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await dbClient.setItem(KEY_STORAGE, key);
  return key;
}

/** Encrypt a BYOK secret before it crosses the IndexedDB boundary. */
export async function protectApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return '';
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto is required to persist BYOK settings');
  }

  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const payload = new TextEncoder().encode(apiKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload,
  );
  return `${CIPHER_PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt a stored BYOK value. A legacy plaintext value is returned unchanged
 * so callers can migrate it immediately without breaking existing users.
 */
export async function revealApiKey(value: unknown): Promise<{
  apiKey: string;
  legacyPlaintext: boolean;
}> {
  if (!value) return { apiKey: '', legacyPlaintext: false };
  if (!isEncryptedApiKey(value)) {
    return { apiKey: String(value), legacyPlaintext: true };
  }
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto is required to read BYOK settings');
  }

  const [, encodedIv, encodedCiphertext] = value.split('.');
  const key = await dbClient.getItem<CryptoKey>(KEY_STORAGE);
  if (!key) throw new Error('BYOK encryption key is missing');

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(encodedIv) },
    key,
    fromBase64(encodedCiphertext),
  );
  return {
    apiKey: new TextDecoder().decode(plaintext),
    legacyPlaintext: false,
  };
}

export const isProtectedApiKey = isEncryptedApiKey;
