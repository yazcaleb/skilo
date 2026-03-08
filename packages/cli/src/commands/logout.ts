import { loadConfig, saveConfig } from '../api/client.js';
import { isJsonOutput, logSuccess, printJson } from '../utils/output.js';

export async function logoutCommand(): Promise<void> {
  const config = await loadConfig();
  await saveConfig({
    baseUrl: config.baseUrl,
  });

  if (isJsonOutput()) {
    printJson({
      command: 'logout',
      ok: true,
    });
    return;
  }

  logSuccess('Logged out');
}
