import { access, constants, copyFile, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export const DEFAULT_SKILL_FILE = 'SKILL.md';
export const SKILL_FILE_CANDIDATES = [DEFAULT_SKILL_FILE, 'skill.md'] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findSkillFile(dir: string): Promise<string | null> {
  for (const candidate of SKILL_FILE_CANDIDATES) {
    if (await exists(join(dir, candidate))) {
      return candidate;
    }
  }

  return null;
}

export async function resolveSkillLocation(input?: string): Promise<{ cwd: string; skillFile: string }> {
  const resolvedInput = !input || input === '.' ? process.cwd() : resolve(input);
  const stats = await stat(resolvedInput).catch(() => null);

  if (!stats) {
    throw new Error(`Path not found: ${resolvedInput}`);
  }

  if (stats.isFile()) {
    const fileName = basename(resolvedInput);
    if (!SKILL_FILE_CANDIDATES.includes(fileName as (typeof SKILL_FILE_CANDIDATES)[number])) {
      throw new Error(`Unsupported skill file: ${resolvedInput}`);
    }

    return { cwd: dirname(resolvedInput), skillFile: fileName };
  }

  const skillFile = await findSkillFile(resolvedInput);
  if (!skillFile) {
    throw new Error(`No SKILL.md or skill.md found in ${resolvedInput}`);
  }

  return { cwd: resolvedInput, skillFile };
}

export async function readSkillContent(input?: string): Promise<{ cwd: string; skillFile: string; content: string }> {
  const { cwd, skillFile } = await resolveSkillLocation(input);
  const content = await readFile(join(cwd, skillFile), 'utf-8');
  return { cwd, skillFile, content };
}

export async function ensureCanonicalSkillFile(dir: string): Promise<void> {
  const canonicalPath = join(dir, DEFAULT_SKILL_FILE);
  if (await exists(canonicalPath)) {
    return;
  }

  const alternatePath = join(dir, 'skill.md');
  if (await exists(alternatePath)) {
    await copyFile(alternatePath, canonicalPath);
  }
}
