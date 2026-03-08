export type AuditSeverity = 'info' | 'warning' | 'blocked';
export type AuditStatus = 'clean' | 'warning' | 'blocked';
export type PublisherStatus = 'anonymous' | 'claimed' | 'verified';
export type SourceType = 'registry' | 'share' | 'local' | 'github' | 'pack' | 'derived_pack';

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  message: string;
}

export interface AuditResult {
  status: AuditStatus;
  findings: AuditFinding[];
  capabilities: string[];
  riskSummary: string[];
}

export interface VersionMetadata {
  author: string | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[];
  audit: AuditResult;
  publisherStatus: PublisherStatus;
  sourceType: SourceType;
  scannedAt: number | null;
}

export interface TrustInfo {
  publisherStatus: PublisherStatus;
  verified: boolean;
  hasSignature: boolean;
  visibility: 'public' | 'unlisted';
  auditStatus: AuditStatus;
  capabilities: string[];
  riskSummary: string[];
  findings: AuditFinding[];
  sourceType: SourceType;
  integrity: {
    checksum: string;
    hasSignature: boolean;
    signatureVerified: boolean;
  };
}

interface ParsedTarEntry {
  name: string;
  content: string;
}

interface ParsedBundle {
  entries: ParsedTarEntry[];
  skillFile: ParsedTarEntry | null;
  packageJson: ParsedTarEntry | null;
}

function parseFrontMatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const data: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) {
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data, body: match[2] };
}

function parseSkillManifest(content: string): {
  author: string | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[];
} {
  const { data } = parseFrontMatter(content);
  return {
    author: typeof data.author === 'string' ? data.author : null,
    homepage: typeof data.homepage === 'string' ? data.homepage : null,
    repository: typeof data.repository === 'string' ? data.repository : null,
    keywords: Array.isArray(data.keywords)
      ? data.keywords.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

function collectCapabilities(skillContent: string, bundleEntries: ParsedTarEntry[], packageJsonContent: string | null): string[] {
  const capabilities = new Set<string>();
  const lower = skillContent.toLowerCase();

  if (/\b(curl|wget|bash|sh |zsh |powershell|invoke-webrequest|npm |pnpm |yarn )/i.test(skillContent)) {
    capabilities.add('shell');
  }
  if (/\b(fetch|http|https|api|request|webhook|download|upload)\b/i.test(skillContent)) {
    capabilities.add('network');
  }
  if (/\b(write|edit|modify|delete|rename|move|create).*(file|folder|directory|path)\b/i.test(skillContent)) {
    capabilities.add('filesystem');
  }
  if (/\b(git|github|pull request|commit|branch|checkout|rebase|merge)\b/i.test(skillContent)) {
    capabilities.add('git');
  }
  if (/\b(playwright|puppeteer|browser|chrome|selenium|cdp)\b/i.test(skillContent)) {
    capabilities.add('browser');
  }
  if (/\b(api key|token|password|secret|credential)\b/i.test(lower)) {
    capabilities.add('secrets');
  }
  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        capabilities.add('package-scripts');
      }
    } catch {
      // Ignore malformed package.json for capability inference.
    }
  }
  if (bundleEntries.some((entry) => /(^|\/)(index|install|setup|run)\.(sh|bash|zsh|command)$/i.test(entry.name))) {
    capabilities.add('shell');
  }

  return [...capabilities].sort();
}

function buildAudit(skillContent: string, bundleEntries: ParsedTarEntry[], packageJsonContent: string | null): AuditResult {
  const findings: AuditFinding[] = [];
  const links = [...skillContent.matchAll(/\bhttps?:\/\/[^\s)>\]]+/gi)].map((match) => match[0]);

  const blockedRules: Array<{ code: string; regex: RegExp; message: string }> = [
    {
      code: 'hardcoded-secret',
      regex: /\b(sk_[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z\-_]{20,}|api[_ -]?key|access[_ -]?token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_\-\/=]{12,}/i,
      message: 'Possible hardcoded secret or credential found in SKILL.md.',
    },
    {
      code: 'prompt-exfiltration',
      regex: /\b(ignore (all|any|previous) instructions|reveal (the )?(system|hidden) prompt|dump (the )?(prompt|memory)|exfiltrat)\b/i,
      message: 'Prompt exfiltration or instruction override language detected.',
    },
    {
      code: 'scriptable-html',
      regex: /(<script\b|onerror=|onload=|javascript:)/i,
      message: 'Raw scriptable HTML or JavaScript content detected.',
    },
  ];

  const warningRules: Array<{ code: string; regex: RegExp; message: string }> = [
    {
      code: 'remote-execution',
      regex: /\b(curl\s+https?:\/\/|wget\s+https?:\/\/|bash\s+-c|powershell\s+-enc|invoke-webrequest)\b/i,
      message: 'Remote download or execution instructions detected.',
    },
    {
      code: 'outbound-linking',
      regex: /\b(send|post|upload|exfiltrate).*(https?:\/\/)/i,
      message: 'Outbound network or data transfer instruction detected.',
    },
  ];

  for (const rule of blockedRules) {
    if (rule.regex.test(skillContent)) {
      findings.push({ code: rule.code, severity: 'blocked', message: rule.message });
    }
  }

  for (const rule of warningRules) {
    if (rule.regex.test(skillContent)) {
      findings.push({ code: rule.code, severity: 'warning', message: rule.message });
    }
  }

  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };
      if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
        findings.push({
          code: 'package-scripts',
          severity: 'warning',
          message: 'package.json scripts are present in the bundle.',
        });
      }
    } catch {
      findings.push({
        code: 'package-json-invalid',
        severity: 'warning',
        message: 'package.json is present but could not be parsed.',
      });
    }
  }

  if (bundleEntries.some((entry) => /(^|\/)(index|install|setup|run)\.(sh|bash|zsh|command)$/i.test(entry.name))) {
    findings.push({
      code: 'executable-script',
      severity: 'warning',
      message: 'Executable shell scripts are included in the bundle.',
    });
  }

  for (const link of links) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol)) {
        findings.push({
          code: 'unsupported-link-scheme',
          severity: 'warning',
          message: `Unsupported link scheme detected: ${url.protocol}`,
        });
      }
    } catch {
      findings.push({
        code: 'invalid-link',
        severity: 'warning',
        message: `Malformed link detected: ${link}`,
      });
    }
  }

  const status: AuditStatus = findings.some((finding) => finding.severity === 'blocked')
    ? 'blocked'
    : findings.some((finding) => finding.severity === 'warning')
      ? 'warning'
      : 'clean';

  return {
    status,
    findings,
    capabilities: collectCapabilities(skillContent, bundleEntries, packageJsonContent),
    riskSummary: findings
      .filter((finding) => finding.severity !== 'info')
      .slice(0, 3)
      .map((finding) => finding.message),
  };
}

function textFromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

async function gunzip(buffer: Uint8Array): Promise<Uint8Array> {
  const decompressed = new Response(
    new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  );
  return new Uint8Array(await decompressed.arrayBuffer());
}

async function parseTarGzip(buffer: Uint8Array): Promise<ParsedBundle> {
  const tarData = await gunzip(buffer);
  const entries: ParsedTarEntry[] = [];

  let pos = 0;
  while (pos + 512 <= tarData.length) {
    const header = tarData.slice(pos, pos + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const rawName = textFromBytes(header.slice(0, 100)).replace(/\0.*$/, '').trim();
    const rawSize = textFromBytes(header.slice(124, 136)).replace(/\0.*$/, '').trim();
    const size = parseInt(rawSize, 8) || 0;
    pos += 512;

    const fileBytes = tarData.slice(pos, pos + size);
    const content = textFromBytes(fileBytes);
    if (rawName) {
      entries.push({ name: rawName, content });
    }
    pos += Math.ceil(size / 512) * 512;
  }

  const skillFile = entries.find((entry) => /(^|\/)(SKILL|skill)\.md$/i.test(entry.name)) || null;
  const packageJson = entries.find((entry) => /(^|\/)package\.json$/i.test(entry.name)) || null;

  return { entries, skillFile, packageJson };
}

export async function analyzeSkillTarball(
  buffer: Uint8Array,
  publisherStatus: PublisherStatus,
  sourceType: SourceType = 'registry'
): Promise<VersionMetadata> {
  const parsed = await parseTarGzip(buffer);
  const skillContent = parsed.skillFile?.content || '';
  const metadata = parsed.skillFile ? parseSkillManifest(parsed.skillFile.content) : {
    author: null,
    homepage: null,
    repository: null,
    keywords: [],
  };

  return {
    ...metadata,
    audit: buildAudit(skillContent, parsed.entries, parsed.packageJson?.content || null),
    publisherStatus,
    sourceType,
    scannedAt: Date.now(),
  };
}

export function parseVersionMetadata(raw: unknown): VersionMetadata {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return {
      author: null,
      homepage: null,
      repository: null,
      keywords: [],
      audit: { status: 'clean', findings: [], capabilities: [], riskSummary: [] },
      publisherStatus: 'anonymous',
      sourceType: 'registry',
      scannedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const auditRecord = typeof parsed.audit === 'object' && parsed.audit !== null
      ? parsed.audit as Record<string, unknown>
      : {};
    const findings = Array.isArray(auditRecord.findings)
      ? auditRecord.findings.flatMap((value) => {
          if (!value || typeof value !== 'object') {
            return [];
          }
          const finding = value as Record<string, unknown>;
          const severity = finding.severity;
          if (severity !== 'info' && severity !== 'warning' && severity !== 'blocked') {
            return [];
          }
          return [{
            code: typeof finding.code === 'string' ? finding.code : 'unknown',
            severity,
            message: typeof finding.message === 'string' ? finding.message : 'Unknown finding',
          } satisfies AuditFinding];
        })
      : [];

    return {
      author: typeof parsed.author === 'string' ? parsed.author : null,
      homepage: typeof parsed.homepage === 'string' ? parsed.homepage : null,
      repository: typeof parsed.repository === 'string' ? parsed.repository : null,
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((value): value is string => typeof value === 'string')
        : [],
      audit: {
        status: auditRecord.status === 'blocked' || auditRecord.status === 'warning' ? auditRecord.status : 'clean',
        findings,
        capabilities: Array.isArray(auditRecord.capabilities)
          ? auditRecord.capabilities.filter((value): value is string => typeof value === 'string')
          : [],
        riskSummary: Array.isArray(auditRecord.riskSummary)
          ? auditRecord.riskSummary.filter((value): value is string => typeof value === 'string')
          : findings.slice(0, 3).map((finding) => finding.message),
      },
      publisherStatus: parsed.publisherStatus === 'verified' || parsed.publisherStatus === 'claimed'
        ? parsed.publisherStatus
        : 'anonymous',
      sourceType: parsed.sourceType === 'share'
        || parsed.sourceType === 'local'
        || parsed.sourceType === 'github'
        || parsed.sourceType === 'pack'
        || parsed.sourceType === 'derived_pack'
        ? parsed.sourceType
        : 'registry',
      scannedAt: typeof parsed.scannedAt === 'number' ? parsed.scannedAt : null,
    };
  } catch {
    return {
      author: null,
      homepage: null,
      repository: null,
      keywords: [],
      audit: { status: 'clean', findings: [], capabilities: [], riskSummary: [] },
      publisherStatus: 'anonymous',
      sourceType: 'registry',
      scannedAt: null,
    };
  }
}

export function buildTrustInfo(input: {
  signature: unknown;
  privacy: unknown;
  checksum?: unknown;
  metadataJson?: unknown;
  sourceType?: SourceType;
}): TrustInfo {
  const metadata = parseVersionMetadata(input.metadataJson);
  const hasSignature = typeof input.signature === 'string' && input.signature.length > 0;
  const publisherStatus = metadata.publisherStatus === 'verified' && !hasSignature
    ? 'claimed'
    : metadata.publisherStatus;
  const verified = publisherStatus === 'verified' && hasSignature;

  return {
    publisherStatus,
    verified,
    hasSignature,
    visibility: input.privacy === 'public' ? 'public' : 'unlisted',
    auditStatus: metadata.audit.status,
    capabilities: metadata.audit.capabilities,
    riskSummary: metadata.audit.riskSummary,
    findings: metadata.audit.findings,
    sourceType: input.sourceType || metadata.sourceType,
    integrity: {
      checksum: typeof input.checksum === 'string' ? input.checksum : '',
      hasSignature,
      signatureVerified: verified,
    },
  };
}

export function aggregatePackTrust(trustItems: TrustInfo[], sourcePackToken?: string) {
  const memberCounts = {
    clean: trustItems.filter((trust) => trust.auditStatus === 'clean').length,
    warning: trustItems.filter((trust) => trust.auditStatus === 'warning').length,
    blocked: trustItems.filter((trust) => trust.auditStatus === 'blocked').length,
    verified: trustItems.filter((trust) => trust.verified).length,
  };
  const highestRisk = memberCounts.blocked > 0 ? 'blocked' : memberCounts.warning > 0 ? 'warning' : 'clean';
  const capabilitySet = new Set<string>();
  const riskSummary = new Set<string>();

  for (const trust of trustItems) {
    for (const capability of trust.capabilities) {
      capabilitySet.add(capability);
    }
    for (const summary of trust.riskSummary) {
      riskSummary.add(summary);
    }
  }

  return {
    publisherStatus: trustItems.every((trust) => trust.publisherStatus === 'verified')
      ? 'verified'
      : trustItems.some((trust) => trust.publisherStatus === 'claimed' || trust.publisherStatus === 'verified')
        ? 'claimed'
        : 'anonymous',
    verified: trustItems.length > 0 && trustItems.every((trust) => trust.verified),
    hasSignature: trustItems.some((trust) => trust.hasSignature),
    visibility: trustItems.every((trust) => trust.visibility === 'public') ? 'public' : 'unlisted',
    auditStatus: highestRisk,
    capabilities: [...capabilitySet].sort(),
    riskSummary: [...riskSummary].slice(0, 3),
    findings: trustItems.flatMap((trust) => trust.findings),
    sourceType: sourcePackToken ? 'derived_pack' : 'pack',
    integrity: {
      checksum: '',
      hasSignature: trustItems.some((trust) => trust.hasSignature),
      signatureVerified: trustItems.length > 0 && trustItems.every((trust) => trust.integrity.signatureVerified),
    },
    memberCounts,
    highestRisk,
    derived: Boolean(sourcePackToken),
    sourcePackToken: sourcePackToken || null,
  };
}
