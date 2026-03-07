import { getClient } from '../api/client.js';

function parseSkillRef(skill: string): { namespace: string; name: string } {
  const parts = skill.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid skill reference. Use format: namespace/name');
  }
  return { namespace: parts[0], name: parts[1] };
}

export async function infoCommand(skill: string): Promise<void> {
  if (!skill) {
    console.error('Usage: skilo info <namespace/name>');
    process.exit(1);
  }

  try {
    const { namespace, name } = parseSkillRef(skill);
    const client = await getClient();
    const metadata = await client.getSkillMetadata(namespace, name);

    console.log(`${metadata.namespace}/${metadata.name}`);
    console.log(`  Description: ${metadata.description}`);
    console.log(`  Version: ${metadata.version}`);
    console.log(`  Size: ${formatBytes(metadata.size)}`);
    console.log(`  Checksum: ${metadata.checksum.slice(0, 16)}...`);
    if (metadata.author) console.log(`  Author: ${metadata.author}`);
    if (metadata.homepage) console.log(`  Homepage: ${metadata.homepage}`);
    if (metadata.repository) console.log(`  Repository: ${metadata.repository}`);
    if (metadata.keywords?.length) console.log(`  Keywords: ${metadata.keywords.join(', ')}`);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}