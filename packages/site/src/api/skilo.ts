// API client for skilo site
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = viteEnv?.VITE_API_BASE || 'https://skilo-api.yaz-b35.workers.dev';

export interface SkillMetadata {
  name: string;
  namespace: string;
  description: string;
  version: string;
  author: string | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[];
  tarballUrl: string;
  size: number;
  checksum: string;
  listed: boolean;
  verified: boolean;
  trust?: {
    publisherStatus: 'anonymous' | 'claimed' | 'verified';
    verified: boolean;
    hasSignature: boolean;
    visibility: 'public' | 'unlisted';
    auditStatus: 'clean' | 'warning' | 'blocked';
    capabilities: string[];
    riskSummary: string[];
    findings: Array<{
      code: string;
      severity: 'info' | 'warning' | 'blocked';
      message: string;
    }>;
    sourceType: 'registry' | 'share' | 'local' | 'github' | 'pack' | 'derived_pack';
    integrity: {
      checksum: string;
      hasSignature: boolean;
      signatureVerified: boolean;
    };
  };
  createdAt: number;
  updatedAt: number;
}

export interface ShareLinkInfo {
  token: string;
  expiresAt?: number | null;
  oneTime: boolean;
  maxUses?: number | null;
  usesCount: number;
  passwordProtected: boolean;
}

export interface ShareLink {
  token: string;
  url: string;
  expiresAt?: number;
  oneTime: boolean;
  maxUses?: number;
  usesCount: number;
}

export interface PackSkill {
  namespace: string;
  name: string;
  description: string;
  version: string;
  shareToken: string;
  url: string;
  verified?: boolean;
  visibility?: 'public' | 'unlisted';
  trust?: SkillMetadata['trust'];
}

export interface PackData {
  name: string;
  token: string;
  skills: PackSkill[];
  trust?: SkillMetadata['trust'] & {
    memberCounts?: {
      clean: number;
      warning: number;
      blocked: number;
      verified: number;
    };
    highestRisk?: 'clean' | 'warning' | 'blocked';
    derived?: boolean;
    sourcePackToken?: string | null;
  };
}

export interface SiteStats {
  skills: number;
  installs: number;
}

export const api = {
  async getStats(): Promise<SiteStats> {
    const res = await fetch(`${API_BASE}/v1/stats`);
    if (!res.ok) return { skills: 0, installs: 0 };
    return res.json();
  },

  async getSkill(namespace: string, name: string): Promise<SkillMetadata> {
    const res = await fetch(`${API_BASE}/v1/skills/${namespace}/${name}`);
    if (!res.ok) throw new Error('Skill not found');
    return res.json();
  },

  async resolveShare(token: string): Promise<{ skill: SkillMetadata; link?: ShareLinkInfo; trust?: SkillMetadata['trust']; requiresPassword: boolean }> {
    const res = await fetch(`${API_BASE}/v1/skills/share/${token}`);
    if (!res.ok) throw new Error('Invalid or expired share link');
    return res.json();
  },

  async resolvePack(token: string): Promise<PackData> {
    const res = await fetch(`${API_BASE}/v1/packs/${token}`);
    if (!res.ok) throw new Error('Pack not found');
    return res.json();
  },

  async subsetPack(source: string, keep: string[]): Promise<{ token: string; url: string; count: number }> {
    const res = await fetch(`${API_BASE}/v1/packs/subset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, keep }),
    });
    if (!res.ok) throw new Error('Failed to create pack subset');
    return res.json();
  },

  async fetchSkillContent(tarballUrl: string): Promise<string> {
    const url = tarballUrl.startsWith('http') ? tarballUrl : `${API_BASE}${tarballUrl}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch skill content');

    const decompressed = res.body!.pipeThrough(new DecompressionStream('gzip'));
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Parse tar: find SKILL.md or skill.md
    let pos = 0;
    const decoder = new TextDecoder();
    while (pos + 512 <= buffer.length) {
      const header = buffer.slice(pos, pos + 512);
      if (header.every((b) => b === 0)) break;

      const fileName = decoder.decode(header.slice(0, 100)).replace(/\0.*$/, '').trim();
      const sizeStr = decoder.decode(header.slice(124, 136)).replace(/\0.*$/, '').trim();
      const fileSize = parseInt(sizeStr, 8) || 0;

      pos += 512;
      if (/^(skill\.md|SKILL\.md)$/i.test(fileName.split('/').pop() || '')) {
        return decoder.decode(buffer.slice(pos, pos + fileSize));
      }
      pos += Math.ceil(fileSize / 512) * 512;
    }

    throw new Error('SKILL.md not found in tarball');
  },

  async verifySharePassword(token: string, password: string): Promise<{ skill: SkillMetadata; link?: ShareLinkInfo; trust?: SkillMetadata['trust'] }> {
    const res = await fetch(`${API_BASE}/v1/skills/share/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error('Invalid password');
    return res.json();
  },
};
