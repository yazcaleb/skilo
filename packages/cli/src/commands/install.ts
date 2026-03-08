import { getClient } from '../api/client.js';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { mkdir, rm, unlink } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { isRegistrySkillRef, normalizeSourceInput } from '../utils/source-kind.js';
import {
  type InstallOptions,
  describeInstallTargets,
  getInstallDestinations,
  getInstallDirs,
  getTargetFlag,
  resolveInstallTargets,
} from '../utils/install-targets.js';
import { exitWithError, isJsonOutput, logInfo, logSuccess, printJson, printNote, printUsage } from '../utils/output.js';
import { isGitHubRepoLike } from '../utils/repo-skills.js';

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
    printUsage(['Usage: skilo install <skill|source>']);
  }

  try {
    skill = normalizeSourceInput(skill);
    const prefersRepoSelection = Boolean(options.list || options.all || options.skill?.length);

    if (!await isRegistrySkillRef(skill) || (prefersRepoSelection && isGitHubRepoLike(skill))) {
      const { importCommand } = await import('./import.js');
      await importCommand(skill, options);
      return;
    }

    const installResolution = await resolveInstallTargets(options);

    if (installResolution.mode === 'needs_target' || (installResolution.mode === 'selected' && installResolution.targets.length === 0)) {
      const detectedTargets = installResolution.detectedTargets;
      const nextCommand = detectedTargets[0]
        ? `skilo add ${skill} ${getTargetFlag(detectedTargets[0])}`
        : `skilo add ${skill} --cc`;

      if (isJsonOutput()) {
        printJson({
          command: 'add',
          source: skill,
          resolvedType: 'registry',
          skillCount: 0,
          detectedTargets,
          installedTargets: [],
          nextCommand,
          message: detectedTargets.length > 0
            ? 'Multiple install targets detected. Pass an explicit target flag or set SKILO_TARGETS.'
            : 'No install targets selected.',
        });
        return;
      }

      exitWithError(
        detectedTargets.length > 0
          ? `Multiple install targets detected: ${detectedTargets.join(', ')}. Pass ${detectedTargets.map(getTargetFlag).join(', ')} or set SKILO_TARGETS.`
          : 'Install cancelled.'
      );
    }

    const { namespace, name, version } = parseSkillRef(skill);
    const client = await getClient();

    // Get skill metadata to find the version
    const metadata = await client.getSkillMetadata(namespace, name);
    const versionToInstall = version || metadata.version;

    logInfo(`Installing ${namespace}/${name}@${versionToInstall}`);

    // Get verification info
    const verifyResponse = await fetch(`${client.baseUrl}/v1/skills/${namespace}/${name}/verify?version=${versionToInstall}`);
    let expectedChecksum: string | undefined;
    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      expectedChecksum = verifyData.checksum;
      if (verifyData.signature) {
        printNote('signature', 'present');
      }
    }

    // Download tarball
    const tarball = await client.downloadTarball(namespace, name, versionToInstall);

    // Verify checksum
    if (expectedChecksum) {
      const actualChecksum = crypto.createHash('sha256').update(Buffer.from(tarball)).digest('hex');
      if (actualChecksum !== expectedChecksum) {
        exitWithError(`Checksum verification failed. expected=${expectedChecksum} actual=${actualChecksum}`);
      }
      printNote('checksum', 'verified');
    }

    const installDirs = getInstallDirs(installResolution.targets, options);
    const destinations = getInstallDestinations(installResolution.targets, options);
    const installedDirs: string[] = [];

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

      installedDirs.push(skillDir);
      printNote('installed to', skillDir);
    }

    logSuccess(`Installed ${namespace}/${name}@${versionToInstall}`);
    if (installResolution.mode === 'detected') {
      printNote('auto target', describeInstallTargets(installResolution.targets));
    } else if (installResolution.mode === 'selected') {
      printNote('selected targets', describeInstallTargets(installResolution.targets));
    } else if (installResolution.mode === 'default') {
      printNote('default target', describeInstallTargets(installResolution.targets));
    } else {
      printNote('targets', describeInstallTargets(installResolution.targets));
    }

    if (isJsonOutput()) {
      printJson({
        command: 'add',
        source: skill,
        resolvedType: 'registry',
        skillCount: 1,
        detectedTargets: installResolution.detectedTargets,
        installedTargets: installResolution.targets,
        nextCommand: `skilo inspect ${skill}`,
        skill: `${namespace}/${name}`,
        version: versionToInstall,
        checksumVerified: Boolean(expectedChecksum),
        targetMode: installResolution.mode,
        targets: destinations.map((destination) => ({
          key: destination.key,
          label: destination.label,
          dirs: destination.dirs,
        })),
        installedDirs,
      });
    }
  } catch (e) {
    exitWithError(`Install failed: ${(e as Error).message}`);
  }
}
