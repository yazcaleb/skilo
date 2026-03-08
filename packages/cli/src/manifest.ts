// SKILL.md manifest parser - copied to CLI for local dev

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  api?: string;
  runtime?: string;
}

export interface ParseResult {
  manifest: SkillManifest;
  raw: string;
  content: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  manifest?: SkillManifest;
}

// Simple frontmatter parser (no gray-matter dependency for CLI)
function parseFrontMatter(content: string): { data: Record<string, unknown>; content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, content };
  }

  const frontmatter = match[1];
  const mdContent = match[2];

  const data: Record<string, unknown> = {};
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();
      if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      data[key] = value;
    }
  }

  return { data, content: mdContent };
}

function parseMarkdownSkill(content: string): SkillManifest {
  const lines = content.split('\n');
  const heading = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() || '';

  const descriptionLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock || !trimmed || /^#/.test(trimmed)) {
      if (heading && descriptionLines.length > 0) {
        break;
      }
      continue;
    }

    descriptionLines.push(trimmed);
    if (descriptionLines.join(' ').length >= 240) {
      break;
    }
  }

  return {
    name: heading,
    description: descriptionLines.join(' ').trim(),
  };
}

/**
 * Parse SKILL.md file content with YAML frontmatter
 */
export function parseSkillManifest(content: string): ParseResult {
  const { data, content: mdContent } = parseFrontMatter(content);
  const hasFrontmatter = Object.keys(data).length > 0;

  const manifest: SkillManifest = hasFrontmatter
    ? {
        name: (data.name as string) || '',
        description: (data.description as string) || '',
        version: data.version as string | undefined,
        author: data.author as string | undefined,
        homepage: data.homepage as string | undefined,
        repository: data.repository as string | undefined,
        keywords: data.keywords as string[] | undefined,
        api: data.api as string | undefined,
        runtime: data.runtime as string | undefined,
      }
    : parseMarkdownSkill(content);

  return {
    manifest,
    raw: content,
    content: mdContent,
  };
}

/**
 * Validate a parsed manifest
 */
export function validateManifest(manifest: SkillManifest): ValidationResult {
  const errors: ValidationError[] = [];

  if (!manifest.name || manifest.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required' });
  }

  if (!manifest.description || manifest.description.trim() === '') {
    errors.push({ field: 'description', message: 'description is required' });
  }

  if (manifest.name) {
    const nameRegex = /^[a-zA-Z0-9@-][a-zA-Z0-9._-]*$/;
    if (!nameRegex.test(manifest.name)) {
      errors.push({
        field: 'name',
        message: 'name must be alphanumeric with hyphens/underscores, starting with a letter or @',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest: errors.length === 0 ? manifest : undefined,
  };
}

/**
 * Validate SKILL.md content directly
 */
export function validateSkillContent(content: string): ValidationResult {
  try {
    const parsed = parseSkillManifest(content);
    return validateManifest(parsed.manifest);
  } catch (e) {
    return {
      valid: false,
      errors: [
        {
          field: 'parse',
          message: e instanceof Error ? e.message : 'Failed to parse SKILL.md',
        },
      ],
    };
  }
}

/**
 * Generate SKILL.md template
 */
export function generateSkillTemplate(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
version: 0.1.0
author: Your Name
---

# ${name}

Describe what this skill does and how to use it.
`;
}
