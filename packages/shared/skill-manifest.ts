// SKILL.md manifest parser for Vercel Agent Skills format

import type { SkillManifest } from './types.js';
import matter from 'gray-matter';

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

/**
 * Parse SKILL.md file content with YAML frontmatter
 * Format compatible with Vercel Agent Skills
 */
export function parseSkillManifest(content: string): ParseResult {
  const { data, content: mdContent } = matter(content);

  // Ensure required fields
  const manifest: SkillManifest = {
    name: data.name || '',
    description: data.description || '',
    version: data.version,
    author: data.author,
    homepage: data.homepage,
    repository: data.repository,
    keywords: data.keywords,
    api: data.api,
    runtime: data.runtime,
  };

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

  // Validate name format (npm-like)
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