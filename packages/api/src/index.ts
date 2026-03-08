// skilo API - Cloudflare Worker entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { skillsRouter } from './routes/skills.js';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/user.js';
import { packsRouter } from './routes/packs.js';

export type Env = {
  DB: D1Database;
  SKILLPACK_BUCKET: R2Bucket;
  SKILLPACK_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Env }>();
const supportedTools = [
  'claude-code',
  'codex',
  'cursor',
  'amp',
  'windsurf',
  'opencode',
  'cline',
  'roo',
  'openclaw',
] as const;

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));
app.get('/', (c) => c.json({
  name: 'skilo-api',
  status: 'ok',
  website: 'https://skilo.xyz',
  docs: 'https://skilo.xyz/docs',
  llms: 'https://skilo.xyz/llms.txt',
  cli: 'https://www.npmjs.com/package/skilo-cli',
  version: 'v1',
  capabilities: [
    'search-skills',
    'resolve-share-links',
    'resolve-packs',
    'subset-packs',
    'publish-skills',
    'audit-skills',
    'capability-inference',
    'download-tarballs',
    'username-bootstrap-auth',
    'list-user-skills',
  ],
  supportedTools,
}));
app.get('/v1', (c) => c.json({
  name: 'skilo-api',
  version: 'v1',
  docs: 'https://skilo.xyz/docs',
  llms: 'https://skilo.xyz/llms.txt',
  routes: {
    health: '/health',
    searchSkills: '/v1/skills?q=<query>',
    getSkill: '/v1/skills/:namespace/:name',
    resolveShare: '/v1/skills/share/:token',
    resolvePack: '/v1/packs/:token',
    subsetPack: '/v1/packs/subset',
    auditModel: 'embedded in skill/share/pack trust payloads',
    cliLogin: '/v1/auth/cli-login',
    currentUser: '/v1/user',
    userSkills: '/v1/user/skills',
  },
  supportedTools,
}));

// Stats
app.get('/v1/stats', async (c) => {
  const [skills, installs] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM skills').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COALESCE(SUM(uses_count),0) as count FROM share_links').first<{ count: number }>(),
  ]);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ skills: skills?.count || 0, installs: installs?.count || 0 });
});

// Routes
app.route('/v1/skills', skillsRouter);
app.route('/v1/auth', authRouter);
app.route('/v1/user', userRouter);
app.route('/v1/packs', packsRouter);

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
