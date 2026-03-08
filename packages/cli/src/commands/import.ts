// Import skill from various sources
import { readFile, mkdir, writeFile, rm, cp, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import * as tar from 'tar';
import { getClient } from '../api/client.js';
import { isRegistrySkillRef, normalizeSourceInput } from '../utils/source-kind.js';
import { findSkillFile } from '../utils/skill-file.js';
import {
  type InstallOptions,
  type InstallTargetResolution,
  describeInstallTargets,
  getInstallDestinations,
  getInstallDirs,
  getTargetFlag,
  resolveInstallTargets,
} from '../utils/install-targets.js';
import { exitWithError, isJsonOutput, logInfo, logSuccess, printJson, printNote, printUsage } from '../utils/output.js';
import {
  discoverRepoSkills,
  formatRepoSkillChoices,
  isGitHubRepoLike,
  normalizeGitHubSource,
  selectRepoSkills,
} from '../utils/repo-skills.js';
import { quoteShellValue, selectToolSourceSkills } from '../utils/tool-source.js';
import { discoverSkills, getToolLabel, resolveToolName } from '../tool-dirs.js';
import { parsePackToken } from './share.js';

function classifyImportSource(source: string): 'tool' | 'registry' | 'pack' | 'github' | 'bundle' | 'share' | 'url' | 'local' {
  if (resolveToolName(source)) return 'tool';
  if (parsePackToken(source)) return 'pack';
  if (isGitHubRepoLike(source)) return 'github';
  if (source.endsWith('.skl')) return 'bundle';
  if (source.startsWith('https://skilo.xyz/s/')) return 'share';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) return 'local';
  return 'registry';
}

function emitToolSkillSelectionNoop(
  source: string,
  sourceLabel: string,
  availableSkills: Array<{ name: string; tool: string }>
): void {
  const firstSkill = availableSkills[0]?.name;
  const nextCommand = firstSkill
    ? `skilo add ${source} --skill ${quoteShellValue(firstSkill)}`
    : `skilo add ${source} --all`;

  if (isJsonOutput()) {
    printJson({
      command: 'add',
      source,
      resolvedType: 'tool',
      skillCount: 0,
      availableSkills: availableSkills.map((skill) => ({
        name: skill.name,
        tool: skill.tool,
      })),
      installedTargets: [],
      nextCommand,
      message: `Multiple skills found in ${sourceLabel}. Pass --all, use --skill <name>, or run in a TTY.`,
    });
    return;
  }

  exitWithError(`Multiple skills found in ${sourceLabel}. Pass --all, use --skill <name>, or run in a TTY.`);
}

function emitTargetSelectionNoop(
  source: string,
  resolvedType: string,
  skillCount: number,
  resolution: InstallTargetResolution
): void {
  const nextCommand = resolution.detectedTargets[0]
    ? `skilo add ${source} ${getTargetFlag(resolution.detectedTargets[0])}`
    : `skilo add ${source} --cc`;

  if (isJsonOutput()) {
    printJson({
      command: 'add',
      source,
      resolvedType,
      skillCount,
      detectedTargets: resolution.detectedTargets,
      installedTargets: [],
      nextCommand,
      message: resolution.detectedTargets.length > 0
        ? 'Multiple install targets detected. Pass an explicit target flag or set SKILO_TARGETS.'
        : 'No install targets selected.',
    });
    return;
  }

  exitWithError(
    resolution.detectedTargets.length > 0
      ? `Multiple install targets detected: ${resolution.detectedTargets.join(', ')}. Pass ${resolution.detectedTargets.map(getTargetFlag).join(', ')} or set SKILO_TARGETS.`
      : 'Install cancelled.'
  );
}

export async function importCommand(source: string, options: InstallOptions = {}): Promise<void> {
  if (!source) {
    printUsage([
      'Usage: skilo import <source>',
      '',
      'Sources:',
      '  github:user/repo        Import from GitHub',
      '  github:user/repo#path   Import subfolder',
      '  https://github.com/...  Import from a GitHub URL',
      '  owner/repo --skill foo  Import a skill from a GitHub repo',
      '  ./path/to/skill.skl     Import from .skl file',
      '  /local/path             Import from local path',
      '  claude --oc             Import from a local tool source',
      '  https://skilo.xyz/s/... Import from share link',
    ]);
  }

  let cleanupPath: string | null = null;

  try {
    source = normalizeSourceInput(source);
    const prefersRepoSelection = Boolean(options.list || options.all || options.skill?.length);
    const resolvedType = classifyImportSource(source);
    const sourceTool = resolveToolName(source);

    if (sourceTool) {
      const sourceLabel = getToolLabel(sourceTool);
      const availableSkills = await discoverSkills(sourceTool);

      if (options.list) {
        if (isJsonOutput()) {
          printJson({
            command: 'import',
            source,
            mode: 'list',
            resolvedType: 'tool',
            sourceTool,
            skills: availableSkills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              path: skill.path,
              tool: skill.tool,
            })),
          });
        } else if (availableSkills.length === 0) {
          logInfo(`No skills found in ${sourceLabel}.`);
        } else {
          logInfo(`Found ${availableSkills.length} skill${availableSkills.length === 1 ? '' : 's'} in ${sourceLabel}:`);
          for (const skill of availableSkills) {
            printNote('skill', `${skill.name}${skill.tool ? ` (${skill.tool})` : ''}`);
          }
        }
        return;
      }

      const selection = await selectToolSourceSkills(source, options);
      if (selection.mode === 'needs_selection') {
        emitToolSkillSelectionNoop(source, selection.sourceLabel, selection.availableSkills);
        return;
      }

      if (selection.mode === 'cancelled') {
        logInfo('No skills selected.');
        if (isJsonOutput()) {
          printJson({
            command: 'add',
            source,
            resolvedType: 'tool',
            sourceTool: selection.sourceTool,
            skillCount: 0,
            installedTargets: [],
            cancelled: true,
          });
        }
        return;
      }

      const installResolution = await resolveInstallTargets(options);
      if (installResolution.mode === 'needs_target' || (installResolution.mode === 'selected' && installResolution.targets.length === 0)) {
        emitTargetSelectionNoop(source, 'tool', selection.selectedSkills.length, installResolution);
        return;
      }

      const installResults = [];
      for (const selected of selection.selectedSkills) {
        logInfo(`Installing ${selected.name} from ${selection.sourceLabel}`);
        installResults.push(await installSkill(selected.path, options, installResolution));
      }

      logSuccess(`Imported ${installResults.length} skill${installResults.length === 1 ? '' : 's'} from ${selection.sourceLabel}`);

      if (isJsonOutput()) {
        printJson({
          command: 'add',
          source,
          resolvedType: 'tool',
          sourceTool: selection.sourceTool,
          sourceLabel: selection.sourceLabel,
          skillCount: installResults.length,
          detectedTargets: installResolution.detectedTargets,
          installedTargets: installResolution.targets,
          nextCommand: `skilo share ${source}${selection.selectionMode === 'all' ? ' -y' : ''}`,
          selectedSkills: selection.selectedSkills.map((skill) => ({
            name: skill.name,
            path: skill.path,
            tool: skill.tool,
          })),
          installedSkills: installResults.map((installResult) => ({
            name: installResult.name,
            targets: installResult.targets,
            installedDirs: installResult.installedDirs,
          })),
        });
      }
      return;
    }

    if (await isRegistrySkillRef(source) && !(prefersRepoSelection && isGitHubRepoLike(source))) {
      const { installCommand } = await import('./install.js');
      await installCommand(source, options);
      return;
    }

    let skillPath: string;
    const packToken = parsePackToken(source);

    if (packToken) {
      const installResolution = await resolveInstallTargets(options);
      if (installResolution.mode === 'needs_target' || (installResolution.mode === 'selected' && installResolution.targets.length === 0)) {
        const client = await getClient();
        const pack = await client.resolvePack(packToken);
        emitTargetSelectionNoop(source, 'pack', pack.skills.length, installResolution);
        return;
      }

      const packResult = await importFromPackLink(packToken, options, installResolution);
      logSuccess(`Imported pack ${packResult.name}`);

      if (isJsonOutput()) {
        printJson({
          command: 'add',
          source,
          resolvedType: 'pack',
          skillCount: packResult.installedSkills.length,
          detectedTargets: installResolution.detectedTargets,
          installedTargets: installResolution.targets,
          nextCommand: `skilo inspect ${source}`,
          pack: {
            token: packResult.token,
            name: packResult.name,
          },
          installedSkills: packResult.installedSkills,
        });
      }
      return;
    }

    if (isGitHubRepoLike(source)) {
      const imported = await importFromGitHub(normalizeGitHubSource(source));
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
      skillPath = await importFromLocalPath(source, prefersRepoSelection);
    }

    const repoSkills = await discoverRepoSkills(skillPath);

    if (options.list) {
      if (isJsonOutput()) {
        printJson({
          command: 'import',
          source,
          mode: 'list',
          skills: repoSkills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            relativeDir: skill.relativeDir,
            source: skill.source,
          })),
        });
      } else if (repoSkills.length === 0) {
        logInfo('No skills found in source.');
      } else {
        logInfo(`Found ${repoSkills.length} skill${repoSkills.length === 1 ? '' : 's'}:`);
        for (const line of formatRepoSkillChoices(repoSkills)) {
          printNote('skill', line, 'primary');
        }
      }
      return;
    }

    const selectedRepoSkills = selectRepoSkills(repoSkills, options);
    const installResolution = await resolveInstallTargets(options);

    const selectedSkillCount = selectedRepoSkills.length > 0 ? selectedRepoSkills.length : 1;
    if (installResolution.mode === 'needs_target' || (installResolution.mode === 'selected' && installResolution.targets.length === 0)) {
      emitTargetSelectionNoop(source, resolvedType, selectedSkillCount, installResolution);
      return;
    }

    const installResults = [];

    if (selectedRepoSkills.length > 0) {
      for (const selected of selectedRepoSkills) {
        logInfo(`Installing ${selected.name}${selected.relativeDir === '.' ? '' : ` from ${selected.relativeDir}`}`);
        installResults.push(await installSkill(selected.path, options, installResolution));
      }
    } else {
      if (repoSkills.length > 1 && !options.all && !(options.skill?.length)) {
        exitWithError(
          `Multiple skills found in source. Run "skilo import ${source} --list" to inspect them, or pass "--skill <name>" / "--all".`
        );
      }

      if (options.skill?.length) {
        exitWithError(
          `Requested skill not found. Available: ${formatRepoSkillChoices(repoSkills).join(', ')}`
        );
      }

      installResults.push(await installSkill(skillPath, options, installResolution));
    }

    logSuccess(`Imported from ${source}`);

    if (isJsonOutput()) {
      printJson({
        command: 'add',
        source,
        resolvedType,
        skillCount: installResults.length,
        detectedTargets: installResolution.detectedTargets,
        installedTargets: installResolution.targets,
        nextCommand: `skilo inspect ${source}`,
        installedSkills: installResults.map((installResult) => ({
          name: installResult.name,
          targets: installResult.targets,
          installedDirs: installResult.installedDirs,
        })),
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
      'User-Agent': 'skilo-cli/1.0.16',
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

async function importFromPackLink(
  token: string,
  options: InstallOptions = {},
  installResolution: InstallTargetResolution
): Promise<{
  token: string;
  name: string;
  installedSkills: Array<{
    source: string;
    name: string;
    targets: Array<{ key: string; label: string; dirs: string[] }>;
    installedDirs: string[];
  }>;
}> {
  const client = await getClient();
  const pack = await client.resolvePack(token);
  const installedSkills: Array<{
    source: string;
    name: string;
    targets: Array<{ key: string; label: string; dirs: string[] }>;
    installedDirs: string[];
  }> = [];

  logInfo(`Resolving pack ${pack.name || token}`);

  for (const skill of pack.skills) {
    const shareSource = `https://skilo.xyz/s/${skill.shareToken}`;
    const imported = await importFromShareLink(shareSource);
    try {
      const installResult = await installSkill(imported.skillPath, options, installResolution);
      installedSkills.push({
        source: shareSource,
        name: installResult.name,
        targets: installResult.targets,
        installedDirs: installResult.installedDirs,
      });
    } finally {
      await rm(imported.cleanupPath, { recursive: true, force: true });
    }
  }

  return {
    token: pack.token,
    name: pack.name,
    installedSkills,
  };
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

async function importFromLocalPath(source: string, allowRepoRoot = false): Promise<string> {
  const resolvedPath = resolve(source);
  logInfo(`Reading local skill ${resolvedPath}`);

  const stats = await stat(resolvedPath).catch(() => null);
  if (!stats) {
    throw new Error(`Path not found: ${resolvedPath}`);
  }

  if (allowRepoRoot && stats.isDirectory()) {
    return resolvedPath;
  }

  // Validate SKILL.md exists
  if (!await findSkillFile(resolvedPath)) {
    throw new Error('No SKILL.md or skill.md found in the specified path');
  }

  return resolvedPath;
}

export async function installSkill(
  skillPath: string,
  options: InstallOptions = {},
  installResolution: InstallTargetResolution
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
  const installDirs = getInstallDirs(installResolution.targets, options);
  const destinations = getInstallDestinations(installResolution.targets, options);
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
  if (installResolution.mode === 'detected') {
    printNote('auto target', describeInstallTargets(installResolution.targets));
  } else if (installResolution.mode === 'selected') {
    printNote('selected targets', describeInstallTargets(installResolution.targets));
  } else if (installResolution.mode === 'default') {
    printNote('default target', describeInstallTargets(installResolution.targets));
  } else {
    printNote('targets', describeInstallTargets(installResolution.targets));
  }

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
