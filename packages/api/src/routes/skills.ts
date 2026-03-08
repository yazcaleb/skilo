import { Hono } from 'hono';
import type { Env } from '../index.js';
import { rateLimiters } from '../middleware/rateLimit.js';
import {
  analyzeSkillTarball,
  buildTrustInfo,
  extractSkillContentFromTarball,
  needsAuditRefresh,
  parseVersionMetadata,
  type PublisherStatus,
} from '../utils/trust.js';

export const skillsRouter = new Hono<{ Bindings: Env }>();

type SkillIdRow = { id: string };
type SkillRecordRow = {
  id: string;
  name: string;
  namespace: string;
  description: string;
  version: string;
  privacy: string;
  created_at: number;
  updated_at: number;
};
type SkillVersionRow = {
  tarball_url: string;
  size: number;
  checksumsha256: string;
  metadata_json: string | null;
  signature: string | null;
};
type ShareRow = {
  id: string;
  skill_id: string;
  token: string;
  one_time: number;
  expires_at: number | null;
  max_uses: number | null;
  uses_count: number;
  password_hash: string | null;
  name: string;
  namespace: string;
  description: string;
  latest_version: string;
  created_at: number;
  updated_at: number;
  tarball_url: string | null;
  size: number | null;
  checksumsha256: string | null;
  metadata_json: string | null;
  signature: string | null;
  privacy: string;
};

function isPublicSkill(privacy: unknown): boolean {
  return privacy === 'public';
}

function buildTarballUrl(namespace: string, name: string, version: string): string {
  return `/v1/skills/${namespace}/${name}/tarball/${version}`;
}

function buildShareTarballUrl(token: string): string {
  return `/v1/skills/share/${token}/tarball`;
}

function buildShareContentUrl(token: string): string {
  return `/v1/skills/share/${token}/content`;
}

function isShareExhausted(share: Pick<ShareRow, 'one_time' | 'max_uses' | 'uses_count'>): boolean {
  if (share.one_time && share.uses_count >= 1) {
    return true;
  }

  return Boolean(share.max_uses && share.uses_count >= share.max_uses);
}

async function getShareRecord(db: D1Database, token: string): Promise<ShareRow | null> {
  const shareStmt = await db.prepare(
    `SELECT sl.*, s.name, s.namespace, s.description, s.latest_version,
            s.created_at, s.updated_at, sv.tarball_url, sv.size,
            sv.checksumsha256, sv.metadata_json, sv.signature, s.privacy
     FROM share_links sl
     JOIN skills s ON sl.skill_id = s.id
     LEFT JOIN skill_versions sv ON s.id = sv.skill_id AND sv.version = s.latest_version
     WHERE sl.token = ?`
  );
  return shareStmt.bind(token).first<ShareRow>();
}

async function refreshStoredMetadataIfNeeded(
  env: Env,
  input: {
    skillId: string;
    version: string;
    tarballUrl: string | null;
    metadataJson: string | null;
    signature: string | null;
    sourceType: 'registry' | 'share';
  }
): Promise<string | null> {
  if (!input.tarballUrl || !needsAuditRefresh(input.metadataJson)) {
    return input.metadataJson;
  }

  const object = await env.SKILLPACK_BUCKET.get(input.tarballUrl);
  if (!object) {
    return input.metadataJson;
  }

  const existing = parseVersionMetadata(input.metadataJson);
  const publisherStatus: PublisherStatus = existing.publisherStatus === 'verified' || existing.publisherStatus === 'claimed'
    ? existing.publisherStatus
    : input.signature
      ? 'claimed'
      : 'anonymous';
  const refreshed = await analyzeSkillTarball(
    new Uint8Array(await object.arrayBuffer()),
    publisherStatus,
    input.sourceType
  );
  const refreshedJson = JSON.stringify(refreshed);

  await env.DB.prepare(
    `UPDATE skill_versions SET metadata_json = ? WHERE skill_id = ? AND version = ?`
  ).bind(refreshedJson, input.skillId, input.version).run();

  return refreshedJson;
}

function buildSharePayload(share: ShareRow) {
  const metadata = parseVersionMetadata(share.metadata_json);
  const trust = buildTrustInfo({
    signature: share.signature,
    privacy: share.privacy,
    checksum: share.checksumsha256,
    metadataJson: share.metadata_json,
    sourceType: 'share',
  });

  return {
    skill: {
      name: share.name,
      namespace: share.namespace,
      description: share.description,
      version: share.latest_version,
      author: metadata.author,
      homepage: metadata.homepage,
      repository: metadata.repository,
      keywords: metadata.keywords,
      tarballUrl: buildShareTarballUrl(share.token),
      contentUrl: buildShareContentUrl(share.token),
      size: share.size || 0,
      checksum: share.checksumsha256 || '',
      listed: false,
      verified: trust.verified,
      trust,
      createdAt: share.created_at,
      updatedAt: share.updated_at,
    },
    link: {
      token: share.token,
      oneTime: Boolean(share.one_time),
      expiresAt: share.expires_at ? share.expires_at * 1000 : null,
      maxUses: share.max_uses || null,
      usesCount: share.uses_count || 0,
      passwordProtected: Boolean(share.password_hash),
    },
    trust,
  };
}

function getSharePassword(c: any): string | null {
  const header = c.req.header('X-Skilo-Share-Password');
  if (header && header.trim()) {
    return header.trim();
  }

  const query = c.req.query('password');
  return query && query.trim() ? query.trim() : null;
}

async function ensureShareAccess(share: ShareRow, password?: string | null): Promise<Response | null> {
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return Response.json({ error: 'expired', message: 'Share link has expired' }, { status: 410 });
  }

  if (isShareExhausted(share)) {
    return Response.json({ error: 'exhausted', message: 'Share link has reached max uses' }, { status: 410 });
  }

  if (share.password_hash) {
    if (!password) {
      return Response.json({ error: 'unauthorized', message: 'Password required' }, { status: 401 });
    }

    const passwordValid = await verifyPassword(password, share.password_hash);
    if (!passwordValid) {
      return Response.json({ error: 'unauthorized', message: 'Invalid password' }, { status: 401 });
    }
  }

  return null;
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
    const publisher = await resolvePublisher(c);
    const arrayBuffer = await tarball.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const checksum = await calculateChecksum(buffer);
    const publisherStatus: PublisherStatus = publisher
      ? (signature ? 'verified' : 'claimed')
      : 'anonymous';
    const versionMetadata = await analyzeSkillTarball(buffer, publisherStatus);

    if (versionMetadata.audit.status === 'blocked') {
      return c.json({
        error: 'audit_blocked',
        message: versionMetadata.audit.riskSummary[0] || 'Skill bundle failed security audit',
        trust: buildTrustInfo({
          signature,
          privacy,
          checksum,
          metadataJson: JSON.stringify(versionMetadata),
        }),
      }, 400);
    }

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
    let skill = await skillStmt.bind(namespace, name).first<SkillIdRow>();

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

    const existingVersion = await c.env.DB.prepare(
      `SELECT id FROM skill_versions WHERE skill_id = ? AND version = ?`
    ).bind(skillId, version).first<{ id: string }>();

    if (existingVersion) {
      await c.env.DB.prepare(
        `UPDATE skill_versions
         SET tarball_url = ?, size = ?, checksumsha256 = ?, signature = ?, public_key = ?, metadata_json = ?
         WHERE id = ?`
      ).bind(
        r2Key,
        buffer.length,
        checksum,
        signature || null,
        publicKey || null,
        JSON.stringify(versionMetadata),
        existingVersion.id
      ).run();
    } else {
      const versionId = generateId();
      await c.env.DB.prepare(
        `INSERT INTO skill_versions (id, skill_id, version, tarball_url, size, checksumsha256, signature, public_key, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        versionId,
        skillId,
        version,
        r2Key,
        buffer.length,
        checksum,
        signature || null,
        publicKey || null,
        JSON.stringify(versionMetadata)
      ).run();
    }

    const trust = buildTrustInfo({
      signature,
      privacy,
      checksum,
      metadataJson: JSON.stringify(versionMetadata),
    });

    return c.json({
      id: skillId,
      name,
      namespace,
      version,
      listed: privacy === 'public',
      tarballUrl: `/v1/skills/${namespace}/${name}/tarball/${version}`,
      signature: signature ? true : false,
      trust,
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
  const body = await c.req.json<Record<string, unknown>>();

  try {
    // Get skill
    const skillStmt = await c.env.DB.prepare(
      `SELECT id FROM skills WHERE namespace = ? AND name = ?`
    );
    const skill = await skillStmt.bind(namespace, name).first<SkillIdRow>();

    if (!skill) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    // Generate token (base62, 8 chars, no lookalikes)
    const token = generateShareToken();

    // Parse options
    const oneTime = body.one_time === true;
    const expiresAt = typeof body.expires_at === 'number' ? Math.floor(body.expires_at / 1000) : null;
    const maxUses = typeof body.max_uses === 'number' ? body.max_uses : null;
    const passwordHash = typeof body.password === 'string' ? await hashPassword(body.password) : null;

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
  const token = c.req.param('token') || '';

  try {
    const share = await getShareRecord(c.env.DB, token);

    if (!share) {
      // Fallback: check KV for ref-links (skilo.xyz/s/ for arbitrary refs)
      const refLink = await c.env.SKILLPACK_KV.get(`ref-link:${token}`, { type: 'json' }) as { ref: string; createdAt: number } | null;
      if (refLink) {
        return c.json({ type: 'ref-link', ref: refLink.ref, token });
      }
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'expired', message: 'Share link has expired' }, 410);
    }

    if (isShareExhausted(share)) {
      return c.json({ error: 'exhausted', message: 'Share link has reached max uses' }, 410);
    }

    if (share.password_hash) {
      return c.json({
        requiresPassword: true,
        message: 'Password required',
      });
    }

    share.metadata_json = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: share.skill_id,
      version: share.latest_version,
      tarballUrl: share.tarball_url,
      metadataJson: share.metadata_json,
      signature: share.signature,
      sourceType: 'share',
    });

    return c.json({
      ...buildSharePayload(share),
      requiresPassword: false,
    });
  } catch (e) {
    console.error('Share resolve error:', e);
    return c.json({ error: 'resolve_failed', message: (e as Error).message }, 500);
  }
});

// Verify share password
skillsRouter.post('/share/:token/verify', async (c) => {
  const token = c.req.param('token') || '';
  const body = await c.req.json<Record<string, unknown>>();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password) {
    return c.json({ error: 'validation_error', message: 'Password is required' }, 400);
  }

  try {
    const share = await getShareRecord(c.env.DB, token);

    if (!share) {
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    const accessError = await ensureShareAccess(share, password);
    if (accessError) {
      return accessError;
    }

    share.metadata_json = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: share.skill_id,
      version: share.latest_version,
      tarballUrl: share.tarball_url,
      metadataJson: share.metadata_json,
      signature: share.signature,
      sourceType: 'share',
    });

    return c.json(buildSharePayload(share));
  } catch (e) {
    console.error('Password verify error:', e);
    return c.json({ error: 'verify_failed', message: (e as Error).message }, 500);
  }
});

skillsRouter.get('/share/:token/content', rateLimiters.resolveShare, async (c) => {
  const token = c.req.param('token') || '';

  try {
    const share = await getShareRecord(c.env.DB, token);
    if (!share) {
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    const accessError = await ensureShareAccess(share, getSharePassword(c));
    if (accessError) {
      return accessError;
    }

    share.metadata_json = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: share.skill_id,
      version: share.latest_version,
      tarballUrl: share.tarball_url,
      metadataJson: share.metadata_json,
      signature: share.signature,
      sourceType: 'share',
    });

    const object = await c.env.SKILLPACK_BUCKET.get(share.tarball_url || '');
    if (!object) {
      return c.json({ error: 'not_found', message: 'Tarball not found' }, 404);
    }

    const content = await extractSkillContentFromTarball(new Uint8Array(await object.arrayBuffer()));
    if (!content) {
      return c.json({ error: 'not_found', message: 'SKILL.md not found in tarball' }, 404);
    }

    return new Response(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('Share content error:', e);
    return c.json({ error: 'content_failed', message: (e as Error).message }, 500);
  }
});

skillsRouter.get('/share/:token/tarball', rateLimiters.resolveShare, async (c) => {
  const token = c.req.param('token') || '';

  try {
    const share = await getShareRecord(c.env.DB, token);
    if (!share) {
      return c.json({ error: 'not_found', message: 'Share link not found' }, 404);
    }

    const accessError = await ensureShareAccess(share, getSharePassword(c));
    if (accessError) {
      return accessError;
    }

    share.metadata_json = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: share.skill_id,
      version: share.latest_version,
      tarballUrl: share.tarball_url,
      metadataJson: share.metadata_json,
      signature: share.signature,
      sourceType: 'share',
    });
    const refreshedTrust = buildTrustInfo({
      signature: share.signature,
      privacy: share.privacy,
      checksum: share.checksumsha256,
      metadataJson: share.metadata_json,
      sourceType: 'share',
    });
    if (refreshedTrust.auditStatus === 'blocked') {
      return c.json(
        {
          error: 'audit_blocked',
          message: refreshedTrust.riskSummary[0] || 'Share link install blocked by security audit',
          trust: refreshedTrust,
        },
        403
      );
    }

    const object = await c.env.SKILLPACK_BUCKET.get(share.tarball_url || '');
    if (!object) {
      return c.json({ error: 'not_found', message: 'Tarball not found' }, 404);
    }

    await c.env.DB.prepare(
      `UPDATE share_links SET uses_count = uses_count + 1, opened_at = unixepoch() WHERE id = ?`
    ).bind(share.id).run();

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(share.size || 0),
        'Content-Disposition': `attachment; filename="${share.name}-${share.latest_version}.tgz"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('Share tarball error:', e);
    return c.json({ error: 'download_failed', message: (e as Error).message }, 500);
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
    const result = await stmt.bind(namespace, name).first<SkillRecordRow>();

    if (!result) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    const versionStmt = await c.env.DB.prepare(
      `SELECT tarball_url, size, checksumsha256, metadata_json, signature
       FROM skill_versions
       WHERE skill_id = ? AND version = ?
       LIMIT 1`
    );
    const version = await versionStmt.bind(result.id, result.version).first<SkillVersionRow>();
    const metadataJson = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: result.id,
      version: result.version,
      tarballUrl: version?.tarball_url || null,
      metadataJson: version?.metadata_json || null,
      signature: version?.signature || null,
      sourceType: 'registry',
    });
    const metadata = parseVersionMetadata(metadataJson);
    const trust = buildTrustInfo({
      signature: version?.signature,
      privacy: result.privacy,
      checksum: version?.checksumsha256,
      metadataJson,
    });

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
      verified: trust.verified,
      trust,
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
      `SELECT id, privacy FROM skills WHERE namespace = ? AND name = ?`
    );
    const skill = await skillStmt.bind(namespace, name).first<{ id: string; privacy: string }>();

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
    const skill = await skillStmt.bind(namespace, name).first<SkillIdRow>();

    if (!skill) {
      return c.json({ error: 'not_found', message: 'Skill not found' }, 404);
    }

    const versionStmt = await c.env.DB.prepare(
      `SELECT tarball_url, size, metadata_json, signature, checksumsha256 FROM skill_versions
       WHERE skill_id = ? AND version = ?`
    );
    const versionData = await versionStmt.bind(skill.id, version).first<{
      tarball_url: string;
      size: number;
      metadata_json: string | null;
      signature: string | null;
      checksumsha256: string | null;
    }>();

    if (!versionData) {
      return c.json({ error: 'not_found', message: 'Version not found' }, 404);
    }

    const metadataJson = await refreshStoredMetadataIfNeeded(c.env, {
      skillId: skill.id,
      version,
      tarballUrl: versionData.tarball_url,
      metadataJson: versionData.metadata_json,
      signature: versionData.signature,
      sourceType: 'registry',
    });
    const trust = buildTrustInfo({
      signature: versionData.signature,
      privacy: skill.privacy,
      checksum: versionData.checksumsha256,
      metadataJson,
      sourceType: 'registry',
    });
    if (trust.auditStatus === 'blocked') {
      return c.json(
        {
          error: 'audit_blocked',
          message: trust.riskSummary[0] || 'Skill download blocked by security audit',
          trust,
        },
        403
      );
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

async function resolvePublisher(c: any): Promise<{ id: string; username: string } | null> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const apiKeyUser = await c.env.DB.prepare(
    `SELECT u.id, u.username FROM users u
     JOIN api_keys k ON u.id = k.user_id
     WHERE k.key_hash = ?`
  ).bind(hashKey(token)).first() as { id: string; username: string } | null;

  if (apiKeyUser) {
    return apiKeyUser;
  }

  const oauthToken = await c.env.DB.prepare(
    `SELECT user_id FROM oauth_tokens WHERE access_token = ? AND expires_at > unixepoch()`
  ).bind(token).first() as { user_id: string } | null;

  if (!oauthToken) {
    return null;
  }

  return c.env.DB.prepare(
    `SELECT id, username FROM users WHERE id = ?`
  ).bind(oauthToken.user_id).first() as Promise<{ id: string; username: string } | null>;
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
