import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';
import * as tar from 'tar';
import { readFile as readFileAsync, unlink } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { validateSkillContent } from '../manifest.js';
import { readSkillContent } from '../utils/skill-file.js';

const DEFAULT_OUTPUT = 'skilo.tgz';

export async function packCommand(_args?: string[]): Promise<void> {
  const outputFile = DEFAULT_OUTPUT;
  const cwd = process.cwd();
  let skillFile: string;

  try {
    const resolved = await readSkillContent(cwd);
    skillFile = resolved.skillFile;
    const content = resolved.content;
    const result = validateSkillContent(content);

    if (!result.valid) {
      console.error(`Pack failed: ${skillFile} is invalid`);
      for (const error of result.errors) {
        console.error(`  ${error.field}: ${error.message}`);
      }
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }

  // Collect files that exist
  const files: string[] = [skillFile!];
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
    }, [skillFile!]);

    console.log(`✓ Created ${outputFile} (${skillFile} only)`);
  }
}
