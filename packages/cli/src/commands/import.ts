// Import skill from various sources
import { readFile, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, resolve, basename } from 'node:path';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar';
import { getClient } from '../api/client.js';

interface ImportOptions {
  global?: boolean;
}

export async function importCommand(source: string, options: ImportOptions = {}): Promise<void> {
  if (!source) {
    console.error('Usage: skilo import <source>');
    console.error('');
    console.error('Sources:');
    console.error('  github:user/repo        Import from GitHub');
    console.error('  github:user/repo#path   Import subfolder');
    console.error('  ./path/to/skill.skl     Import from .skl file');
    console.error('  /local/path             Import from local path');
    console.error('  https://skilo.xyz/s/... Import from share link');
    process.exit(1);
  }

  try {
    let skillPath: string;

    if (source.startsWith('github:')) {
      // GitHub import
      skillPath = await importFromGitHub(source);
    } else if (source.endsWith('.skl')) {
      // .skl file import
      skillPath = await importFromSkl(source);
    } else if (source.startsWith('https://skilo.xyz/s/')) {
      // Share link import
      skillPath = await importFromShareLink(source);
    } else if (source.startsWith('http://') || source.startsWith('https://')) {
      // Direct URL
      skillPath = await importFromUrl(source);
    } else {
      // Local path
      skillPath = await importFromLocalPath(source);
    }

    // Install to skills directory
    await installSkill(skillPath, options.global);

    console.log(`✓ Imported from ${source}`);
  } catch (e) {
    console.error(`Import failed: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function importFromGitHub(source: string): Promise<string> {
  const match = source.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
  if (!match) {
    throw new Error('Invalid GitHub source format. Use: github:user/repo or github:user/repo#path');
  }

  const [, owner, repo, subpath = ''] = match;
  console.log(`Fetching from GitHub: ${owner}/${repo}${subpath ? `/${subpath}` : ''}...`);

  // Use GitHub API to get tarball
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball`;
  const response = await fetch(tarballUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'skilo-cli/1.0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  // Download and extract
  const tempDir = join(process.cwd(), '.skilo-temp-import');
  await mkdir(tempDir, { recursive: true });

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
    return join(tempDir, subpath);
  }

  return tempDir;
}

async function importFromSkl(source: string): Promise<string> {
  const resolvedPath = resolve(source);
  console.log(`Extracting .skl file: ${resolvedPath}...`);

  const tempDir = join(process.cwd(), '.skilo-temp-import');
  await mkdir(tempDir, { recursive: true });

  // Extract tar.gz
  await tar.extract({
    file: resolvedPath,
    cwd: tempDir,
    gzip: true,
  });

  return tempDir;
}

async function importFromShareLink(source: string): Promise<string> {
  const token = source.split('/s/')[1];
  if (!token) {
    throw new Error('Invalid share link format');
  }

  console.log(`Resolving share link: ${token}...`);

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
  const tempDir = join(process.cwd(), '.skilo-temp-import');
  await mkdir(tempDir, { recursive: true });

  const tarballUrl = data.skill.tarballUrl;
  if (!tarballUrl) {
    throw new Error('No tarball available for this skill');
  }

  const tarballResponse = await fetch(`${client.baseUrl}${tarballUrl}`);
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

  return tempDir;
}

async function importFromUrl(source: string): Promise<string> {
  console.log(`Downloading from URL: ${source}...`);

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const tempDir = join(process.cwd(), '.skilo-temp-import');
  await mkdir(tempDir, { recursive: true });

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

  return tempDir;
}

async function importFromLocalPath(source: string): Promise<string> {
  const resolvedPath = resolve(source);
  console.log(`Importing from local path: ${resolvedPath}...`);

  // Validate SKILL.md exists
  try {
    await readFile(join(resolvedPath, 'SKILL.md'), 'utf-8');
  } catch {
    throw new Error('No SKILL.md found in the specified path');
  }

  return resolvedPath;
}

async function installSkill(skillPath: string, global?: boolean): Promise<void> {
  const skillsDir = global
    ? join(process.env.HOME || '', '.skilo', 'skills')
    : join(process.cwd(), '.claude', 'skills');

  await mkdir(skillsDir, { recursive: true });

  // Read SKILL.md to get name
  const skillMd = await readFile(join(skillPath, 'SKILL.md'), 'utf-8');
  const nameMatch = skillMd.match(/#\s*(.+)/);
  const name = nameMatch ? nameMatch[1].trim() : basename(skillPath);

  const targetDir = join(skillsDir, name.replace(/\//g, '-'));
  await mkdir(targetDir, { recursive: true });

  // Copy files
  await cp(skillPath, targetDir, { recursive: true });

  console.log(`✓ Installed to ${targetDir}`);
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

// Need to extend ApiClient with baseUrl
// Add this to the API client file
