// Ed25519 signing utilities for skill verification
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logInfo } from './output.js';

const SIGNING_KEY_FILE = join(homedir(), '.skilo', 'signing.key');
const SIGNING_PUB_FILE = join(homedir(), '.skilo', 'signing.pub');

interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

async function persistKeys(keys: KeyPair): Promise<void> {
  await mkdir(join(homedir(), '.skilo'), { recursive: true });
  await writeFile(SIGNING_KEY_FILE, keys.privateKey, { mode: 0o600 });
  await writeFile(SIGNING_PUB_FILE, keys.publicKey, { mode: 0o644 });
}

// Generate Ed25519 keypair using Web Crypto API
export async function generateKeyPair(): Promise<KeyPair> {
  // Note: Web Crypto API doesn't support Ed25519 directly in all environments
  // For Node.js 20+, we can use the built-in crypto module
  const { webcrypto } = await import('node:crypto');
  const subtle = webcrypto.subtle;

  // Generate Ed25519 key pair
  const keyPair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;

  // Export private key
  const privateKey = new Uint8Array(await subtle.exportKey('pkcs8', keyPair.privateKey));

  // Export public key
  const publicKey = new Uint8Array(await subtle.exportKey('spki', keyPair.publicKey));

  return { publicKey, privateKey };
}

// Load or generate signing keys
export async function loadOrGenerateKeys(): Promise<KeyPair> {
  try {
    const privateKey = await readFile(SIGNING_KEY_FILE);
    const publicKey = await readFile(SIGNING_PUB_FILE);

    // Legacy raw 32-byte keys cannot be re-imported reliably. Refresh them once.
    if (privateKey.length === 32 && publicKey.length === 32) {
      logInfo('Refreshing legacy signing keys');
      const keys = await generateKeyPair();
      await persistKeys(keys);
      return keys;
    }

    return {
      privateKey: new Uint8Array(privateKey),
      publicKey: new Uint8Array(publicKey),
    };
  } catch {
    // Generate new keys
    logInfo('Generating signing keys');
    const keys = await generateKeyPair();

    // Save keys
    await persistKeys(keys);

    logInfo('Signing keys saved to ~/.skilo/');
    return keys;
  }
}

// Sign data with private key
export async function sign(data: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  const { webcrypto } = await import('node:crypto');
  const subtle = webcrypto.subtle;

  const key = await subtle.importKey(
    'pkcs8',
    privateKey,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const signature = await subtle.sign({ name: 'Ed25519' }, key, data);
  return new Uint8Array(signature);
}

// Verify signature with public key
export async function verify(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    const { webcrypto } = await import('node:crypto');
    const subtle = webcrypto.subtle;

    const key = await subtle.importKey(
      'spki',
      publicKey,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    return await subtle.verify({ name: 'Ed25519' }, key, signature, data);
  } catch {
    return false;
  }
}

// Calculate SHA-256 checksum
export async function calculateChecksum(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper functions
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  const binary = String.fromCharCode(...arr);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Export for use in other modules
export { uint8ArrayToBase64Url as encodeBase64Url, base64UrlToUint8Array as decodeBase64Url };
