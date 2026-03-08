// API client for skilo CLI
import fetchRetry from 'fetch-retry';
import type {
  SkillSearchResult,
  SkillMetadata,
  SkillVersion,
  PackData,
  AuthToken,
  ApiKey,
  CliLoginResponse,
  User,
  UserSkill,
  Config,
} from '../types.js';

const DEFAULT_API_URL = 'https://skilo-api.yaz-b35.workers.dev';

function resolveBaseUrl(configBaseUrl?: string): string {
  return process.env.SKILO_API_BASE_URL || configBaseUrl || DEFAULT_API_URL;
}

export interface ClientConfig {
  baseUrl: string;
  token?: string;
}

const fetchWithRetry = fetchRetry(fetch, {
  retries: 3,
  retryDelay: (attempt) => Math.pow(2, attempt) * 1000,
});

export class ApiClient {
  baseUrl: string;
  private token?: string;

  constructor(config: ClientConfig) {
    this.baseUrl = resolveBaseUrl(config.baseUrl);
    this.token = config.token;
  }

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'skilo-cli/1.0.15',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async searchSkills(query: string): Promise<SkillSearchResult[]> {
    const url = `${this.baseUrl}/v1/skills?q=${encodeURIComponent(query)}`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Search failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as SkillSearchResult[] | { skills?: SkillSearchResult[] };
    return Array.isArray(data) ? data : data.skills || [];
  }

  async getSkillMetadata(namespace: string, name: string): Promise<SkillMetadata> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Get skill failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getSkillVersions(namespace: string, name: string): Promise<SkillVersion[]> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/versions`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Get versions failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as SkillVersion[] | { versions?: SkillVersion[] };
    return Array.isArray(data) ? data : data.versions || [];
  }

  async downloadTarball(
    namespace: string,
    name: string,
    version: string
  ): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/tarball/${version}`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    return res.arrayBuffer();
  }

  async publishSkill(
    name: string,
    namespace: string,
    description: string,
    version: string,
    tarball: ArrayBuffer,
    isListed: boolean = false,
    claimToken?: string,
    signature?: string,
    publicKey?: string
  ): Promise<{ id: string }> {
    const url = `${this.baseUrl}/v1/skills`;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('namespace', namespace);
    formData.append('description', description);
    formData.append('version', version);
    formData.append('listed', isListed.toString());
    if (claimToken) {
      formData.append('claim_token', claimToken);
    }
    if (signature) {
      formData.append('signature', signature);
    }
    if (publicKey) {
      formData.append('public_key', publicKey);
    }
    formData.append('tarball', new Blob([tarball]));

    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'skilo-cli/1.0.15',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Publish failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async createApiKey(permissions: string = 'read'): Promise<ApiKey> {
    const url = `${this.baseUrl}/v1/auth/keys`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ permissions }),
    });

    if (!res.ok) {
      throw new Error(`Create key failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async bootstrapCliLogin(username: string, email?: string): Promise<CliLoginResponse> {
    const url = `${this.baseUrl}/v1/auth/cli-login`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ username, email }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Login failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getCurrentUser(): Promise<User> {
    const url = `${this.baseUrl}/v1/user`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Get user failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getUserSkills(): Promise<UserSkill[]> {
    const url = `${this.baseUrl}/v1/user/skills`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Get skills failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as UserSkill[] | { skills?: UserSkill[] };
    return Array.isArray(data) ? data : data.skills || [];
  }

  async getToken(clientId: string, clientSecret: string): Promise<AuthToken> {
    const url = `${this.baseUrl}/v1/auth/token`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async deprecateSkill(namespace: string, name: string, message: string): Promise<void> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/deprecate`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      throw new Error(`Deprecate failed: ${res.status} ${res.statusText}`);
    }
  }

  async yankVersion(namespace: string, name: string, version: string, reason?: string): Promise<void> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/yank`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ version, reason }),
    });

    if (!res.ok) {
      throw new Error(`Yank failed: ${res.status} ${res.statusText}`);
    }
  }

  async createShareLink(
    namespace: string,
    name: string,
    oneTime: boolean,
    expiresAt?: number,
    maxUses?: number,
    password?: string
  ): Promise<{ token: string; url: string }> {
    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/share`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        one_time: oneTime,
        expires_at: expiresAt,
        max_uses: maxUses,
        password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Share failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async createPack(
    name: string,
    shareTokens: string[]
  ): Promise<{ token: string; url: string; count: number }> {
    const url = `${this.baseUrl}/v1/packs`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, share_tokens: shareTokens }),
    });

    if (!res.ok) {
      throw new Error(`Create pack failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async resolvePack(token: string): Promise<PackData> {
    const url = `${this.baseUrl}/v1/packs/${token}`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Resolve pack failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async claimSkill(fullName: string, token: string): Promise<void> {
    // Parse namespace/name from fullName
    const [namespace, name] = fullName.split('/');
    if (!namespace || !name) {
      throw new Error('Invalid skill reference. Use format: namespace/name');
    }

    const url = `${this.baseUrl}/v1/skills/${namespace}/${name}/claim`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Claim failed: ${res.status} ${res.statusText}`);
    }
  }
}

// Config file management
import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.skilo');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface CliConfig extends Config {
  namespace?: string;
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    await access(CONFIG_FILE, constants.F_OK);
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as CliConfig;
    return {
      ...parsed,
      baseUrl: resolveBaseUrl(parsed.baseUrl),
    };
  } catch {
    return { baseUrl: resolveBaseUrl() };
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function getClient(): Promise<ApiClient> {
  const config = await loadConfig();
  const client = new ApiClient({ baseUrl: config.baseUrl });
  if (config.token) {
    client.setToken(config.token);
  } else if (config.apiKey) {
    client.setToken(config.apiKey);
  }
  return client;
}
