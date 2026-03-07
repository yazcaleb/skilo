import { getClient } from '../api/client.js';

export async function whoamiCommand(): Promise<void> {
  try {
    const client = await getClient();
    const user = await client.getCurrentUser();
    console.log(`Username: ${user.username}`);
    console.log(`Email: ${user.email}`);
    console.log(`ID: ${user.id}`);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    console.log('Run "skilo login" to authenticate');
    process.exit(1);
  }
}