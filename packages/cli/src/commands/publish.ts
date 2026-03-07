import { getClient, loadConfig } from '../api/client.js';
import { readFile, unlink } from 'node:fs/promises';
import { validateSkillContent } from '../manifest.js';
import * as tar from 'tar';
import { join } from 'node:path';
import * as crypto from 'node:crypto';
import { statSync } from 'node:fs';

const SKILL_FILE = 'SKILL.md';

async function createTarball(cwd: string): Promise<{ buffer: Buffer; size: number; checksum: string }> {
  const tempFile = join(cwd, '.skilo-temp.tgz');

  const files: string[] = [SKILL_FILE];
  try { statSync(join(cwd, 'index.js')); files.push('index.js'); } catch {}
  try { statSync(join(cwd, 'index.ts')); files.push('index.ts'); } catch {}
  try { statSync(join(cwd, 'src')); files.push('src'); } catch {}

  await tar.create({ cwd, gzip: true, file: tempFile }, files);

  const buffer = await readFile(tempFile);
  await unlink(tempFile);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, size: buffer.length, checksum };
}

export async function publishCommand(path?: string): Promise<void> {
  const cwd = !path || path === '.' ? process.cwd() : path;
  const skillPath = join(cwd, SKILL_FILE);

  // Validate SKILL.md
  try {
    const content = await readFile(skillPath, 'utf-8');
    const result = validateSkillContent(content);
    if (!result.valid) {
      console.error('Publish failed: SKILL.md is invalid');
      for (const error of result.errors) console.error(`  ${error.field}: ${error.message}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${SKILL_FILE} not found in ${cwd}`);
    process.exit(1);
  }

  try {
    const config = await loadConfig();
    const client = await getClient();
    const content = await readFile(skillPath, 'utf-8');
    const result = validateSkillContent(content);
    const manifest = result.manifest!;

    const { buffer } = await createTarball(cwd);
    const namespace = config.namespace || 'default';
    const isListed = !!(config.token || config.apiKey);

    const response = await client.publishSkill(
      manifest.name,
      namespace,
      manifest.description,
      manifest.version || '0.1.0',
      buffer.buffer as ArrayBuffer,
      isListed
    );

    console.log(`✓ Published ${namespace}/${manifest.name}@${manifest.version || '0.1.0'}`);
    if (!isListed) {
      console.log('  (unlisted - login to make public)');
    }
  } catch (e) {
    console.error(`Publish failed: ${(e as Error).message}`);
    process.exit(1);
  }
}