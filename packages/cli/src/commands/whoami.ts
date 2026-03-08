import { getClient } from '../api/client.js';
import { exitWithError, isJsonOutput, printJson, printNote, printPrimary, printSection } from '../utils/output.js';

export async function whoamiCommand(): Promise<void> {
  try {
    const client = await getClient();
    const user = await client.getCurrentUser();

    if (isJsonOutput()) {
      printJson({
        command: 'whoami',
        user,
      });
      return;
    }

    printSection('Current user');
    printPrimary(user.username);
    printNote('email', user.email);
    printNote('id', user.id);
  } catch (e) {
    exitWithError(`${(e as Error).message}. Run "skilo login <username>" or "skilo login --token <api-key>".`);
  }
}
