// Packs API routes - bulk share collections
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { rateLimiters } from '../middleware/rateLimit.js';
import { aggregatePackTrust, analyzeSkillTarball, buildTrustInfo, needsAuditRefresh, parseVersionMetadata, type PublisherStatus } from '../utils/trust.js';
import { resolveCatalogEntry } from '../utils/catalog.js';

export const packsRouter = new Hono<{ Bindings: Env }>();

interface ShareLookupRow {
  id: string;
  token: string;
  skill_id: string;
  namespace?: string;
  name?: string;
  latest_version?: string;
}

interface PackRow {
  id: string;
  name: string | null;
  token: string;
}

interface PackItemRow {
  skillId: string;
  shareLinkId: string;
  shareToken: string;
  namespace: string;
  name: string;
  description: string | null;
  version: string;
  verified: boolean;
  visibility: 'public' | 'unlisted';
  checksum: string | null;
  signature: string | null;
  metadataJson: string | null;
  tarballUrl: string | null;
  position: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createRandomToken(length: number = 8): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes).slice(0, length);
}

async function createDeterministicToken(seed: string, length: number = 8): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return encodeBase64Url(new Uint8Array(digest).slice(0, 8)).slice(0, length);
}

async function getPackByToken(db: D1Database, token: string): Promise<PackRow | null> {
  return db.prepare(
    `SELECT id, name, token FROM packs WHERE token = ?`
  ).bind(token).first<PackRow>();
}

async function getPackItems(db: D1Database, packId: string): Promise<PackItemRow[]> {
  const items = await db.prepare(
    `SELECT pi.position,
            s.id as skillId,
            sl.id as shareLinkId,
            sl.token as shareToken,
            s.namespace,
            s.name,
            s.description,
            s.latest_version as version,
            sv.checksumsha256,
            sv.signature,
            sv.metadata_json,
            sv.tarball_url,
            s.privacy
     FROM pack_items pi
     JOIN share_links sl ON pi.share_link_id = sl.id
     JOIN skills s ON sl.skill_id = s.id
     LEFT JOIN skill_versions sv ON s.id = sv.skill_id AND sv.version = s.latest_version
     WHERE pi.pack_id = ?
     ORDER BY pi.position`
  ).bind(packId).all();

  return (items.results || []).map((row: any) => ({
    skillId: row.skillId,
    shareLinkId: row.shareLinkId,
    shareToken: row.shareToken,
    namespace: row.namespace,
    name: row.name,
    description: row.description,
    version: row.version,
    verified: Boolean(row.signature),
    visibility: row.privacy === 'public' ? 'public' : 'unlisted',
    checksum: row.checksumsha256,
    signature: row.signature,
    metadataJson: row.metadata_json,
    tarballUrl: row.tarball_url,
    position: row.position,
  }));
}

async function refreshPackItemMetadataIfNeeded(env: Env, item: PackItemRow): Promise<PackItemRow> {
  if (!item.tarballUrl || !needsAuditRefresh(item.metadataJson)) {
    return item;
  }

  const object = await env.SKILLPACK_BUCKET.get(item.tarballUrl);
  if (!object) {
    return item;
  }

  const existing = parseVersionMetadata(item.metadataJson);
  const publisherStatus: PublisherStatus = existing.publisherStatus === 'verified' || existing.publisherStatus === 'claimed'
    ? existing.publisherStatus
    : item.signature
      ? 'claimed'
      : 'anonymous';
  const refreshed = await analyzeSkillTarball(
    new Uint8Array(await object.arrayBuffer()),
    publisherStatus,
    'share'
  );
  const refreshedJson = JSON.stringify(refreshed);

  await env.DB.prepare(
    `UPDATE skill_versions SET metadata_json = ? WHERE skill_id = ? AND version = ?`
  ).bind(refreshedJson, item.skillId, item.version).run();

  return { ...item, metadataJson: refreshedJson };
}

async function packTokenMatches(
  db: D1Database,
  token: string,
  expectedShareTokens: string[]
): Promise<boolean> {
  const pack = await getPackByToken(db, token);
  if (!pack) {
    return false;
  }

  const items = await getPackItems(db, pack.id);
  return items.length === expectedShareTokens.length
    && items.every((item, index) => item.shareToken === expectedShareTokens[index]);
}

function dedupeSharesInOrder(rows: ShareLookupRow[]): Array<{ id: string; token: string }> {
  const uniqueShares: Array<{ id: string; token: string }> = [];
  const seenSkills = new Set<string>();

  for (const row of rows) {
    const skillKey = `${row.skill_id}:${row.latest_version || ''}`;
    if (seenSkills.has(skillKey)) {
      continue;
    }
    seenSkills.add(skillKey);
    uniqueShares.push({ id: row.id, token: row.token });
  }

  return uniqueShares;
}

async function insertPack(
  db: D1Database,
  name: string,
  token: string,
  shares: Array<{ id: string; token: string }>
): Promise<void> {
  const packId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO packs (id, token, name) VALUES (?, ?, ?)`
  ).bind(packId, token, name).run();

  const insertStmts = shares.map((share, i) => {
    return db.prepare(
      `INSERT INTO pack_items (pack_id, share_link_id, position) VALUES (?, ?, ?)`
    ).bind(packId, share.id, i);
  });
  await db.batch(insertStmts);
}

// Create a pack
packsRouter.post('/', rateLimiters.createPack, async (c) => {
  const body = await c.req.json();
  const { name, share_tokens } = body;

  if (!name) {
    return c.json(
      { error: 'validation_error', message: 'name is required' },
      400
    );
  }

  if (!Array.isArray(share_tokens) || share_tokens.length === 0) {
    return c.json(
      { error: 'validation_error', message: 'share_tokens must be a non-empty array' },
      400
    );
  }

  if (share_tokens.length > 50) {
    return c.json(
      { error: 'validation_error', message: 'share_tokens cannot exceed 50 items' },
      400
    );
  }

  try {
    // Look up all share tokens
    const placeholders = share_tokens.map(() => '?').join(', ');
    const stmt = await c.env.DB.prepare(
      `SELECT sl.id, sl.token, sl.skill_id, s.namespace, s.name, s.latest_version
       FROM share_links sl
       JOIN skills s ON sl.skill_id = s.id
       WHERE sl.token IN (${placeholders})`
    );
    const result = await stmt.bind(...share_tokens).all();
    const foundTokens = new Map(
      (result.results || []).map((r: any) => [r.token, r as ShareLookupRow])
    );

    // Check for invalid tokens
    const invalidTokens = share_tokens.filter((t: string) => !foundTokens.has(t));
    if (invalidTokens.length > 0) {
      return c.json(
        {
          error: 'validation_error',
          message: `Invalid share tokens: ${invalidTokens.join(', ')}`,
          invalid_tokens: invalidTokens,
        },
        400
      );
    }

    const uniqueShares = dedupeSharesInOrder(
      share_tokens
        .map((token: string) => foundTokens.get(token))
        .filter((row): row is ShareLookupRow => Boolean(row))
    );
    const packToken = createRandomToken();
    await insertPack(c.env.DB, name, packToken, uniqueShares);

    return c.json(
      {
        token: packToken,
        url: `https://skilo.xyz/p/${packToken}`,
        count: uniqueShares.length,
      },
      201
    );
  } catch (e) {
    console.error('Pack creation error:', e);
    return c.json(
      { error: 'create_failed', message: (e as Error).message },
      500
    );
  }
});

packsRouter.post('/subset', rateLimiters.createPack, async (c) => {
  const body = await c.req.json();
  const source = typeof body.source === 'string' ? body.source.trim() : '';
  const keep = Array.isArray(body.keep)
    ? body.keep.map((token: unknown) => String(token).trim()).filter(Boolean)
    : [];

  if (!source) {
    return c.json(
      { error: 'validation_error', message: 'source is required' },
      400
    );
  }

  if (keep.length === 0) {
    return c.json(
      { error: 'validation_error', message: 'keep must be a non-empty array' },
      400
    );
  }

  if (keep.length > 50) {
    return c.json(
      { error: 'validation_error', message: 'keep cannot exceed 50 items' },
      400
    );
  }

  try {
    const sourcePack = await getPackByToken(c.env.DB, source);
    if (!sourcePack) {
      return c.json({ error: 'not_found', message: 'Source pack not found' }, 404);
    }

    const sourceItems = await Promise.all(
      (await getPackItems(c.env.DB, sourcePack.id)).map((item) => refreshPackItemMetadataIfNeeded(c.env, item))
    );
    if (sourceItems.length === 0) {
      return c.json({ error: 'not_found', message: 'Source pack is empty' }, 404);
    }

    const sourceTokenMap = new Map(sourceItems.map((item) => [item.shareToken, item]));
    const invalidTokens = [...new Set(keep)] as string[];
    const missingTokens = invalidTokens.filter((token) => !sourceTokenMap.has(token));
    if (missingTokens.length > 0) {
      return c.json(
        {
          error: 'validation_error',
          message: `keep tokens must belong to the source pack: ${missingTokens.join(', ')}`,
          invalid_tokens: missingTokens,
        },
        400
      );
    }

    const keepSet = new Set(keep);
    const keptItems = sourceItems.filter((item) => keepSet.has(item.shareToken));

    if (keptItems.length === 0) {
      return c.json(
        { error: 'validation_error', message: 'At least one skill must remain in the pack' },
        400
      );
    }

    if (keptItems.some((item) => buildTrustInfo({
      signature: item.signature,
      privacy: item.visibility,
      checksum: item.checksum,
      metadataJson: item.metadataJson,
      sourceType: 'share',
    }).auditStatus === 'blocked')) {
      return c.json(
        { error: 'validation_error', message: 'Blocked skills cannot be included in a derived pack' },
        400
      );
    }

    if (keptItems.length === sourceItems.length) {
      return c.json({
        token: sourcePack.token,
        url: `https://skilo.xyz/p/${sourcePack.token}`,
        count: sourceItems.length,
      });
    }

    const subsetSeed = JSON.stringify({
      source: sourcePack.token,
      keep: keptItems.map((item) => item.shareToken).sort(),
    });
    const preferredToken = await createDeterministicToken(subsetSeed);
    const existingPack = await getPackByToken(c.env.DB, preferredToken);

    if (existingPack) {
      const existingItems = await getPackItems(c.env.DB, existingPack.id);
      const existingTokens = existingItems.map((item) => item.shareToken);
      const keptTokens = keptItems.map((item) => item.shareToken);

      if (existingTokens.length === keptTokens.length && existingTokens.every((token, index) => token === keptTokens[index])) {
        return c.json({
          token: existingPack.token,
          url: `https://skilo.xyz/p/${existingPack.token}`,
          count: existingItems.length,
        });
      }
    }

    const subsetName = sourcePack.name?.endsWith(' (custom)')
      ? sourcePack.name
      : `${sourcePack.name || 'Skill Pack'} (custom)`;

    const keptShareTokens = keptItems.map((item) => item.shareToken);

    try {
      await insertPack(
        c.env.DB,
        subsetName,
        preferredToken,
        keptItems.map((item) => ({ id: item.shareLinkId, token: item.shareToken }))
      );
    } catch (e) {
      if (!await packTokenMatches(c.env.DB, preferredToken, keptShareTokens)) {
        throw e;
      }
    }

    return c.json(
      {
        token: preferredToken,
        url: `https://skilo.xyz/p/${preferredToken}`,
        count: keptShareTokens.length,
      },
      201
    );
  } catch (e) {
    console.error('Pack subset creation error:', e);
    return c.json(
      { error: 'create_failed', message: (e as Error).message },
      500
    );
  }
});

// Create a ref pack (each ref → skilo.xyz/s/ link, all → skilo.xyz/p/ pack)
packsRouter.post('/from-refs', rateLimiters.createPack, async (c) => {
  const body = await c.req.json();
  const rawRefs = body.refs;

  if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
    return c.json({ error: 'validation_error', message: 'refs must be a non-empty array' }, 400);
  }
  if (rawRefs.length > 50) {
    return c.json({ error: 'validation_error', message: 'refs cannot exceed 50 items' }, 400);
  }

  const refs = rawRefs.map((r: unknown) => String(r).trim()).filter(Boolean);
  if (refs.length === 0) {
    return c.json({ error: 'validation_error', message: 'refs must contain at least one non-empty ref' }, 400);
  }

  try {
    // Generate individual ref-link tokens in parallel
    const items = await Promise.all(
      refs.map(async (ref: string) => {
        const refToken = await createDeterministicToken(`ref-link:${ref}`);
        return { ref, token: refToken, url: `https://skilo.xyz/s/${refToken}` };
      })
    );

    // Store all ref-links in KV (parallel, idempotent via deterministic tokens)
    await Promise.all(
      items.map((item) =>
        c.env.SKILLPACK_KV.put(
          `ref-link:${item.token}`,
          JSON.stringify({ ref: item.ref, createdAt: Date.now() }),
          { expirationTtl: 7776000 }
        )
      )
    );

    // Create pack
    const packSeed = `ref-pack:${JSON.stringify([...refs].sort())}`;
    const packToken = await createDeterministicToken(packSeed);

    const existing = await c.env.SKILLPACK_KV.get(`ref-pack:${packToken}`);
    if (!existing) {
      await c.env.SKILLPACK_KV.put(
        `ref-pack:${packToken}`,
        JSON.stringify({ refs, items, createdAt: Date.now() }),
        { expirationTtl: 7776000 }
      );
    }

    return c.json(
      { token: packToken, url: `https://skilo.xyz/p/${packToken}`, count: refs.length, items },
      existing ? 200 : 201
    );
  } catch (e) {
    console.error('Ref pack creation error:', e);
    return c.json({ error: 'create_failed', message: (e as Error).message }, 500);
  }
});

// Resolve a pack
packsRouter.get('/:token', rateLimiters.resolveShare, async (c) => {
  const token = c.req.param('token') || '';

  try {
    const pack = await getPackByToken(c.env.DB, token);

    if (!pack) {
      // Fallback: check KV for ref packs
      const refPack = await c.env.SKILLPACK_KV.get(`ref-pack:${token}`, { type: 'json' }) as { refs: string[]; items?: Array<{ ref: string; token: string; url: string }>; createdAt: number } | null;
      if (refPack) {
        const resolvedItems = refPack.items
          ? await Promise.all(
              refPack.items.map(async (item) => ({
                ...item,
                entry: await resolveCatalogEntry(c.env, item.ref),
              }))
            )
          : [];
        const skills = resolvedItems.flatMap((item) => {
          if (!item.entry) {
            return [];
          }

          return [{
            namespace: item.entry.owner,
            name: item.entry.name,
            description: item.entry.description,
            version: item.entry.sourceKind,
            shareToken: item.token,
            url: item.url,
            verified: item.entry.trust?.verified,
            visibility: item.entry.trust?.visibility,
            trust: item.entry.trust,
            installRef: item.entry.installRef,
            sourceKind: item.entry.sourceKind,
          }];
        });
        return c.json({
          name: 'Ref Pack',
          token,
          type: 'ref-pack',
          refs: refPack.refs,
          items: resolvedItems,
          skills,
        });
      }
      return c.json({ error: 'not_found', message: 'Pack not found' }, 404);
    }

    const items = await Promise.all(
      (await getPackItems(c.env.DB, pack.id)).map((item) => refreshPackItemMetadataIfNeeded(c.env, item))
    );
    const skills = items.map((row) => {
      const trust = buildTrustInfo({
        signature: row.signature,
        privacy: row.visibility,
        checksum: row.checksum,
        metadataJson: row.metadataJson,
        sourceType: 'share',
      });

      return {
      namespace: row.namespace,
      name: row.name,
      description: row.description,
      version: row.version,
      shareToken: row.shareToken,
      url: `https://skilo.xyz/s/${row.shareToken}`,
      verified: row.verified,
      visibility: row.visibility,
      trust,
      };
    });
    const trust = aggregatePackTrust(skills.map((skill) => skill.trust));

    return c.json({
      name: pack.name,
      token: pack.token,
      skills,
      trust,
    });
  } catch (e) {
    console.error('Pack resolve error:', e);
    return c.json(
      { error: 'resolve_failed', message: (e as Error).message },
      500
    );
  }
});
