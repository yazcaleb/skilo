import { getClient } from '../api/client.js';

export async function searchCommand(query: string): Promise<void> {
  if (!query) {
    console.error('Usage: skilo search <query>');
    process.exit(1);
  }

  try {
    const client = await getClient();
    const results = await client.searchSkills(query);

    if (results.length === 0) {
      console.log('No skills found');
      return;
    }

    console.log(`Found ${results.length} skill(s):\n`);
    for (const skill of results) {
      console.log(`${skill.namespace}/${skill.name}`);
      console.log(`  ${skill.description}`);
      console.log(`  version: ${skill.version}`);
      console.log('');
    }
  } catch (e) {
    console.error(`Search failed: ${(e as Error).message}`);
    process.exit(1);
  }
}