// Skills API routes
import { Hono } from 'hono';
import type { Env } from '../index.js';

export const skillsRouter = new Hono<{ Bindings: Env }>();

// List/search skills - only public/listed skills
skillsRouter.get('/', async (c) => {
  const query = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    let results;

    if (query) {
      // Full-text search - only listed skills
      const searchStmt = await c.env.DB.prepare(
        `SELECT s.name, s.namespace, s.description, s.latest_version as version
         FROM skills s
         JOIN skills_fts fts ON s.rowid = fts.rowid
         WHERE skills_fts MATCH ? AND s.listed = 1
         ORDER BY rank
         LIMIT ? OFFSET ?`
      );
      results = await searchStmt.bind(query, limit, offset).all();
    } else {
      // List all - only listed skills
      const stmt = await c.env.DB.prepare(
        `SELECT name, namespace, description, latest_version as version
         FROM skills
         WHERE listed = 1
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      );
      results = await stmt.bind(limit, offset).all();
    }

    return c.json({
      skills: results.results || [],
      total: results.results?.length || 0,
    });
  } catch (e) {
    console.error('Search error:', e);
    return c.json({ error: 'search_failed', message: (e as Error).message }, 500);
  }
});

// Get skill metadata - allow unlisted if you know the name (direct URL)
skillsRouter.get('/:namespace/:name', async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');

  try {
    const stmt = await c.env.DB.prepare(
      `SELECT s.*, s.latest_version as version
       FROM skills s
       WHERE s.namespace = ? AND s.name = ?
       LIMIT 1`
    );
    const result = await stmt.bind(namespace, name).first();

    if (!result) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    // Get latest version details
    const versionStmt = await c.env.DB.prepare(
      `SELECT * FROM skill_versions
       WHERE skill_id = ? AND version = ?
       LIMIT 1`
    );
    const version = await versionStmt.bind(result.id, result.version).first();

    return c.json({
      name: result.name,
      namespace: result.namespace,
      description: result.description,
      version: result.version,
      author: result.author,
      homepage: result.homepage,
      repository: result.repository,
      keywords: result.keywords ? JSON.parse(result.keywords) : [],
      tarballUrl: version?.tarball_url || '',
      size: version?.size || 0,
      checksum: version?.checksumsha256 || '',
      listed: !!result.listed,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    });
  } catch (e) {
    console.error('Get skill error:', e);
    return c.json({ error: 'get_failed', message: (e as Error).message }, 500);
  }
});

// Get skill versions
skillsRouter.get('/:namespace/:name/versions', async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');

  try {
    const skillStmt = await c.env.DB.prepare(
      `SELECT id FROM skills WHERE namespace = ? AND name = ?`
    );
    const skill = await skillStmt.bind(namespace, name).first();

    if (!skill) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    const versionsStmt = await c.env.DB.prepare(
      `SELECT version, size, checksumsha256, created_at as createdAt
       FROM skill_versions
       WHERE skill_id = ?
       ORDER BY created_at DESC`
    );
    const versions = await versionsStmt.bind(skill.id).all();

    return c.json({ versions: versions.results || [] });
  } catch (e) {
    return c.json({ error: 'get_failed', message: (e as Error).message }, 500);
  }
});

// Download tarball
skillsRouter.get('/:namespace/:name/tarball/:version', async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');
  const version = c.req.param('version');

  try {
    const skillStmt = await c.env.DB.prepare(
      `SELECT id FROM skills WHERE namespace = ? AND name = ?`
    );
    const skill = await skillStmt.bind(namespace, name).first();

    if (!skill) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    const versionStmt = await c.env.DB.prepare(
      `SELECT tarball_url, size FROM skill_versions
       WHERE skill_id = ? AND version = ?`
    );
    const versionData = await versionStmt.bind(skill.id, version).first();

    if (!versionData) {
      return c.json({ error: 'not_found', message: 'Version not found' }, 404);
    }

    const object = await c.env.SKILLPACK_BUCKET.get(versionData.tarball_url);

    if (!object) {
      return c.json({ error: 'not_found', message: 'Tarball not found' }, 404);
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': versionData.size.toString(),
        'Content-Disposition': `attachment; filename="${name}-${version}.tgz"`,
      },
    });
  } catch (e) {
    console.error('Download error:', e);
    return c.json({ error: 'download_failed', message: (e as Error).message }, 500);
  }
});

// Publish skill - no auth required, defaults to unlisted
skillsRouter.post('/', async (c) => {
  const formData = await c.req.formData();

  const name = formData.get('name')?.toString();
  const namespace = formData.get('namespace')?.toString() || 'anonymous';
  const description = formData.get('description')?.toString() || '';
  const version = formData.get('version')?.toString();
  const listed = formData.get('listed')?.toString() === 'true';
  const tarball = formData.get('tarball') as File | null;

  if (!name || !version || !tarball) {
    return c.json(
      { error: 'validation_error', message: 'name, version, and tarball are required' },
      400
    );
  }

  // Spam protection: rate limit unlisted publishes
  // TODO: Implement proper rate limiting with KV

  try {
    const arrayBuffer = await tarball.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const checksum = await calculateChecksum(buffer);

    // Store in R2
    const r2Key = `${namespace}/${name}/${version}.tgz`;
    await c.env.SKILLPACK_BUCKET.put(r2Key, buffer, {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: { checksum, size: buffer.length.toString() },
    });

    // Get or create skill
    let skillStmt = await c.env.DB.prepare(
      `SELECT id FROM skills WHERE namespace = ? AND name = ?`
    );
    let skill = await skillStmt.bind(namespace, name).first();

    let skillId: string;

    if (skill) {
      skillId = skill.id;
      await c.env.DB.prepare(
        `UPDATE skills SET latest_version = ?, listed = ?, updated_at = unixepoch() WHERE id = ?`
      ).bind(version, listed ? 1 : 0, skillId).run();
    } else {
      skillId = generateId();
      await c.env.DB.prepare(
        `INSERT INTO skills (id, name, namespace, description, latest_version, listed)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(skillId, name, namespace, description, version, listed ? 1 : 0).run();
    }

    // Create version record
    const versionId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO skill_versions (id, skill_id, version, tarball_url, size, checksumsha256)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(versionId, skillId, version, r2Key, buffer.length, checksum).run();

    return c.json({
      id: skillId,
      name,
      namespace,
      version,
      listed,
      tarballUrl: `/v1/skills/${namespace}/${name}/tarball/${version}`,
    }, 201);
  } catch (e) {
    console.error('Publish error:', e);
    return c.json({ error: 'publish_failed', message: (e as Error).message }, 500);
  }
});

// Delete skill - auth required
skillsRouter.delete('/:namespace/:name', authenticate, async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');

  try {
    await c.env.DB.prepare(
      `DELETE FROM skills WHERE namespace = ? AND name = ?`
    ).bind(namespace, name).run();

    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: 'delete_failed', message: (e as Error).message }, 500);
  }
});

// Auth middleware
async function authenticate(c: any, next: () => Promise<Response>) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', message: 'Missing or invalid authorization' }, 401);
  }

  const token = authHeader.slice(7);

  const stmt = await c.env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN api_keys k ON u.id = k.user_id
     WHERE k.key_hash = ?`
  );
  const user = await stmt.bind(hashKey(token)).first();

  if (!user) {
    const tokenStmt = await c.env.DB.prepare(
      `SELECT user_id FROM oauth_tokens WHERE access_token = ? AND expires_at > unixepoch()`
    );
    const oauthToken = await tokenStmt.bind(token).first();

    if (!oauthToken) {
      return c.json({ error: 'unauthorized', message: 'Invalid token' }, 401);
    }

    const userStmt = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`);
    const oauthUser = await userStmt.bind(oauthToken.user_id).first();
    c.set('user', oauthUser);
  } else {
    c.set('user', user);
  }

  await next();
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function calculateChecksum(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hashKey(key: string): string {
  return key.slice(0, 32);
}