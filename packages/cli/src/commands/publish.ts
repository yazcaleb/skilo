import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import * as crypto from 'node:crypto';
import * as tar from 'tar';
import { getClient, loadConfig } from '../api/client.js';
import { generateAnonName, generateClaimToken } from '../anon-names.js';
import { validateSkillContent } from '../manifest.js';
import { loadOrGenerateKeys, sign, encodeBase64Url } from '../utils/signing.js';
import { readSkillContent } from '../utils/skill-file.js';

async function createTarball(cwd: string, skillFile: string): Promise<{ buffer: Buffer; checksum: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skilo-publish-'));
  const tempFile = join(tempDir, 'skill.tgz');
  const files: string[] = [skillFile];

  try { statSync(join(cwd, 'index.js')); files.push('index.js'); } catch {}
  try { statSync(join(cwd, 'index.ts')); files.push('index.ts'); } catch {}
  try { statSync(join(cwd, 'src')); files.push('src'); } catch {}

  await tar.create({ cwd, gzip: true, file: tempFile }, files);

  const buffer = await readFile(tempFile);
  await rm(tempDir, { recursive: true, force: true });

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, checksum };
}

export async function publishCommand(path?: string, options?: { sign?: boolean }): Promise<void> {
  try {
    const { manifest, namespace, claimToken, isListed } = await publishLocalSkill(path, options);

    console.log(`\n✓ Published @${namespace}/${manifest.name}@${manifest.version || '0.1.0'}`);

    if (!isListed && claimToken) {
      console.log(`  🔐 Claim token: ${claimToken}`);
      console.log(`\n  To claim this skill and make it public:`);
      console.log(`    skilo login`);
      console.log(`    skilo claim @${namespace}/${manifest.name} --token ${claimToken}`);
    } else if (isListed) {
      console.log('  (public)');
    }
  } catch (e) {
    console.error(`Publish failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

export async function publishLocalSkill(
  path?: string,
  options?: { sign?: boolean }
): Promise<{
  manifest: NonNullable<ReturnType<typeof validateSkillContent>['manifest']>;
  namespace: string;
  claimToken?: string;
  isListed: boolean;
}> {
  const { cwd, skillFile, content } = await readSkillContent(path);
  const result = validateSkillContent(content);

  if (!result.valid || !result.manifest) {
    throw new Error(`${skillFile} is invalid`);
  }

  const manifest = result.manifest;
  const config = await loadConfig();
  const client = await getClient();
  const { buffer, checksum } = await createTarball(cwd, skillFile);

  let signature: string | undefined;
  let publicKey: string | undefined;

  if (options?.sign || config.token || config.apiKey) {
    try {
      const keys = await loadOrGenerateKeys();
      const checksumBytes = new TextEncoder().encode(checksum);
      const sig = await sign(checksumBytes, keys.privateKey);
      signature = encodeBase64Url(sig);
      publicKey = encodeBase64Url(keys.publicKey);
      console.log('✓ Signed skill bundle');
    } catch (e) {
      console.warn('Warning: Could not sign skill:', (e as Error).message);
    }
  }

  let namespace: string;
  let claimToken: string | undefined;

  if (config.token || config.apiKey) {
    namespace = config.namespace || 'default';
  } else {
    namespace = generateAnonName();
    claimToken = generateClaimToken();
    const claimFile = join(homedir(), '.skilo', 'claims', `${namespace}-${manifest.name}.token`);

    try {
      await mkdir(join(homedir(), '.skilo', 'claims'), { recursive: true });
      await writeFile(claimFile, claimToken, 'utf-8');
      console.log(`📝 Saved claim token to ${claimFile}`);
    } catch (e) {
      console.warn(`Warning: Could not save claim token: ${(e as Error).message}`);
    }
  }

  const isListed = !!(config.token || config.apiKey);

  await client.publishSkill(
    manifest.name,
    namespace,
    manifest.description,
    manifest.version || '0.1.0',
    buffer.buffer as ArrayBuffer,
    isListed,
    claimToken,
    signature,
    publicKey
  );

  return { manifest, namespace, claimToken, isListed };
}
