// Packs API routes - bulk share collections
import { Hono } from 'hono';
import type { Env } from '../index.js';
import { rateLimiters } from '../middleware/rateLimit.js';

export const packsRouter = new Hono<{ Bindings: Env }>();

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
      (result.results || []).map((r: any) => [r.token, r])
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

    const uniqueShares: Array<{ id: string; token: string }> = [];
    const seenSkills = new Set<string>();
    for (const token of share_tokens) {
      const row = foundTokens.get(token);
      const skillKey = `${row.skill_id}:${row.latest_version}`;
      if (seenSkills.has(skillKey)) {
        continue;
      }
      seenSkills.add(skillKey);
      uniqueShares.push({ id: row.id, token: row.token });
    }

    // Generate pack id and token
    const packId = crypto.randomUUID();
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const packToken = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .slice(0, 8);

    // Insert pack
    await c.env.DB.prepare(
      `INSERT INTO packs (id, token, name) VALUES (?, ?, ?)`
    ).bind(packId, packToken, name).run();

    // Insert pack items with position
    const insertStmts = uniqueShares.map((share, i: number) => {
      return c.env.DB.prepare(
        `INSERT INTO pack_items (pack_id, share_link_id, position) VALUES (?, ?, ?)`
      ).bind(packId, share.id, i);
    });
    await c.env.DB.batch(insertStmts);

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

// Resolve a pack
packsRouter.get('/:token', rateLimiters.resolveShare, async (c) => {
  const token = c.req.param('token');

  try {
    // Look up pack
    const packStmt = await c.env.DB.prepare(
      `SELECT id, name, token FROM packs WHERE token = ?`
    );
    const pack = await packStmt.bind(token).first();

    if (!pack) {
      return c.json({ error: 'not_found', message: 'Pack not found' }, 404);
    }

    // Get skills via pack_items -> share_links -> skills
    const itemsStmt = await c.env.DB.prepare(
      `SELECT s.namespace, s.name, s.description, s.latest_version as version,
              sl.token as shareToken
       FROM pack_items pi
       JOIN share_links sl ON pi.share_link_id = sl.id
       JOIN skills s ON sl.skill_id = s.id
       WHERE pi.pack_id = ?
       ORDER BY pi.position`
    );
    const items = await itemsStmt.bind(pack.id).all();

    const skills = (items.results || []).map((row: any) => ({
      namespace: row.namespace,
      name: row.name,
      description: row.description,
      version: row.version,
      shareToken: row.shareToken,
      url: `https://skilo.xyz/s/${row.shareToken}`,
    }));

    return c.json({
      name: pack.name,
      token: pack.token,
      skills,
    });
  } catch (e) {
    console.error('Pack resolve error:', e);
    return c.json(
      { error: 'resolve_failed', message: (e as Error).message },
      500
    );
  }
});
