import { Hono } from 'hono';
import type { Env } from '../index.js';
import { rateLimiters } from '../middleware/rateLimit.js';

export const skillsRouter = new Hono<{ Bindings: Env }>();

function isPublicSkill(privacy: unknown): boolean {
  return privacy === 'public';
}

function parseVersionMetadata(raw: unknown): {
  author: string | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[];
} {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { author: null, homepage: null, repository: null, keywords: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      author: typeof parsed.author === 'string' ? parsed.author : null,
      homepage: typeof parsed.homepage === 'string' ? parsed.homepage : null,
      repository: typeof parsed.repository === 'string' ? parsed.repository : null,
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((value): value is string => typeof value === 'string')
        : [],
    };
  } catch {
    return { author: null, homepage: null, repository: null, keywords: [] };
  }
}

function buildTarballUrl(namespace: string, name: string, version: string): string {
  return `/v1/skills/${namespace}/${name}/tarball/${version}`;
}

// List/search skills - only public skills
skillsRouter.get('/', async (c) => {
  const query = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    let results;

    if (query) {
      // Full-text search - only public skills
      const searchStmt = await c.env.DB.prepare(
        `SELECT s.name, s.namespace, s.description, s.latest_version as version
         FROM skills s
         JOIN skills_fts fts ON s.rowid = fts.rowid
         WHERE skills_fts MATCH ? AND s.privacy = 'public'
         ORDER BY rank
         LIMIT ? OFFSET ?`
      );
      results = await searchStmt.bind(query, limit, offset).all();
    } else {
      // List all - only public skills
      const stmt = await c.env.DB.prepare(
        `SELECT name, namespace, description, latest_version as version
         FROM skills
         WHERE privacy = 'public'
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

// Publish skill - no auth required, defaults to unlisted
skillsRouter.post('/', rateLimiters.publish, async (c) => {
  const formData = await c.req.formData();

  const name = formData.get('name')?.toString();
  const namespace = formData.get('namespace')?.toString() || 'anonymous';
  const description = formData.get('description')?.toString() || '';
  const version = formData.get('version')?.toString();
  const listed = formData.get('listed')?.toString() === 'true';
  const signature = formData.get('signature')?.toString();
  const publicKey = formData.get('public_key')?.toString();
  const tarball = formData.get('tarball') as File | null;
  const privacy = listed ? 'public' : 'unlisted';

  if (!name || !version || !tarball) {
    return c.json(
      { error: 'validation_error', message: 'name, version, and tarball are required' },
      400
    );
  }

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
        `UPDATE skills SET latest_version = ?, privacy = ?, updated_at = unixepoch() WHERE id = ?`
      ).bind(version, privacy, skillId).run();
    } else {
      skillId = generateId();
      await c.env.DB.prepare(
        `INSERT INTO skills (id, name, namespace, description, latest_version, privacy)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(skillId, name, namespace, description, version, privacy).run();
    }

    // Create version record with signature if provided
    const versionId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO skill_versions (id, skill_id, version, tarball_url, size, checksumsha256, signature, public_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(versionId, skillId, version, r2Key, buffer.length, checksum, signature || null, publicKey || null).run();

    return c.json({
      id: skillId,
      name,
      namespace,
      version,
      listed: privacy === 'public',
      tarballUrl: `/v1/skills/${namespace}/${name}/tarball/${version}`,
      signature: signature ? true : false,
    }, 201);
  } catch (e) {
    console.error('Publish error:', e);
    return c.json({ error: 'publish_failed', message: (e as Error).message }, 500);
  }
});

// Create share link - rate limited
skillsRouter.post('/:namespace/:name/share', rateLimiters.createShare, async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');
  const body = await c.req.json();

  try {
    // Get skill
    const skillStmt = await c.env.DB.prepare(
      `SELECT id FROM skills WHERE namespace = ? AND name = ?`
    );
    const skill = await skillStmt.bind(namespace, name).first();

    if (!skill) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    // Generate token (base62, 8 chars, no lookalikes)
    const token = generateShareToken();

    // Parse options
    const oneTime = body.one_time === true;
    const expiresAt = body.expires_at ? Math.floor(body.expires_at / 1000) : null;
    const maxUses = body.max_uses || null;
    const passwordHash = body.password ? await hashPassword(body.password) : null;

    // Create share link
    const shareId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO share_links (id, skill_id, token, one_time, expires_at, max_uses, password_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(shareId, skill.id, token, oneTime ? 1 : 0, expiresAt, maxUses, passwordHash, null).run();

    const url = `https://skilo.xyz/s/${token}`;

    return c.json({
      token,
      url,
      oneTime,
      expiresAt: expiresAt ? expiresAt * 1000 : null,
      maxUses,
    }, 201);
  } catch (e) {
    console.error('Share creation error:', e);
    return c.json({ error: 'share_failed', message: (e as Error).message }, 500);
  }
});

// Resolve share link - rate limited
skillsRouter.get('/share/:token', rateLimiters.resolveShare, async (c) => {
  const token = c.req.param('token');

  try {
    const shareStmt = await c.env.DB.prepare(
      `SELECT sl.*, s.name, s.namespace, s.description, s.latest_version,
              s.created_at, s.updated_at, sv.tarball_url, sv.size,
              sv.checksumsha256, sv.metadata_json
       FROM share_links sl
       JOIN skills s ON sl.skill_id = s.id
       LEFT JOIN skill_versions sv ON s.id = sv.skill_id AND sv.version = s.latest_version
       WHERE sl.token = ?`
    );
    const share = await shareStmt.bind(token).first();

    if (!share) {
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'expired', message: 'Share link has expired' }, 410);
    }

    if (share.max_uses && share.uses_count >= share.max_uses) {
      return c.json({ error: 'exhausted', message: 'Share link has reached max uses' }, 410);
    }

    if (share.password_hash) {
      return c.json({
        requiresPassword: true,
        message: 'Password required',
      });
    }

    await c.env.DB.prepare(
      `UPDATE share_links SET uses_count = uses_count + 1, opened_at = unixepoch() WHERE id = ?`
    ).bind(share.id).run();

    if (share.one_time) {
      await c.env.DB.prepare(
        `UPDATE share_links SET max_uses = 1, uses_count = 1 WHERE id = ?`
      ).bind(share.id).run();
    }

    const metadata = parseVersionMetadata(share.metadata_json);

    return c.json({
      skill: {
        name: share.name,
        namespace: share.namespace,
        description: share.description,
        version: share.latest_version,
        author: metadata.author,
        homepage: metadata.homepage,
        repository: metadata.repository,
        keywords: metadata.keywords,
        tarballUrl: buildTarballUrl(share.namespace, share.name, share.latest_version),
        size: share.size || 0,
        checksum: share.checksumsha256 || '',
        listed: false,
        createdAt: share.created_at,
        updatedAt: share.updated_at,
      },
      requiresPassword: false,
    });
  } catch (e) {
    console.error('Share resolve error:', e);
    return c.json({ error: 'resolve_failed', message: (e as Error).message }, 500);
  }
});

// Verify share password
skillsRouter.post('/share/:token/verify', async (c) => {
  const token = c.req.param('token');
  const body = await c.req.json();
  const password = body.password;

  if (!password) {
    return c.json({ error: 'validation_error', message: 'Password is required' }, 400);
  }

  try {
    const shareStmt = await c.env.DB.prepare(
      `SELECT sl.*, s.name, s.namespace, s.description, s.latest_version,
              s.created_at, s.updated_at, sv.tarball_url, sv.size,
              sv.checksumsha256, sv.metadata_json
       FROM share_links sl
       JOIN skills s ON sl.skill_id = s.id
       LEFT JOIN skill_versions sv ON s.id = sv.skill_id AND sv.version = s.latest_version
       WHERE sl.token = ?`
    );
    const share = await shareStmt.bind(token).first();

    if (!share) {
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    const passwordValid = await verifyPassword(password, share.password_hash);
    if (!passwordValid) {
      return c.json({ error: 'unauthorized', message: 'Invalid password' }, 401);
    }

    await c.env.DB.prepare(
      `UPDATE share_links SET uses_count = uses_count + 1, opened_at = unixepoch() WHERE id = ?`
    ).bind(share.id).run();

    const metadata = parseVersionMetadata(share.metadata_json);

    return c.json({
      skill: {
        name: share.name,
        namespace: share.namespace,
        description: share.description,
        version: share.latest_version,
        author: metadata.author,
        homepage: metadata.homepage,
        repository: metadata.repository,
        keywords: metadata.keywords,
        tarballUrl: buildTarballUrl(share.namespace, share.name, share.latest_version),
        size: share.size || 0,
        checksum: share.checksumsha256 || '',
        listed: false,
        createdAt: share.created_at,
        updatedAt: share.updated_at,
      },
    });
  } catch (e) {
    console.error('Password verify error:', e);
    return c.json({ error: 'verify_failed', message: (e as Error).message }, 500);
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

    const versionStmt = await c.env.DB.prepare(
      `SELECT tarball_url, size, checksumsha256, metadata_json
       FROM skill_versions
       WHERE skill_id = ? AND version = ?
       LIMIT 1`
    );
    const version = await versionStmt.bind(result.id, result.version).first();
    const metadata = parseVersionMetadata(version?.metadata_json);

    return c.json({
      name: result.name,
      namespace: result.namespace,
      description: result.description,
      version: result.version,
      author: metadata.author,
      homepage: metadata.homepage,
      repository: metadata.repository,
      keywords: metadata.keywords,
      tarballUrl: buildTarballUrl(result.namespace, result.name, result.version),
      size: version?.size || 0,
      checksum: version?.checksumsha256 || '',
      listed: isPublicSkill(result.privacy),
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

// Get skill verification info (checksum, signature)
skillsRouter.get('/:namespace/:name/verify', async (c) => {
  const namespace = c.req.param('namespace');
  const name = c.req.param('name');
  const version = c.req.query('version');

  try {
    const skillStmt = await c.env.DB.prepare(
      `SELECT s.id, s.latest_version, sv.version as v, sv.checksumsha256, sv.signature
       FROM skills s
       LEFT JOIN skill_versions sv ON s.id = sv.skill_id
       WHERE s.namespace = ? AND s.name = ? AND (sv.version = ? OR ? IS NULL)
       ORDER BY sv.created_at DESC
       LIMIT 1`
    );
    const result = await skillStmt.bind(namespace, name, version, version).first();

    if (!result) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    return c.json({
      namespace,
      name,
      version: result.v || result.latest_version,
      checksum: result.checksumsha256 || '',
      signature: result.signature || null,
      verified: !!result.signature,
    });
  } catch (e) {
    return c.json({ error: 'verify_failed', message: (e as Error).message }, 500);
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

// Generate share token (base62, 8 chars, no lookalikes)
function generateShareToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // No 0, O, I, l
  let token = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    token += chars[array[i] % chars.length];
  }
  return token;
}

// Simple password hashing using SHA-256 (for production, use bcrypt)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}
