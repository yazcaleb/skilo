import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillMetadata } from '../types.js';
import { findSkillFile } from './skill-file.js';
import { blankLine, printKeyValue, printNote, printSection } from './output.js';

type TrustInfo = NonNullable<SkillMetadata['trust']>;
type LocalTextEntry = { name: string; content: string };

const MAX_AUDIT_FILE_BYTES = 256 * 1024;
const NETWORK_WRITE_PATTERN = /\b(fetch\s*\(|axios\.(?:post|put|patch|request)\s*\(|new\s+XMLHttpRequest|sendBeacon\s*\(|curl\s+https?:\/\/|wget\s+https?:\/\/|invoke-webrequest\b|webhook\b)/i;
const ENV_ACCESS_PATTERN = /\b(process\.env\b|Deno\.env\b|os\.environ\b|getenv\s*\(|dotenv\.config\s*\(|load_dotenv\b)\b/i;
const SENSITIVE_READ_PATTERN = /\b(?:readFileSync|readFile|createReadStream|openSync|cat|type|Get-Content|fs\.(?:readFile|readFileSync|createReadStream))\b[\s\S]{0,160}(\/etc\/passwd|\/proc\/self\/environ|\/var\/run\/secrets\b|\.npmrc\b|\.netrc\b|docker\/config\.json\b|aws\/credentials\b|\.ssh\/|id_rsa(?:\.pub)?\b|\.env(?:\.[A-Za-z0-9._-]+)?\b)/i;
const DIRECT_ENV_PAYLOAD_PATTERN = /\b(?:body|data|payload)\s*:\s*JSON\.stringify\(\s*(?:process\.env|Deno\.env(?:\.toObject\(\))?)\s*\)/i;
const MALICIOUS_INTENT_PATTERN = /\b(steal|exfiltrat|harvest|leak|dump)\b[\s\S]{0,120}\b(api key|token|secret|credential|password|cookies?|session|environment|keys?)\b/i;

function addFinding(
  findings: Array<{ severity: 'warning' | 'blocked'; message: string }>,
  finding: { severity: 'warning' | 'blocked'; message: string }
): void {
  if (findings.some((existing) => existing.severity === finding.severity && existing.message === finding.message)) {
    return;
  }
  findings.push(finding);
}

async function collectLocalEntries(skillDir: string, currentDir: string = skillDir): Promise<LocalTextEntry[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const collected: LocalTextEntry[] = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.turbo') {
      continue;
    }

    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectLocalEntries(skillDir, absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      const fileStat = await stat(absolutePath);
      if (fileStat.size > MAX_AUDIT_FILE_BYTES) {
        continue;
      }

      const content = await readFile(absolutePath, 'utf-8');
      collected.push({
        name: absolutePath.slice(skillDir.length + 1),
        content,
      });
    } catch {
      // Best-effort local audit only; skip unreadable or binary files.
    }
  }

  return collected;
}

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

  const entries = await collectLocalEntries(skillDir);
  const content = await readFile(join(skillDir, skillFile), 'utf-8');
  const analysisText = entries.length > 0
    ? entries.map((entry) => `# ${entry.name}\n${entry.content}`).join('\n\n')
    : content;
  const findings: Array<{ severity: 'warning' | 'blocked'; message: string }> = [];
  const capabilities = new Set<string>();

  if (/\b(sk_[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z\-_]{20,}|api[_ -]?key|access[_ -]?token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_\-\/=]{12,}/i.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Possible hardcoded secret or credential found.' });
    capabilities.add('secrets');
  }
  if (/\b(ignore (all|any|previous) instructions|reveal (the )?(system|hidden) prompt|dump (the )?(prompt|memory)|exfiltrat)\b/i.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Prompt exfiltration or instruction override language detected.' });
  }
  if (/(<script\b|onerror=|onload=|javascript:)/i.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Raw scriptable HTML or JavaScript detected.' });
  }
  if (MALICIOUS_INTENT_PATTERN.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Malicious exfiltration intent was detected in the skill instructions or code.' });
  }
  if (/\b(curl\s+https?:\/\/|wget\s+https?:\/\/|bash\s+-c|powershell\s+-enc|invoke-webrequest)\b/i.test(analysisText)) {
    addFinding(findings, { severity: 'warning', message: 'Remote download or execution instructions detected.' });
    capabilities.add('shell');
    capabilities.add('network');
  }
  if (ENV_ACCESS_PATTERN.test(analysisText)) {
    addFinding(findings, { severity: 'warning', message: 'Environment variable or secret-store access is referenced in the bundle.' });
    capabilities.add('secrets');
  }
  if (SENSITIVE_READ_PATTERN.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Sensitive local files such as .env, SSH keys, or system credential paths are being read.' });
    capabilities.add('filesystem');
    capabilities.add('secrets');
  }

  const envAliases = [...analysisText.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\b/g)].map((match) => match[1]);
  const sensitiveFileAliases = [...analysisText.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*(?:readFileSync|readFile|createReadStream)[^;\n]*(\/etc\/passwd|\/proc\/self\/environ|\/var\/run\/secrets\b|\.npmrc\b|\.netrc\b|docker\/config\.json\b|aws\/credentials\b|\.ssh\/|id_rsa(?:\.pub)?\b|\.env(?:\.[A-Za-z0-9._-]+)?\b)/gi
  )].map((match) => match[1]);

  if (NETWORK_WRITE_PATTERN.test(analysisText) && DIRECT_ENV_PAYLOAD_PATTERN.test(analysisText)) {
    addFinding(findings, { severity: 'blocked', message: 'Environment variables are being serialized into an outbound network request.' });
    capabilities.add('network');
    capabilities.add('secrets');
  }

  for (const alias of envAliases) {
    const aliasPayloadPattern = new RegExp(
      `\\b(?:body|data|payload)\\s*:\\s*(?:JSON\\.stringify\\(\\s*)?${alias}\\b|\\bJSON\\.stringify\\(\\s*${alias}\\s*\\)`,
      'i'
    );
    if (NETWORK_WRITE_PATTERN.test(analysisText) && aliasPayloadPattern.test(analysisText)) {
      addFinding(findings, { severity: 'blocked', message: 'Environment-derived data is being sent in an outbound network request.' });
      capabilities.add('network');
      capabilities.add('secrets');
    }
  }

  for (const alias of sensitiveFileAliases) {
    const aliasPayloadPattern = new RegExp(
      `\\b(?:body|data|payload)\\s*:\\s*(?:JSON\\.stringify\\(\\s*)?${alias}\\b|\\bJSON\\.stringify\\(\\s*${alias}\\s*\\)`,
      'i'
    );
    if (NETWORK_WRITE_PATTERN.test(analysisText) && aliasPayloadPattern.test(analysisText)) {
      addFinding(findings, { severity: 'blocked', message: 'Sensitive local file contents are being prepared for outbound transmission.' });
      capabilities.add('network');
      capabilities.add('filesystem');
      capabilities.add('secrets');
    }
  }

  if (/\b(playwright|puppeteer|browser|chrome|selenium|cdp)\b/i.test(analysisText)) {
    capabilities.add('browser');
  }
  if (/\b(git|github|pull request|commit|branch|checkout|merge|rebase)\b/i.test(analysisText)) {
    capabilities.add('git');
  }
  if (
    /\b(write|edit|modify|delete|rename|move|create).*(file|folder|directory|path)\b/i.test(analysisText)
    || /\b(readFile|readFileSync|createReadStream|openSync|fs\.)\b/i.test(analysisText)
  ) {
    capabilities.add('filesystem');
  }
  if (/\b(fetch|http|https|api|request|webhook|download|upload|axios|sendbeacon|xmlhttprequest)\b/i.test(analysisText)) {
    capabilities.add('network');
  }
  if (/\b(curl|wget|bash|sh |zsh |powershell|invoke-webrequest|npm |pnpm |yarn |bun )/i.test(analysisText)) {
    capabilities.add('shell');
  }

  try {
    if (entries.some((entry) => /(^|\/)(index|install|setup|run)\.(sh|bash|zsh|command)$/i.test(entry.name))) {
      addFinding(findings, { severity: 'warning', message: 'Executable shell scripts are present.' });
      capabilities.add('shell');
    }
    const packageJsonEntry = entries.find((entry) => /(^|\/)package\.json$/i.test(entry.name));
    if (packageJsonEntry) {
      const pkgRaw = packageJsonEntry.content;
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        addFinding(findings, { severity: 'warning', message: 'package.json scripts are present.' });
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
