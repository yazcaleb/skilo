import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';
import * as tar from 'tar';
import { readFile as readFileAsync, unlink } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { validateSkillContent } from '../manifest.js';

const SKILL_FILE = 'SKILL.md';
const DEFAULT_OUTPUT = 'skilo.tgz';

export async function packCommand(_args?: string[]): Promise<void> {
  const outputFile = DEFAULT_OUTPUT;
  const cwd = process.cwd();

  // Validate SKILL.md first
  try {
    const content = await readFileAsync(join(cwd, SKILL_FILE), 'utf-8');
    const result = validateSkillContent(content);

    if (!result.valid) {
      console.error('Pack failed: SKILL.md is invalid');
      for (const error of result.errors) {
        console.error(`  ${error.field}: ${error.message}`);
      }
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${SKILL_FILE} not found in current directory`);
    process.exit(1);
  }

  // Collect files that exist
  const files: string[] = [SKILL_FILE];
  try { statSync(join(cwd, 'index.js')); files.push('index.js'); } catch {}
  try { statSync(join(cwd, 'index.ts')); files.push('index.ts'); } catch {}
  try { statSync(join(cwd, 'src')); files.push('src'); } catch {}

  // Create tarball
  try {
    await tar.create({
      cwd,
      gzip: true,
      file: outputFile,
    }, files);

    console.log(`✓ Created ${outputFile}`);
  } catch {
    // Fallback: just the required file
    await tar.create({
      cwd,
      gzip: true,
      file: outputFile,
    }, [SKILL_FILE]);

    console.log(`✓ Created ${outputFile} (SKILL.md only)`);
  }
}