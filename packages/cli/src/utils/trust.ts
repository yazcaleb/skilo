import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillMetadata } from '../types.js';
import { findSkillFile } from './skill-file.js';
import { blankLine, printKeyValue, printNote, printSection } from './output.js';

type TrustInfo = NonNullable<SkillMetadata['trust']>;

export function formatPublisherStatus(status: TrustInfo['publisherStatus']): string {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'claimed':
      return 'claimed';
    default:
      return 'anonymous';
  }
}

export function formatAuditStatus(status: TrustInfo['auditStatus']): string {
  switch (status) {
    case 'blocked':
      return 'blocked';
    case 'warning':
      return 'warning';
    default:
      return 'clean';
  }
}

export function printTrustSummary(trust: TrustInfo | null | undefined, opts: { includeFindings?: boolean } = {}): void {
  if (!trust) {
    return;
  }

  printKeyValue('publisher', formatPublisherStatus(trust.publisherStatus));
  printKeyValue('audit', formatAuditStatus(trust.auditStatus));
  printKeyValue('visibility', trust.visibility);
  printKeyValue('signature', trust.integrity.signatureVerified ? 'verified' : trust.hasSignature ? 'present' : 'absent');

  if (trust.capabilities.length > 0) {
    printKeyValue('capabilities', trust.capabilities.join(', '));
  }

  if (trust.riskSummary.length > 0) {
    for (const summary of trust.riskSummary) {
      printNote('risk', summary, 'primary');
    }
  }

  if (opts.includeFindings && trust.findings.length > 0) {
    blankLine();
    printSection('Findings', 'primary');
    for (const finding of trust.findings) {
      printNote(finding.severity, finding.message, 'primary');
    }
  }
}

export async function auditLocalSkill(skillDir: string): Promise<{
  name: string;
  auditStatus: 'clean' | 'warning' | 'blocked';
  capabilities: string[];
  findings: Array<{ severity: 'warning' | 'blocked'; message: string }>;
}> {
  const skillFile = await findSkillFile(skillDir);
  if (!skillFile) {
    return {
      name: skillDir,
      auditStatus: 'blocked',
      capabilities: [],
      findings: [{ severity: 'blocked', message: 'Missing SKILL.md' }],
    };
  }

  const content = await readFile(join(skillDir, skillFile), 'utf-8');
  const findings: Array<{ severity: 'warning' | 'blocked'; message: string }> = [];
  const capabilities = new Set<string>();

  if (/\b(api[_ -]?key|access[_ -]?token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_\-\/=]{12,}/i.test(content)) {
    findings.push({ severity: 'blocked', message: 'Possible hardcoded secret or credential found.' });
    capabilities.add('secrets');
  }
  if (/\b(ignore (all|any|previous) instructions|reveal (the )?(system|hidden) prompt|dump (the )?(prompt|memory)|exfiltrat)\b/i.test(content)) {
    findings.push({ severity: 'blocked', message: 'Prompt exfiltration or instruction override language detected.' });
  }
  if (/(<script\b|onerror=|onload=|javascript:)/i.test(content)) {
    findings.push({ severity: 'blocked', message: 'Raw scriptable HTML or JavaScript detected.' });
  }
  if (/\b(curl\s+https?:\/\/|wget\s+https?:\/\/|bash\s+-c|powershell\s+-enc|invoke-webrequest)\b/i.test(content)) {
    findings.push({ severity: 'warning', message: 'Remote download or execution instructions detected.' });
    capabilities.add('shell');
    capabilities.add('network');
  }
  if (/\b(playwright|puppeteer|browser|chrome|selenium|cdp)\b/i.test(content)) {
    capabilities.add('browser');
  }
  if (/\b(git|github|pull request|commit|branch|checkout|merge|rebase)\b/i.test(content)) {
    capabilities.add('git');
  }
  if (/\b(write|edit|modify|delete|rename|move|create).*(file|folder|directory|path)\b/i.test(content)) {
    capabilities.add('filesystem');
  }

  try {
    const files = await readdir(skillDir);
    if (files.some((file) => /^(index|install|setup|run)\.(sh|bash|zsh|command)$/i.test(file))) {
      findings.push({ severity: 'warning', message: 'Executable shell scripts are present.' });
      capabilities.add('shell');
    }
    if (files.includes('package.json')) {
      const pkgRaw = await readFile(join(skillDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        findings.push({ severity: 'warning', message: 'package.json scripts are present.' });
        capabilities.add('package-scripts');
      }
    }
  } catch {
    // Best-effort local audit only.
  }

  const auditStatus = findings.some((finding) => finding.severity === 'blocked')
    ? 'blocked'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'warning'
      : 'clean';

  return {
    name: skillDir.split('/').pop() || skillDir,
    auditStatus,
    capabilities: [...capabilities].sort(),
    findings,
  };
}
