import { homedir } from 'node:os';
import { join } from 'node:path';

export interface InstallOptions {
  global?: boolean;
  cc?: boolean;
  claudeCode?: boolean;
  oc?: boolean;
  opencode?: boolean;
  openclaw?: boolean;
}

export type InstallTarget = 'claude' | 'opencode' | 'openclaw';

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

export function resolveInstallTargets(options: InstallOptions = {}): InstallTarget[] {
  const targets: InstallTarget[] = [];

  if (options.cc || options.claudeCode) {
    targets.push('claude');
  }
  if (options.oc || options.opencode) {
    targets.push('opencode');
  }
  if (options.openclaw) {
    targets.push('openclaw');
  }

  return targets.length > 0 ? targets : ['claude'];
}

export function getInstallDirs(options: InstallOptions = {}): string[] {
  const targets = resolveInstallTargets(options);
  const baseDir = options.global ? homedir() : process.cwd();
  const dirs = new Set<string>();

  for (const target of targets) {
    if (target === 'claude') {
      dirs.add(join(baseDir, '.claude', 'skills'));
      continue;
    }

    if (target === 'opencode') {
      dirs.add(
        options.global
          ? join(getXdgConfigHome(), 'opencode', 'skills')
          : join(baseDir, '.opencode', 'skills')
      );
      continue;
    }

    dirs.add(
      options.global
        ? join(homedir(), '.openclaw', 'skills')
        : join(baseDir, '.openclaw', 'skills')
    );
  }

  return [...dirs];
}

export function describeInstallTargets(options: InstallOptions = {}): string {
  return resolveInstallTargets(options)
    .map((target) => {
      if (target === 'claude') return 'Claude Code';
      if (target === 'opencode') return 'OpenCode';
      return 'OpenClaw';
    })
    .join(', ');
}
