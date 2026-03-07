// Shared types for skilo

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  // Vercel compatibility
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
  createdAt: number;
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
  key: string; // Only returned on creation
  permissions: 'read' | 'write' | 'admin';
  createdAt: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: number;
}

export interface ApiError {
  error: string;
  message: string;
  status: number;
}

export type Permission = 'read' | 'write' | 'admin';

export function isApiError(obj: unknown): obj is ApiError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error' in obj &&
    'message' in obj
  );
}