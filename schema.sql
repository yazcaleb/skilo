-- Skillpack Database Schema for Cloudflare D1

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Skills table
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  description TEXT,
  latest_version TEXT DEFAULT '0.0.0',
  listed INTEGER DEFAULT 0,  -- 0=unlisted, 1=public
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(namespace, name)
);

-- Versions table
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  tarball_url TEXT NOT NULL,
  size INTEGER,
  checksumsha256 TEXT,
  metadata_json TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(skill_id, version)
);

-- API Keys table
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  permissions TEXT DEFAULT 'read',
  created_at INTEGER DEFAULT (unixepoch())
);

-- OAuth Clients table
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER DEFAULT (unixepoch())
);

-- OAuth Tokens table (for token refresh)
CREATE TABLE oauth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER NOT NULL,
  scope TEXT DEFAULT 'read',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX idx_skills_namespace ON skills(namespace);
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skill_versions_skill_id ON skill_versions(skill_id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_oauth_tokens_access_token ON oauth_tokens(access_token);

-- Full-text search virtual table
CREATE VIRTUAL TABLE skills_fts USING fts5(
  name,
  description,
  namespace,
  content='skills',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER skills_fts_insert AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, name, description, namespace)
  VALUES (NEW.rowid, NEW.name, NEW.description, NEW.namespace);
END;

CREATE TRIGGER skills_fts_delete AFTER DELETE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, namespace)
  VALUES ('delete', OLD.rowid, OLD.name, OLD.description, OLD.namespace);
END;

CREATE TRIGGER skills_fts_update AFTER UPDATE ON skills BEGIN
  INSERT INTO skills_fts(skills_fts, rowid, name, description, namespace)
  VALUES ('delete', OLD.rowid, OLD.name, OLD.description, OLD.namespace);
  INSERT INTO skills_fts(rowid, name, description, namespace)
  VALUES (NEW.rowid, NEW.name, NEW.description, NEW.namespace);
END;