// API client for skilo CLI
import fetchRetry from 'fetch-retry';
import type {
  SkillSearchResult,
  SkillMetadata,
  SkillVersion,
  AuthToken,
  ApiKey,
  User,
  Config,
} from '../types.js';

const DEFAULT_API_URL = 'https://api.skilo.dev';

export interface ClientConfig {
  baseUrl: string;
  token?: string;
}

const fetchWithRetry = fetchRetry(fetch, {
  retries: 3,
  retryDelay: (attempt) => Math.pow(2, attempt) * 1000,
});

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_API_URL;
    this.token = config.token;
  }

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'User-Agent': 'skilo-cli/1.0.0',
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

    return res.json();
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

    return res.json();
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
    isListed: boolean = false
  ): Promise<{ id: string }> {
    const url = `${this.baseUrl}/v1/skills`;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('namespace', namespace);
    formData.append('description', description);
    formData.append('version', version);
    formData.append('listed', isListed.toString());
    formData.append('tarball', new Blob([tarball]));

    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'skilo-cli/1.0.0',
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

  async getCurrentUser(): Promise<User> {
    const url = `${this.baseUrl}/v1/user`;
    const res = await fetchWithRetry(url, { headers: this.getHeaders() });

    if (!res.ok) {
      throw new Error(`Get user failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
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
    return JSON.parse(content);
  } catch {
    return { baseUrl: DEFAULT_API_URL };
  }
}

export async function saveConfig(config: Config): Promise<void> {
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