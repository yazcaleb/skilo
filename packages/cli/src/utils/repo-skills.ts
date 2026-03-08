import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { parseSkillManifest } from '../manifest.js';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.pnpm-store',
  'coverage',
]);

const PLUGIN_MANIFESTS = [
  '.claude-plugin/marketplace.json',
  '.claude-plugin/plugin.json',
] as const;

export interface RepoSelectionOptions {
  skill?: string[];
  list?: boolean;
  all?: boolean;
}

export interface RepoSkillCandidate {
  id: string;
  name: string;
  description: string;
  path: string;
  relativeDir: string;
  source: 'skill-file' | 'plugin-manifest';
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeSkills(skills: RepoSkillCandidate[]): RepoSkillCandidate[] {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = `${normalizeName(skill.id)}::${resolve(skill.path)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function walkDirectories(root: string, depth = 0): Promise<string[]> {
  if (depth > 6) {
    return [];
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = [root];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
      continue;
    }

    dirs.push(...await walkDirectories(join(root, entry.name), depth + 1));
  }

  return dirs;
}

async function discoverSkillFiles(root: string): Promise<RepoSkillCandidate[]> {
  const dirs = await walkDirectories(root);
  const candidates: RepoSkillCandidate[] = [];

  for (const dir of dirs) {
    for (const fileName of ['SKILL.md', 'skill.md']) {
      try {
        const content = await readFile(join(dir, fileName), 'utf-8');
        const { manifest } = parseSkillManifest(content);
        const relativeDir = relative(root, dir) || '.';
        const inferredName = manifest.name || basename(dir);
        candidates.push({
          id: relativeDir === '.' ? inferredName : `${inferredName} (${relativeDir})`,
          name: inferredName,
          description: manifest.description || '',
          path: dir,
          relativeDir,
          source: 'skill-file',
        });
        break;
      } catch {
        continue;
      }
    }
  }

  return candidates;
}

function collectPluginSkillPaths(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPluginSkillPaths(entry, found);
    }
    return found;
  }

  if (!value || typeof value !== 'object') {
    return found;
  }

  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if ((key === 'skills' || key === 'skillPaths') && Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === 'string') {
          found.push(item);
        } else if (item && typeof item === 'object') {
          const itemRecord = item as Record<string, unknown>;
          for (const pathKey of ['path', 'skillPath', 'dir', 'directory']) {
            if (typeof itemRecord[pathKey] === 'string') {
              found.push(itemRecord[pathKey] as string);
            }
          }
        }
      }
    }

    collectPluginSkillPaths(entry, found);
  }

  return found;
}

async function discoverPluginSkills(root: string): Promise<RepoSkillCandidate[]> {
  const candidates: RepoSkillCandidate[] = [];

  for (const manifestPath of PLUGIN_MANIFESTS) {
    try {
      const content = await readFile(join(root, manifestPath), 'utf-8');
      const parsed = JSON.parse(content) as unknown;
      const skillPaths = collectPluginSkillPaths(parsed);

      for (const skillPath of skillPaths) {
        const resolvedDir = resolve(root, skillPath);
        try {
          const skillContent = await readFile(join(resolvedDir, 'SKILL.md'), 'utf-8');
          const { manifest } = parseSkillManifest(skillContent);
          const relativeDir = relative(root, resolvedDir) || '.';
          const inferredName = manifest.name || basename(resolvedDir);
          candidates.push({
            id: relativeDir === '.' ? inferredName : `${inferredName} (${relativeDir})`,
            name: inferredName,
            description: manifest.description || '',
            path: resolvedDir,
            relativeDir,
            source: 'plugin-manifest',
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

export async function discoverRepoSkills(root: string): Promise<RepoSkillCandidate[]> {
  const skills = [
    ...await discoverSkillFiles(root),
    ...await discoverPluginSkills(root),
  ];

  return dedupeSkills(skills).sort((a, b) => a.relativeDir.localeCompare(b.relativeDir));
}

export function selectRepoSkills(
  skills: RepoSkillCandidate[],
  options: RepoSelectionOptions = {}
): RepoSkillCandidate[] {
  if (options.all) {
    return skills;
  }

  const requested = (options.skill || []).map(normalizeName);
  if (requested.length === 0) {
    if (skills.length === 1) {
      return skills;
    }

    const rootSkill = skills.find((skill) => skill.relativeDir === '.');
    return rootSkill ? [rootSkill] : [];
  }

  return skills.filter((skill) => {
    const name = normalizeName(skill.name);
    const id = normalizeName(skill.id);
    const relativeDir = normalizeName(skill.relativeDir);
    return requested.some((request) =>
      request === name || request === id || request === relativeDir
    );
  });
}

export function formatRepoSkillChoices(skills: RepoSkillCandidate[]): string[] {
  return skills.map((skill) =>
    `${skill.name} :: ${skill.relativeDir === '.' ? '.' : skill.relativeDir}`
  );
}

export function isGitHubRepoLike(source: string): boolean {
  return (
    source.startsWith('github:') ||
    /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(source) ||
    /^[^/@\s]+\/[^/@\s]+$/.test(source)
  );
}

export function normalizeGitHubSource(source: string): string {
  if (source.startsWith('github:')) {
    return source;
  }

  const urlMatch = source.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(tree|blob)\/[^/]+\/(.+))?\/?$/i);
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/i, '');
    const path = urlMatch[4] ? `#${urlMatch[4]}` : '';
    return `github:${owner}/${repo}${path}`;
  }

  if (/^[^/@\s]+\/[^/@\s]+$/.test(source)) {
    return `github:${source}`;
  }

  return source;
}
