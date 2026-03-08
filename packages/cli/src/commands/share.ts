import { getClient } from '../api/client.js';
import { createInterface } from 'node:readline';
import { resolveSkillLocation } from '../utils/skill-file.js';
import { publishLocalSkill } from './publish.js';
import { isKnownTool, discoverSkills, getToolLabel, resolveToolName } from '../tool-dirs.js';
import { pickSkills } from '../utils/picker.js';
import { blankLine, exitWithError, isJsonOutput, logError, logInfo, logSuccess, printJson, printNote, printPrimary, printSection, printUsage } from '../utils/output.js';

interface ShareOptions {
  oneTime?: boolean;
  expires?: string;
  uses?: number;
  password?: boolean;
  qr?: boolean;
  yes?: boolean;
  listed?: boolean;
  unlisted?: boolean;
}

function parseSkillRef(skill: string): { namespace: string; name: string } {
  const parts = skill.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid skill reference. Use format: namespace/name');
  }
  return { namespace: parts[0], name: parts[1] };
}

export function parseShareToken(source: string): string | null {
  const match = source.match(/\/s\/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

export function parsePackToken(source: string): string | null {
  const match = source.match(/\/p\/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

async function promptPassword(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter password: ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}

export async function shareCommand(
  skill: string,
  options: ShareOptions = {}
): Promise<void> {
  if (isKnownTool(skill)) {
    await bulkShareCommand(resolveToolName(skill) || skill, options);
    return;
  }

  if (!skill) {
    printUsage([
      'Usage: skilo share <path|namespace/name> [--one-time] [--expires 1h] [--uses 5] [--password]',
    ]);
  }

  try {
    const target = await resolveShareTarget(skill, {
      listed: options.listed,
      unlisted: options.unlisted ?? !options.listed,
    });
    const client = await getClient();

    // Parse expires
    let expiresAt: number | undefined;
    if (options.expires) {
      const match = options.expires.match(/^(\d+)(h|d|m)$/);
      if (!match) {
        exitWithError('Invalid expires format. Use 1h, 2d, or 30m.');
      }
      const value = parseInt(match[1]);
      const unit = match[2];
      const now = Date.now();
      if (unit === 'h') expiresAt = now + value * 60 * 60 * 1000;
      else if (unit === 'd') expiresAt = now + value * 24 * 60 * 60 * 1000;
      else if (unit === 'm') expiresAt = now + value * 60 * 1000;
    }

    // Get password if requested
    let password: string | undefined;
    if (options.password) {
      password = await promptPassword();
    }

    const result = await client.createShareLink(
      target.namespace,
      target.name,
      options.oneTime || false,
      expiresAt,
      options.uses,
      password
    );

    if (target.publishedVersion) {
      logSuccess(`Published @${target.namespace}/${target.name}@${target.publishedVersion}`);
      printNote('visibility', options.listed ? 'public' : 'unlisted');
    }

    logSuccess(`Share link ready for ${target.namespace}/${target.name}`);
    if (isJsonOutput()) {
      printJson({
        command: 'share',
        skill: `${target.namespace}/${target.name}`,
        version: target.publishedVersion || null,
        trust: target.trust || null,
        token: result.token,
        url: result.url,
        oneTime: options.oneTime || false,
        expiresAt: expiresAt || null,
        maxUses: options.uses || null,
        passwordProtected: Boolean(options.password),
      });
      return;
    }

    printPrimary(result.url);
    if (options.oneTime) printNote('mode', 'one-time');
    if (expiresAt) printNote('expires', new Date(expiresAt).toISOString());
    if (options.uses) printNote('max uses', String(options.uses));
    if (options.password) printNote('password', 'required');

    if (options.qr && process.stdout.isTTY) {
      blankLine();
      printSection('Scan to install');
      printPrimary(generateQRCode(result.url));
    }
  } catch (e) {
    exitWithError((e as Error).message);
  }
}

// Simple ASCII QR code generator (placeholder)
function generateQRCode(url: string): string {
  // In production, use a proper QR library like 'qrcode'
  // For now, return a placeholder
  return `
    ██████████████
    ██          ██
    ██  ██████  ██
    ██  █    █  ██
    ██  ██████  ██
    ██          ██
    ██████████████
           ${url.slice(0, 30)}...
  `;
}

async function bulkShareCommand(
  toolName: string,
  options: ShareOptions
): Promise<void> {
  const resolvedToolName = resolveToolName(toolName) || 'all';
  const toolLabel = getToolLabel(resolvedToolName);
  logInfo(`Scanning ${toolLabel} for skills`);

  const skills = await discoverSkills(toolName);
  if (skills.length === 0) {
    logInfo('No skills found.');
    return;
  }

  logSuccess(`Found ${skills.length} skill${skills.length === 1 ? '' : 's'}`);

  let selected;
  if (options.yes) {
    selected = skills;
  } else {
    const result = await pickSkills(skills, `Select skills to share from ${toolLabel}`);
    if (result.cancelled || result.selected.length === 0) {
      logInfo('No skills selected.');
      return;
    }
    selected = result.selected;
  }

  // Parse expires
  let expiresAt: number | undefined;
  if (options.expires) {
    const match = options.expires.match(/^(\d+)(h|d|m)$/);
    if (!match) {
      exitWithError('Invalid expires format. Use 1h, 2d, or 30m.');
    }
    const value = parseInt(match[1]);
    const unit = match[2];
    const now = Date.now();
    if (unit === 'h') expiresAt = now + value * 60 * 60 * 1000;
    else if (unit === 'd') expiresAt = now + value * 24 * 60 * 60 * 1000;
    else if (unit === 'm') expiresAt = now + value * 60 * 1000;
  }

  // Get password if requested
  let password: string | undefined;
  if (options.password) {
    password = await promptPassword();
  }

  const client = await getClient();
  const total = selected.length;

  blankLine();
  logInfo(`Publishing ${total} skill${total === 1 ? '' : 's'}`);

  const successes: { name: string; token: string; url: string }[] = [];
  const failures: { name: string; error: string }[] = [];

  for (let i = 0; i < total; i++) {
    const skill = selected[i];
    logInfo(`[${i + 1}/${total}] ${skill.name}`);

    try {
      const { manifest, namespace } = await publishLocalSkill(skill.path, {
        listed: options.listed,
        unlisted: options.unlisted ?? !options.listed,
      });
      const result = await client.createShareLink(
        namespace,
        manifest.name,
        options.oneTime || false,
        expiresAt,
        options.uses,
        password
      );
      logSuccess(`Shared ${namespace}/${manifest.name}`);
      successes.push({ name: skill.name, token: result.token, url: result.url });
    } catch (e) {
      logError(`${skill.name}: ${(e as Error).message}`);
      failures.push({ name: skill.name, error: (e as Error).message });
    }
  }

  if (successes.length >= 2) {
    try {
      const tokens = successes.map((s) => s.token);
      const packResult = await client.createPack(toolName, tokens);
      blankLine();
      logSuccess(`Pack ready with ${packResult.count} skills`);
      if (isJsonOutput()) {
        printJson({
          command: 'share',
          mode: 'bulk',
          tool: toolName,
          pack: packResult,
          successes,
          failures,
        });
        return;
      }
      printPrimary(packResult.url);
    } catch (e) {
      logError(`Pack creation failed: ${(e as Error).message}`);
    }
  }

  if (isJsonOutput()) {
    printJson({
      command: 'share',
      mode: 'bulk',
      tool: toolName,
      pack: null,
      successes,
      failures,
    });
    return;
  }

  if (successes.length > 0) {
    blankLine();
    printSection('Individual links');
    const maxNameLen = Math.max(...successes.map((s) => s.name.length));
    for (const s of successes) {
      if (process.stdout.isTTY) {
        printPrimary(`${s.name.padEnd(maxNameLen)}  ${s.url}`);
      } else {
        printPrimary(`${s.name}\t${s.url}`);
      }
    }
  }

  if (failures.length > 0) {
    blankLine();
    printSection(`Failed (${failures.length})`);
    for (const f of failures) {
      logError(`${f.name}: ${f.error}`);
    }
  }
}

async function resolveShareTarget(
  skill: string,
  options: { listed?: boolean; unlisted?: boolean } = {}
): Promise<{
  namespace: string;
  name: string;
  publishedVersion?: string;
  trust?: {
    publisherStatus: 'anonymous' | 'claimed' | 'verified';
    verified: boolean;
    hasSignature: boolean;
    visibility: 'public' | 'unlisted';
    auditStatus: 'clean' | 'warning' | 'blocked';
    capabilities: string[];
    riskSummary: string[];
    findings: Array<{ code: string; severity: 'info' | 'warning' | 'blocked'; message: string }>;
    sourceType: 'registry' | 'share' | 'local' | 'github' | 'pack' | 'derived_pack';
    integrity: { checksum: string; hasSignature: boolean; signatureVerified: boolean };
  };
}> {
  try {
    await resolveSkillLocation(skill);
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith('Path not found:')) {
      const { namespace, name } = parseSkillRef(skill);
      return { namespace, name };
    }

    throw e;
  }

  const { manifest, namespace, trust } = await publishLocalSkill(skill, {
    listed: options.listed,
    unlisted: options.unlisted ?? !options.listed,
  });
  return {
    namespace,
    name: manifest.name,
    publishedVersion: manifest.version || '0.1.0',
    trust,
  };
}

export async function ensureShareLinkForSource(
  source: string,
  options: { oneTime?: boolean; expires?: string; uses?: number; password?: boolean; listed?: boolean; unlisted?: boolean } = {}
): Promise<{ token: string; url: string; namespace?: string; name?: string; created: boolean }> {
  const existingShareToken = parseShareToken(source);
  if (existingShareToken) {
    return {
      token: existingShareToken,
      url: source.startsWith('http') ? source : `https://${source}`,
      created: false,
    };
  }

  const client = await getClient();
  const packToken = parsePackToken(source);
  if (packToken) {
    const pack = await client.resolvePack(packToken);
    throw new Error(
      `Pack links cannot be nested directly. Use the contained skills instead: ${pack.skills.map((skill) => skill.url).join(', ')}`
    );
  }

  let expiresAt: number | undefined;
  if (options.expires) {
    const match = options.expires.match(/^(\d+)(h|d|m)$/);
    if (!match) {
      exitWithError('Invalid expires format. Use 1h, 2d, or 30m.');
    }
    const value = parseInt(match[1]);
    const unit = match[2];
    const now = Date.now();
    if (unit === 'h') expiresAt = now + value * 60 * 60 * 1000;
    else if (unit === 'd') expiresAt = now + value * 24 * 60 * 60 * 1000;
    else if (unit === 'm') expiresAt = now + value * 60 * 1000;
  }

  let password: string | undefined;
  if (options.password) {
    password = await promptPassword();
  }

  const target = await resolveShareTarget(source, {
    listed: options.listed,
    unlisted: options.unlisted,
  });
  const result = await client.createShareLink(
    target.namespace,
    target.name,
    options.oneTime || false,
    expiresAt,
    options.uses,
    password
  );

  return {
    token: result.token,
    url: result.url,
    namespace: target.namespace,
    name: target.name,
    created: true,
  };
}
