import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isInteractiveOutput, isJsonOutput } from './output.js';
import { pickItems } from './picker.js';

export interface InstallOptions {
  global?: boolean;
  skill?: string[];
  list?: boolean;
  all?: boolean;
  skip?: string;
  only?: string;
  cc?: boolean;
  claudeCode?: boolean;
  codex?: boolean;
  cursor?: boolean;
  amp?: boolean;
  windsurf?: boolean;
  oc?: boolean;
  opencode?: boolean;
  cline?: boolean;
  roo?: boolean;
  openclaw?: boolean;
}

export type InstallTarget =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'amp'
  | 'windsurf'
  | 'opencode'
  | 'cline'
  | 'roo'
  | 'openclaw';

export interface InstallDestination {
  key: InstallTarget;
  label: string;
  dirs: string[];
}

export interface InstallTargetResolution {
  mode: 'explicit' | 'env' | 'detected' | 'selected' | 'default' | 'needs_target';
  targets: InstallTarget[];
  detectedTargets: InstallTarget[];
}

type InstallTargetDefinition = {
  key: InstallTarget;
  label: string;
  aliases: string[];
  getDirs: (useNativeDirs: boolean) => string[];
};

const INSTALL_TARGETS: InstallTargetDefinition[] = [
  {
    key: 'claude',
    label: 'Claude Code',
    aliases: ['cc', 'claude', 'claude-code'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.claude', 'skills')];
    },
  },
  {
    key: 'codex',
    label: 'Codex',
    aliases: ['codex'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.agents', 'skills'), join(baseDir, '.codex', 'skills')];
    },
  },
  {
    key: 'cursor',
    label: 'Cursor',
    aliases: ['cursor'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.cursor', 'skills')];
    },
  },
  {
    key: 'amp',
    label: 'Amp',
    aliases: ['amp'],
    getDirs: (useNativeDirs) => {
      const xdgConfigHome = useNativeDirs ? getXdgConfigHome() : join(process.cwd(), '.config');
      return [join(xdgConfigHome, 'agents', 'skills')];
    },
  },
  {
    key: 'windsurf',
    label: 'Windsurf',
    aliases: ['windsurf'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.codeium', 'windsurf', 'skills')];
    },
  },
  {
    key: 'opencode',
    label: 'OpenCode',
    aliases: ['oc', 'opencode'],
    getDirs: (useNativeDirs) => {
      if (useNativeDirs) {
        return [join(getXdgConfigHome(), 'opencode', 'skills')];
      }
      return [join(process.cwd(), '.opencode', 'skills')];
    },
  },
  {
    key: 'cline',
    label: 'Cline',
    aliases: ['cline'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.cline', 'skills')];
    },
  },
  {
    key: 'roo',
    label: 'Roo',
    aliases: ['roo'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.roo', 'skills')];
    },
  },
  {
    key: 'openclaw',
    label: 'OpenClaw',
    aliases: ['openclaw'],
    getDirs: (useNativeDirs) => {
      const baseDir = useNativeDirs ? homedir() : process.cwd();
      return [join(baseDir, '.openclaw', 'skills')];
    },
  },
];

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

export function hasExplicitTargets(options: InstallOptions = {}): boolean {
  return Boolean(
    options.cc ||
    options.claudeCode ||
    options.codex ||
    options.cursor ||
    options.amp ||
    options.windsurf ||
    options.oc ||
    options.opencode ||
    options.cline ||
    options.roo ||
    options.openclaw
  );
}

function getTargetDefinition(target: InstallTarget): InstallTargetDefinition {
  const match = INSTALL_TARGETS.find((entry) => entry.key === target);
  if (!match) {
    throw new Error(`Unknown install target: ${target}`);
  }
  return match;
}

function getTargetsFromOptions(options: InstallOptions = {}): InstallTarget[] {
  const targets: InstallTarget[] = [];

  if (options.cc || options.claudeCode) targets.push('claude');
  if (options.codex) targets.push('codex');
  if (options.cursor) targets.push('cursor');
  if (options.amp) targets.push('amp');
  if (options.windsurf) targets.push('windsurf');
  if (options.oc || options.opencode) targets.push('opencode');
  if (options.cline) targets.push('cline');
  if (options.roo) targets.push('roo');
  if (options.openclaw) targets.push('openclaw');

  return [...new Set(targets)];
}

export function getExplicitInstallTargets(options: InstallOptions = {}): InstallTarget[] {
  return getTargetsFromOptions(options);
}

function parseTargetToken(token: string): InstallTarget | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const match = INSTALL_TARGETS.find((entry) => entry.aliases.includes(normalized));
  return match?.key || null;
}

export function parseInstallTargetTokens(tokens: string[]): InstallTarget[] {
  return [...new Set(tokens.map(parseTargetToken).filter((value): value is InstallTarget => value !== null))];
}

function getTargetsFromEnv(): InstallTarget[] {
  return [...new Set(
    (process.env.SKILO_TARGETS || '')
      .split(',')
      .map(parseTargetToken)
      .filter((value): value is InstallTarget => value !== null)
  )];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectInstalledTargets(): Promise<InstallTarget[]> {
  const detected: InstallTarget[] = [];

  for (const target of INSTALL_TARGETS) {
    const dirs = target.getDirs(true);
    if ((await Promise.all(dirs.map(pathExists))).some(Boolean)) {
      detected.push(target.key);
    }
  }

  return detected;
}

async function promptForInstallTargets(targets: InstallTarget[]): Promise<InstallTarget[]> {
  if (!process.stdin.isTTY || !isInteractiveOutput()) {
    return targets;
  }

  const picked = await pickItems(
    targets.map((target) => ({
      value: target,
      name: getTargetDefinition(target).label,
      description: getTargetDefinition(target).getDirs(true).join(', '),
      meta: getTargetFlag(target),
    })),
    'Choose install targets'
  );

  return picked.cancelled ? [] : picked.selected;
}

export async function resolveInstallTargets(
  options: InstallOptions = {}
): Promise<InstallTargetResolution> {
  const explicitTargets = getTargetsFromOptions(options);
  if (explicitTargets.length > 0) {
    return {
      mode: 'explicit',
      targets: explicitTargets,
      detectedTargets: [],
    };
  }

  const envTargets = getTargetsFromEnv();
  if (envTargets.length > 0) {
    return {
      mode: 'env',
      targets: envTargets,
      detectedTargets: [],
    };
  }

  const detectedTargets = await detectInstalledTargets();
  if (detectedTargets.length === 1) {
    return {
      mode: 'detected',
      targets: detectedTargets,
      detectedTargets,
    };
  }

  if (detectedTargets.length > 1) {
    if (isInteractiveOutput() && process.stdin.isTTY && !isJsonOutput()) {
      const selectedTargets = await promptForInstallTargets(detectedTargets);
      return {
        mode: 'selected',
        targets: selectedTargets,
        detectedTargets,
      };
    }

    return {
      mode: 'needs_target',
      targets: [],
      detectedTargets,
    };
  }

  return {
    mode: 'default',
    targets: ['claude'],
    detectedTargets: [],
  };
}

export function getInstallDirs(targets: InstallTarget[], options: InstallOptions = {}): string[] {
  const useNativeDirs = options.global || hasExplicitTargets(options) || targets.length > 0;
  const dirs = new Set<string>();

  for (const target of targets) {
    for (const dir of getTargetDefinition(target).getDirs(useNativeDirs)) {
      dirs.add(dir);
    }
  }

  return [...dirs];
}

export function getInstallDestinations(
  targets: InstallTarget[],
  options: InstallOptions = {}
): InstallDestination[] {
  const useNativeDirs = options.global || hasExplicitTargets(options) || targets.length > 0;

  return targets.map((target) => {
    const definition = getTargetDefinition(target);
    return {
      key: definition.key,
      label: definition.label,
      dirs: definition.getDirs(useNativeDirs),
    };
  });
}

export function describeInstallTargets(targets: InstallTarget[]): string {
  return targets.map((target) => getTargetDefinition(target).label).join(', ');
}

export function getTargetFlag(target: InstallTarget): string {
  if (target === 'claude') return '--cc';
  if (target === 'opencode') return '--oc';
  return `--${target}`;
}
