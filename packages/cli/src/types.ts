// Shared types for skilo (copied to CLI for local development)

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  api?: string;
  runtime?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  namespace: string;
  version: string;
  author?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  tarballUrl: string;
  size: number;
  checksum: string;
  listed: boolean;
  verified?: boolean;
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
  updatedAt?: number;
}

export interface SkillSearchResult {
  name: string;
  namespace: string;
  description: string;
  version: string;
}

export interface SkillVersion {
  version: string;
  tarballUrl: string;
  size: number;
  checksum: string;
  createdAt: number;
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

export interface PublishSkillRequest {
  name: string;
  namespace: string;
  description?: string;
  version: string;
  tarball: ArrayBuffer;
}

export interface PublishSkillResponse {
  id: string;
  name: string;
  namespace: string;
  version: string;
  tarballUrl: string;
}

export interface AuthToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  scope?: string;
}

export interface ApiKey {
  id: string;
  key: string;
  permissions: 'read' | 'write' | 'admin';
  createdAt: number;
}

export interface CliLoginResponse {
  created: boolean;
  user: User;
  apiKey: ApiKey;
}

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: number;
}

export interface UserSkill {
  name: string;
  namespace: string;
  description: string;
  version: string;
  privacy: 'public' | 'unlisted' | 'org_private';
  listed: boolean;
  created_at: number;
  updated_at: number;
}

export interface Config {
  baseUrl: string;
  token?: string;
  apiKey?: string;
}
