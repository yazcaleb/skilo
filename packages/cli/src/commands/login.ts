import { createInterface } from 'node:readline';
import { getClient, loadConfig, saveConfig } from '../api/client.js';
import { exitWithError, isInteractiveOutput, isJsonOutput, logInfo, logSuccess, printJson, printNote, printUsage } from '../utils/output.js';

interface LoginOptions {
  token?: string;
  email?: string;
  force?: boolean;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function looksLikeApiKey(value: string): boolean {
  return value.startsWith('sk_');
}

async function saveAuthenticatedConfig(token: string, kind: 'apiKey' | 'token'): Promise<void> {
  const config = await loadConfig();
  const client = await getClient();
  client.setToken(token);

  const user = await client.getCurrentUser();
  await saveConfig({
    ...config,
    token: kind === 'token' ? token : undefined,
    apiKey: kind === 'apiKey' ? token : undefined,
    namespace: user.username,
  });

  if (isJsonOutput()) {
    printJson({
      command: 'login',
      mode: kind,
      username: user.username,
      email: user.email,
      namespace: user.username,
    });
    return;
  }

  logSuccess(`Logged in as ${user.username}`);
  printNote('namespace', user.username);
  printNote('email', user.email);
  printNote('default publish', 'listed');
  printNote('override', 'pass --unlisted to keep a publish off search');
}

export async function loginCommand(username?: string, options: LoginOptions = {}): Promise<void> {
  try {
    const config = await loadConfig();

    if (!options.force && (config.apiKey || config.token)) {
      try {
        const client = await getClient();
        const user = await client.getCurrentUser();
        if (isJsonOutput()) {
          printJson({
            command: 'login',
            mode: 'existing',
            username: user.username,
            email: user.email,
            namespace: user.username,
          });
          return;
        }

        logInfo(`Already logged in as ${user.username}`);
        printNote('namespace', user.username);
        printNote('hint', 'run "skilo logout" first or pass --force to replace this login');
        return;
      } catch {
        // fall through and refresh the saved auth
      }
    }

    let identity = options.token?.trim() || process.env.SKILO_API_KEY?.trim() || username?.trim() || '';

    if (!identity && process.stdin.isTTY && isInteractiveOutput()) {
      identity = await prompt('Username or API key: ');
    }

    if (!identity) {
      printUsage([
        'Usage: skilo login <username>',
        '   or: skilo login --token <api-key>',
        '',
        'Examples:',
        '  skilo login yaz',
        '  skilo login --token sk_...',
      ]);
    }

    if (looksLikeApiKey(identity)) {
      await saveAuthenticatedConfig(identity, 'apiKey');
      return;
    }

    let email = options.email?.trim();
    if (!email && process.stdin.isTTY && isInteractiveOutput()) {
      email = await prompt('Email (optional): ');
    }

    const client = await getClient();
    const result = await client.bootstrapCliLogin(identity, email || undefined);

    await saveConfig({
      ...config,
      token: undefined,
      apiKey: result.apiKey.key,
      namespace: result.user.username,
    });

    if (isJsonOutput()) {
      printJson({
        command: 'login',
        mode: 'bootstrap',
        created: result.created,
        username: result.user.username,
        email: result.user.email,
        namespace: result.user.username,
      });
      return;
    }

    logSuccess(`Logged in as ${result.user.username}`);
    printNote('namespace', result.user.username);
    printNote('email', result.user.email);
    printNote('default publish', 'listed');
    printNote('override', 'pass --unlisted to keep a publish off search');
  } catch (e) {
    exitWithError((e as Error).message);
  }
}
