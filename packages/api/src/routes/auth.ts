// Auth API routes
import { Hono } from 'hono';
import type { Env } from '../index.js';

export const authRouter = new Hono<{ Bindings: Env }>();

// OAuth token endpoint (Client Credentials)
authRouter.post('/token', async (c) => {
  const body = await c.req.json();
  const { grant_type, client_id, client_secret } = body;

  if (grant_type !== 'client_credentials') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  if (!client_id || !client_secret) {
    return c.json({ error: 'invalid_request', message: 'client_id and client_secret required' }, 400);
  }

  try {
    // Validate client credentials
    const stmt = await c.env.DB.prepare(
      `SELECT u.* FROM users u
       JOIN oauth_clients c ON u.id = c.user_id
       WHERE c.client_id = ? AND c.client_secret_hash = ?`
    );
    const client = await stmt.bind(client_id, hashSecret(client_secret)).first();

    if (!client) {
      return c.json({ error: 'invalid_client' }, 401);
    }

    // Generate tokens
    const accessToken = generateToken();
    const refreshToken = generateToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    // Store token
    const tokenId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO oauth_tokens (id, client_id, user_id, access_token, refresh_token, expires_at, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(tokenId, client_id, client.id, accessToken, refreshToken, expiresAt, 'write').run();

    // Cache in KV
    await c.env.SKILLPACK_KV.put(`token:${accessToken}`, client.id, { expirationTtl: 3600 });

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: 'write',
    });
  } catch (e) {
    console.error('Token error:', e);
    return c.json({ error: 'auth_failed', message: (e as Error).message }, 500);
  }
});

// Create API key
authRouter.post('/keys', authenticate, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const permissions = body.permissions || 'read';

  try {
    const apiKey = `sk_${generateToken()}`;
    const keyHash = hashKey(apiKey);

    const keyId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO api_keys (id, user_id, key_hash, permissions)
       VALUES (?, ?, ?, ?)`
    ).bind(keyId, user.id, keyHash, permissions).run();

    // Cache in KV
    await c.env.SKILLPACK_KV.put(`key:${keyHash}`, user.id, { expirationTtl: 86400 * 365 * 10 }); // 10 years

    return c.json({
      id: keyId,
      key: apiKey,
      permissions,
      createdAt: Math.floor(Date.now() / 1000),
    }, 201);
  } catch (e) {
    return c.json({ error: 'create_failed', message: (e as Error).message }, 500);
  }
});

// Helpers
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function hashSecret(secret: string): string {
  // Simple hash for demo
  return secret.slice(0, 32);
}

function hashKey(key: string): string {
  return key.slice(0, 32);
}

async function authenticate(c: any, next: () => Promise<Response>) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  // Try to get from KV first
  const cachedUserId = await c.env.SKILLPACK_KV.get(`token:${token}`);
  if (cachedUserId) {
    const userStmt = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`);
    const user = await userStmt.bind(cachedUserId).first();
    if (user) {
      c.set('user', user);
      return next();
    }
  }

  // Check API key
  const stmt = await c.env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN api_keys k ON u.id = k.user_id
     WHERE k.key_hash = ?`
  );
  const user = await stmt.bind(hashKey(token)).first();

  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
}