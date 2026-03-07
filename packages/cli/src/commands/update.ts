import { getClient } from '../api/client.js';
import { installCommand } from './install.js';

function parseSkillRef(skill: string): { namespace: string; name: string } {
  const parts = skill.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid skill reference. Use format: namespace/name');
  }
  return { namespace: parts[0], name: parts[1] };
}

export async function updateCommand(skill: string): Promise<void> {
  if (!skill) {
    console.error('Usage: skilo update <namespace/name>');
    process.exit(1);
  }

  try {
    const { namespace, name } = parseSkillRef(skill);
    const client = await getClient();

    // Get latest metadata
    const metadata = await client.getSkillMetadata(namespace, name);

    console.log(`Updating ${namespace}/${name} to ${metadata.version}...`);

    // Install latest version
    await installCommand(`${namespace}/${name}`, { global: false });

    console.log(`✓ Updated ${namespace}/${name} to ${metadata.version}`);
  } catch (e) {
    console.error(`Update failed: ${(e as Error).message}`);
    process.exit(1);
  }
}