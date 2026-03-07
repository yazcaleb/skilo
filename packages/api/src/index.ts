// skilo API - Cloudflare Worker entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { skillsRouter } from './routes/skills.js';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';

type Env = {
  DB: D1Database;
  SKILLPACK_BUCKET: R2Bucket;
  SKILLPACK_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Routes
app.route('/v1/skills', skillsRouter);
app.route('/v1/auth', authRouter);
app.route('/v1/user', userRouter);

// 404 handler
app.notFound((c) => c.json({ error: 'not_found', message: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { error: 'internal_error', message: err.message || 'Internal server error' },
    500
  );
});

export default app;