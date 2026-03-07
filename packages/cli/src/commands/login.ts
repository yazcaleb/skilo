import { getClient, saveConfig, loadConfig } from '../api/client.js';

export async function loginCommand(): Promise<void> {
  const clientId = process.env.SKILLPACK_CLIENT_ID;
  const clientSecret = process.env.SKILLPACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('To login, set environment variables:');
    console.log('  SKILLPACK_CLIENT_ID=your-client-id');
    console.log('  SKILLPACK_CLIENT_SECRET=your-client-secret');
    console.log('');
    console.log('Or create an API key at https://skilo.dev/keys');
    process.exit(1);
  }

  try {
    const client = await getClient();
    const token = await client.getToken(clientId, clientSecret);

    const config = await loadConfig();
    config.token = token.accessToken;
    await saveConfig(config);

    console.log('✓ Logged in successfully');
  } catch (e) {
    console.error(`Login failed: ${(e as Error).message}`);
    process.exit(1);
  }
}