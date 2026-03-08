import { getClient } from '../api/client.js';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { mkdir, rm, unlink } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { isRegistrySkillRef } from '../utils/source-kind.js';
import { type InstallOptions, describeInstallTargets, getInstallDirs } from '../utils/install-targets.js';

function parseSkillRef(skill: string): { namespace: string; name: string; version?: string } {
  const parts = skill.split('@');
  const ref = parts[0].split('/');
  if (ref.length !== 2) {
    throw new Error('Invalid skill reference. Use format: namespace/name or namespace/name@version');
  }
  return { namespace: ref[0], name: ref[1], version: parts[1] };
}

export async function installCommand(skill: string, options: InstallOptions = {}): Promise<void> {
  if (!skill) {
    console.error('Usage: skilo install <skill|source>');
    process.exit(1);
  }

  try {
    if (!await isRegistrySkillRef(skill)) {
      const { importCommand } = await import('./import.js');
      await importCommand(skill, options);
      return;
    }

    const { namespace, name, version } = parseSkillRef(skill);
    const client = await getClient();

    // Get skill metadata to find the version
    const metadata = await client.getSkillMetadata(namespace, name);
    const versionToInstall = version || metadata.version;

    console.log(`Installing ${namespace}/${name}@${versionToInstall}...`);

    // Get verification info
    const verifyResponse = await fetch(`${client.baseUrl}/v1/skills/${namespace}/${name}/verify?version=${versionToInstall}`);
    let expectedChecksum: string | undefined;
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      expectedChecksum = verifyData.checksum;
      if (verifyData.signature) {
        console.log('✓ Skill is signed');
      }
    }

    // Download tarball
    const tarball = await client.downloadTarball(namespace, name, versionToInstall);

    // Verify checksum
    if (expectedChecksum) {
      const actualChecksum = crypto.createHash('sha256').update(Buffer.from(tarball)).digest('hex');
      if (actualChecksum !== expectedChecksum) {
        console.error('❌ Checksum verification failed!');
        console.error(`  Expected: ${expectedChecksum}`);
        console.error(`  Actual:   ${actualChecksum}`);
        process.exit(1);
      }
      console.log('✓ Checksum verified');
    }

    const installDirs = getInstallDirs(options);

    for (const skillsDir of installDirs) {
      await mkdir(skillsDir, { recursive: true });

      const skillDir = join(skillsDir, `${namespace}-${name}`);
      await rm(skillDir, { recursive: true, force: true });
      await mkdir(skillDir, { recursive: true });

      const tempPath = join(skillDir, 'temp.tgz');
      const writeStream = createWriteStream(tempPath);
      await writeStream.write(Buffer.from(tarball));
      writeStream.end();
      await new Promise<void>((resolve) => writeStream.on('finish', resolve));

      const readStream = createReadStream(tempPath);
      await pipeline(readStream, createGunzip(), extract({ cwd: skillDir }));
      await unlink(tempPath);

      console.log(`✓ Installed to ${skillDir}`);
    }

    console.log(`✓ Installed ${namespace}/${name}@${versionToInstall} for ${describeInstallTargets(options)}`);
  } catch (e) {
    console.error(`Install failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
