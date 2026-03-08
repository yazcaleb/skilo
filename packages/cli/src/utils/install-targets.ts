import { homedir } from 'node:os';
import { join } from 'node:path';

export interface InstallOptions {
  global?: boolean;
  skill?: string[];
  list?: boolean;
  all?: boolean;
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

const INSTALL_TARGETS: Array<{ key: InstallTarget; label: string }> = [
  { key: 'claude', label: 'Claude Code' },
  { key: 'codex', label: 'Codex' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'amp', label: 'Amp' },
  { key: 'windsurf', label: 'Windsurf' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'cline', label: 'Cline' },
  { key: 'roo', label: 'Roo' },
  { key: 'openclaw', label: 'OpenClaw' },
];

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

function hasExplicitTargets(options: InstallOptions): boolean {
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

function parseTargetToken(token: string): InstallTarget | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'cc' || normalized === 'claude' || normalized === 'claude-code') {
    return 'claude';
  }
  if (normalized === 'oc' || normalized === 'opencode') {
    return 'opencode';
  }
  if (normalized === 'codex' || normalized === 'cursor' || normalized === 'amp' || normalized === 'windsurf' || normalized === 'cline' || normalized === 'roo' || normalized === 'openclaw') {
    return normalized;
  }

  return null;
}

export function resolveInstallTargets(options: InstallOptions = {}): InstallTarget[] {
  const targets: InstallTarget[] = [];

  if (options.cc || options.claudeCode) {
    targets.push('claude');
  }
  if (options.codex) {
    targets.push('codex');
  }
  if (options.cursor) {
    targets.push('cursor');
  }
  if (options.amp) {
    targets.push('amp');
  }
  if (options.windsurf) {
    targets.push('windsurf');
  }
  if (options.oc || options.opencode) {
    targets.push('opencode');
  }
  if (options.cline) {
    targets.push('cline');
  }
  if (options.roo) {
    targets.push('roo');
  }
  if (options.openclaw) {
    targets.push('openclaw');
  }

  if (targets.length === 0) {
    const fromEnv = (process.env.SKILO_TARGETS || '')
      .split(',')
      .map(parseTargetToken)
      .filter((value): value is InstallTarget => value !== null);
    if (fromEnv.length > 0) {
      return [...new Set(fromEnv)];
    }
  }

  return targets.length > 0 ? targets : ['claude'];
}

export function getInstallDirs(options: InstallOptions = {}): string[] {
  const targets = resolveInstallTargets(options);
  const useNativeDirs = options.global || hasExplicitTargets(options);
  const baseDir = useNativeDirs ? homedir() : process.cwd();
  const xdgConfigHome = useNativeDirs ? getXdgConfigHome() : join(baseDir, '.config');
  const dirs = new Set<string>();

  for (const target of targets) {
    if (target === 'claude') {
      dirs.add(join(baseDir, '.claude', 'skills'));
      continue;
    }

    if (target === 'codex') {
      dirs.add(join(baseDir, '.agents', 'skills'));
      dirs.add(join(baseDir, '.codex', 'skills'));
      continue;
    }

    if (target === 'cursor') {
      dirs.add(join(baseDir, '.cursor', 'skills'));
      continue;
    }

    if (target === 'amp') {
      dirs.add(join(xdgConfigHome, 'agents', 'skills'));
      continue;
    }

    if (target === 'windsurf') {
      dirs.add(join(baseDir, '.codeium', 'windsurf', 'skills'));
      continue;
    }

    if (target === 'opencode') {
      dirs.add(useNativeDirs ? join(xdgConfigHome, 'opencode', 'skills') : join(baseDir, '.opencode', 'skills'));
      continue;
    }

    if (target === 'cline') {
      dirs.add(join(baseDir, '.cline', 'skills'));
      continue;
    }

    if (target === 'roo') {
      dirs.add(join(baseDir, '.roo', 'skills'));
      continue;
    }

    dirs.add(
      useNativeDirs
        ? join(homedir(), '.openclaw', 'skills')
        : join(baseDir, '.openclaw', 'skills')
    );
  }

  return [...dirs];
}

export function getInstallDestinations(options: InstallOptions = {}): InstallDestination[] {
  const targets = resolveInstallTargets(options);
  const useNativeDirs = options.global || hasExplicitTargets(options);
  const baseDir = useNativeDirs ? homedir() : process.cwd();
  const xdgConfigHome = useNativeDirs ? getXdgConfigHome() : join(baseDir, '.config');

  return targets.map((target) => {
    const label = INSTALL_TARGETS.find((entry) => entry.key === target)?.label || target;

    if (target === 'claude') {
      return { key: target, label, dirs: [join(baseDir, '.claude', 'skills')] };
    }
    if (target === 'codex') {
      return {
        key: target,
        label,
        dirs: [join(baseDir, '.agents', 'skills'), join(baseDir, '.codex', 'skills')],
      };
    }
    if (target === 'cursor') {
      return { key: target, label, dirs: [join(baseDir, '.cursor', 'skills')] };
    }
    if (target === 'amp') {
      return { key: target, label, dirs: [join(xdgConfigHome, 'agents', 'skills')] };
    }
    if (target === 'windsurf') {
      return { key: target, label, dirs: [join(baseDir, '.codeium', 'windsurf', 'skills')] };
    }
    if (target === 'opencode') {
      return {
        key: target,
        label,
        dirs: [useNativeDirs ? join(xdgConfigHome, 'opencode', 'skills') : join(baseDir, '.opencode', 'skills')],
      };
    }
    if (target === 'cline') {
      return { key: target, label, dirs: [join(baseDir, '.cline', 'skills')] };
    }
    if (target === 'roo') {
      return { key: target, label, dirs: [join(baseDir, '.roo', 'skills')] };
    }

    return {
      key: target,
      label,
      dirs: [useNativeDirs ? join(homedir(), '.openclaw', 'skills') : join(baseDir, '.openclaw', 'skills')],
    };
  });
}

export function describeInstallTargets(options: InstallOptions = {}): string {
  return resolveInstallTargets(options)
    .map((target) => INSTALL_TARGETS.find((entry) => entry.key === target)?.label || target)
    .join(', ');
}
