// API client for skilo site
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = viteEnv?.VITE_API_BASE || 'https://api.skilo.dev';

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
  createdAt: number;
  updatedAt: number;
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
}

export interface PackData {
  name: string;
  token: string;
  skills: PackSkill[];
}

export const api = {
  async getSkill(namespace: string, name: string): Promise<SkillMetadata> {
    const res = await fetch(`${API_BASE}/v1/skills/${namespace}/${name}`);
    if (!res.ok) throw new Error('Skill not found');
    return res.json();
  },

  async resolveShare(token: string): Promise<{ skill: SkillMetadata; requiresPassword: boolean }> {
    const res = await fetch(`${API_BASE}/v1/skills/share/${token}`);
    if (!res.ok) throw new Error('Invalid or expired share link');
    return res.json();
  },

  async resolvePack(token: string): Promise<PackData> {
    const res = await fetch(`${API_BASE}/v1/packs/${token}`);
    if (!res.ok) throw new Error('Pack not found');
    return res.json();
  },

  async verifySharePassword(token: string, password: string): Promise<SkillMetadata> {
    const res = await fetch(`${API_BASE}/v1/skills/share/${token}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error('Invalid password');
    const data = await res.json() as { skill: SkillMetadata };
    return data.skill;
  },
};
