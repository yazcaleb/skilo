import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSkillContent } from '../manifest.js';
import type { SkillManifest } from '../types.js';

const SKILL_FILE = 'SKILL.md';

export async function validateCommand(): Promise<void> {
  const cwd = process.cwd();
  const skillPath = join(cwd, SKILL_FILE);

  try {
    const content = await readFile(skillPath, 'utf-8');
    const result = validateSkillContent(content);

    if (!result.valid) {
      console.error('Validation failed:');
      for (const error of result.errors) {
        console.error(`  ${error.field}: ${error.message}`);
      }
      process.exit(1);
    }

    const manifest = result.manifest as SkillManifest;
    console.log('✓ SKILL.md is valid');
    console.log(`  name: ${manifest.name}`);
    console.log(`  description: ${manifest.description}`);
    console.log(`  version: ${manifest.version || 'not specified'}`);
    if (manifest.author) console.log(`  author: ${manifest.author}`);
    if (manifest.keywords?.length) console.log(`  keywords: ${manifest.keywords.join(', ')}`);
  } catch (e) {
    console.error(`Error reading ${SKILL_FILE}: ${(e as Error).message}`);
    process.exit(1);
  }
}