// User API routes
import { Hono } from 'hono';
import type { Env } from '../index.js';

export const userRouter = new Hono<{ Bindings: Env }>();

// Get current user
userRouter.get('/', authenticate, async (c) => {
  const user = c.get('user');

  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
  });
});

// Update user profile
userRouter.patch('/', authenticate, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  try {
    if (body.email) {
      await c.env.DB.prepare(
        `UPDATE users SET email = ? WHERE id = ?`
      ).bind(body.email, user.id).run();
    }

    if (body.username) {
      await c.env.DB.prepare(
        `UPDATE users SET username = ? WHERE id = ?`
      ).bind(body.username, user.id).run();
    }

    const stmt = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`);
    const updated = await stmt.bind(user.id).first();

    return c.json({
      id: updated.id,
      username: updated.username,
      email: updated.email,
      createdAt: updated.created_at,
    });
  } catch (e) {
    return c.json({ error: 'update_failed', message: (e as Error).message }, 500);
  }
});

// Get user's skills
userRouter.get('/skills', authenticate, async (c) => {
  const user = c.get('user');

  try {
    const stmt = await c.env.DB.prepare(
      `SELECT name, namespace, description, latest_version as version, privacy, created_at, updated_at
       FROM skills
       WHERE namespace = ?
       ORDER BY updated_at DESC`
    );
    const skills = await stmt.bind(user.username).all();

    return c.json({
      skills: (skills.results || []).map((skill: any) => ({
        ...skill,
        listed: skill.privacy === 'public',
      })),
    });
  } catch (e) {
    return c.json({ error: 'fetch_failed', message: (e as Error).message }, 500);
  }
});

// Auth middleware (inline)
async function authenticate(c: any, next: () => Promise<Response>) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  // Try KV cache
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
  const user = await stmt.bind(token.slice(0, 32)).first();

  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
}
