// Import skill from various sources
import { readFile, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import * as tar from 'tar';
import { getClient } from '../api/client.js';
import { isRegistrySkillRef, normalizeSourceInput } from '../utils/source-kind.js';
import { findSkillFile } from '../utils/skill-file.js';
import { type InstallOptions, describeInstallTargets, getInstallDestinations, getInstallDirs } from '../utils/install-targets.js';
import { exitWithError, isJsonOutput, logInfo, logSuccess, printJson, printNote, printUsage } from '../utils/output.js';

export async function importCommand(source: string, options: InstallOptions = {}): Promise<void> {
  if (!source) {
    printUsage([
      'Usage: skilo import <source>',
      '',
      'Sources:',
      '  github:user/repo        Import from GitHub',
      '  github:user/repo#path   Import subfolder',
      '  ./path/to/skill.skl     Import from .skl file',
      '  /local/path             Import from local path',
      '  https://skilo.xyz/s/... Import from share link',
    ]);
  }

  let cleanupPath: string | null = null;

  try {
    source = normalizeSourceInput(source);

    if (await isRegistrySkillRef(source)) {
      const { installCommand } = await import('./install.js');
      await installCommand(source, options);
      return;
    }

    let skillPath: string;

    if (source.startsWith('github:')) {
      const imported = await importFromGitHub(source);
      skillPath = imported.skillPath;
      cleanupPath = imported.cleanupPath;
    } else if (source.endsWith('.skl')) {
      const imported = await importFromSkl(source);
      skillPath = imported.skillPath;
      cleanupPath = imported.cleanupPath;
    } else if (source.startsWith('https://skilo.xyz/s/')) {
      const imported = await importFromShareLink(source);
      skillPath = imported.skillPath;
      cleanupPath = imported.cleanupPath;
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      const imported = await importFromUrl(source);
      skillPath = imported.skillPath;
      cleanupPath = imported.cleanupPath;
    } else {
      // Local path
      skillPath = await importFromLocalPath(source);
    }

    // Install to skills directory
    const installResult = await installSkill(skillPath, options);

    logSuccess(`Imported from ${source}`);

    if (isJsonOutput()) {
      printJson({
        command: 'import',
        source,
        installedSkill: installResult.name,
        targets: installResult.targets,
        installedDirs: installResult.installedDirs,
      });
    }
  } catch (e) {
    exitWithError(`Import failed: ${(e as Error).message}`);
  } finally {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
    }
  }
}

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function importFromGitHub(source: string): Promise<{ skillPath: string; cleanupPath: string }> {
  const match = source.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
  if (!match) {
    throw new Error('Invalid GitHub source format. Use: github:user/repo or github:user/repo#path');
  }

  const [, owner, repo, subpath = ''] = match;
  logInfo(`Fetching GitHub source ${owner}/${repo}${subpath ? `/${subpath}` : ''}`);

  // Use GitHub API to get tarball
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball`;
  const response = await fetch(tarballUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'skilo-cli/1.0.10',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  // Download and extract
  const tempDir = await createTempDir(`skilo-import-github-${Date.now()}`);

  const tempTar = join(tempDir, 'download.tar.gz');
  const buffer = await response.arrayBuffer();
  await writeFile(tempTar, Buffer.from(buffer));

  // Extract
  await tar.extract({
    file: tempTar,
    cwd: tempDir,
    strip: 1,
  });

  // Clean up tarball
  await rm(tempTar);

  // If subpath specified, return that
  if (subpath) {
    return { skillPath: join(tempDir, subpath), cleanupPath: tempDir };
  }

  return { skillPath: tempDir, cleanupPath: tempDir };
}

async function importFromSkl(source: string): Promise<{ skillPath: string; cleanupPath: string }> {
  const resolvedPath = resolve(source);
  logInfo(`Extracting bundle ${resolvedPath}`);

  const tempDir = await createTempDir(`skilo-import-skl-${Date.now()}`);

  // Extract tar.gz
  await tar.extract({
    file: resolvedPath,
    cwd: tempDir,
    gzip: true,
  });

  return { skillPath: tempDir, cleanupPath: tempDir };
}

async function importFromShareLink(source: string): Promise<{ skillPath: string; cleanupPath: string }> {
  const token = source.split('/s/')[1];
  if (!token) {
    throw new Error('Invalid share link format');
  }

  logInfo(`Resolving share link ${token}`);

  const client = await getClient();

  // Resolve share link
  // This would need to be added to the API client
  const response = await fetch(`${client.baseUrl}/v1/skills/share/${token}`);
  if (!response.ok) {
    throw new Error('Invalid or expired share link');
  }

  const data = await response.json();

  if (data.requiresPassword) {
    // Prompt for password
    const password = await promptPassword();
    const verifyResponse = await fetch(`${client.baseUrl}/v1/skills/share/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!verifyResponse.ok) {
      throw new Error('Invalid password');
    }
  }

  // Download tarball
  const tempDir = await createTempDir(`skilo-import-share-${Date.now()}`);

  const tarballUrl = data.skill.tarballUrl;
  if (!tarballUrl) {
    throw new Error('No tarball available for this skill');
  }

  const downloadUrl = tarballUrl.startsWith('http') ? tarballUrl : `${client.baseUrl}${tarballUrl}`;
  const tarballResponse = await fetch(downloadUrl);
  if (!tarballResponse.ok) {
    throw new Error('Failed to download skill');
  }

  const buffer = await tarballResponse.arrayBuffer();
  const tempTar = join(tempDir, 'skill.tar.gz');
  await writeFile(tempTar, Buffer.from(buffer));

  // Extract
  await tar.extract({
    file: tempTar,
    cwd: tempDir,
    gzip: true,
  });

  await rm(tempTar);

  return { skillPath: tempDir, cleanupPath: tempDir };
}

async function importFromUrl(source: string): Promise<{ skillPath: string; cleanupPath: string }> {
  logInfo(`Downloading ${source}`);

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const tempDir = await createTempDir(`skilo-import-url-${Date.now()}`);

  const buffer = await response.arrayBuffer();
  const tempFile = join(tempDir, 'download');
  await writeFile(tempFile, Buffer.from(buffer));

  // Try to detect if it's a tar.gz
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('gzip') || source.endsWith('.tgz') || source.endsWith('.tar.gz')) {
    await tar.extract({
      file: tempFile,
      cwd: tempDir,
      gzip: true,
    });
    await rm(tempFile);
  }

  return { skillPath: tempDir, cleanupPath: tempDir };
}

async function importFromLocalPath(source: string): Promise<string> {
  const resolvedPath = resolve(source);
  logInfo(`Reading local skill ${resolvedPath}`);

  // Validate SKILL.md exists
  if (!await findSkillFile(resolvedPath)) {
    throw new Error('No SKILL.md or skill.md found in the specified path');
  }

  return resolvedPath;
}

async function installSkill(
  skillPath: string,
  options: InstallOptions = {}
): Promise<{
  name: string;
  targets: Array<{ key: string; label: string; dirs: string[] }>;
  installedDirs: string[];
}> {
  const skillFile = await findSkillFile(skillPath);
  if (!skillFile) {
    throw new Error(`No SKILL.md or skill.md found in ${skillPath}`);
  }

  const skillMd = await readFile(join(skillPath, skillFile), 'utf-8');
  const nameMatch = skillMd.match(/#\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim() : basename(skillPath);
  const installDirs = getInstallDirs(options);
  const destinations = getInstallDestinations(options);
  const installedDirs: string[] = [];

  for (const skillsDir of installDirs) {
    await mkdir(skillsDir, { recursive: true });

    const targetDir = join(skillsDir, name.replace(/\//g, '-'));
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await cp(skillPath, targetDir, { recursive: true });
    installedDirs.push(targetDir);
    printNote('installed to', targetDir);
  }

  logSuccess('Install complete');
  printNote('targets', describeInstallTargets(options));

  return {
    name,
    targets: destinations.map((destination) => ({
      key: destination.key,
      label: destination.label,
      dirs: destination.dirs,
    })),
    installedDirs,
  };
}

async function promptPassword(): Promise<string> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Password: ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}
