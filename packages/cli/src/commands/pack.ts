import { join } from 'node:path';
import * as tar from 'tar';
import { statSync } from 'node:fs';
import { getClient } from '../api/client.js';
import { validateSkillContent } from '../manifest.js';
import { readSkillContent } from '../utils/skill-file.js';
import { exitWithError, isJsonOutput, logInfo, logSuccess, printJson, printPrimary } from '../utils/output.js';
import { ensureShareLinkForSource } from './share.js';

const DEFAULT_OUTPUT = 'skilo.tgz';

interface PackOptions {
  output?: string;
  name?: string;
  oneTime?: boolean;
  expires?: string;
  uses?: number;
  password?: boolean;
  listed?: boolean;
  unlisted?: boolean;
}

export async function packCommand(
  sources: string[] = [],
  options: PackOptions = {}
): Promise<void> {
  if (sources.length === 0) {
    await createBundle(options.output || DEFAULT_OUTPUT);
    return;
  }

  await createCuratedPack(sources, options);
}

async function createCuratedPack(sources: string[], options: PackOptions): Promise<void> {
  const client = await getClient();
  const tokens = new Set<string>();
  const included: Array<{ source: string; token: string; url: string; created: boolean }> = [];

  for (const source of sources) {
    const result = await ensureShareLinkForSource(source, {
      oneTime: options.oneTime,
      expires: options.expires,
      uses: options.uses,
      password: options.password,
      listed: options.listed,
      unlisted: options.unlisted ?? !options.listed,
    });

    if (tokens.has(result.token)) {
      continue;
    }

    tokens.add(result.token);
    included.push({
      source,
      token: result.token,
      url: result.url,
      created: result.created,
    });
  }

  if (included.length === 0) {
    exitWithError('Pack creation failed: no valid skills were provided');
  }

  const packName = options.name || derivePackName(sources);
  const pack = await client.createPack(packName, [...tokens]);

  logSuccess(`Pack ready with ${pack.count} skills`);

  if (isJsonOutput()) {
    printJson({
      command: 'pack',
      mode: 'curated',
      name: packName,
      pack,
      included,
    });
    return;
  }

  printPrimary(pack.url);
}

function derivePackName(sources: string[]): string {
  if (sources.length === 1) {
    return `Pack from ${sources[0]}`;
  }

  return `Curated pack (${sources.length} skills)`;
}

async function createBundle(outputFile: string): Promise<void> {
  const cwd = process.cwd();
  let skillFile: string;

  try {
    const resolved = await readSkillContent(cwd);
    skillFile = resolved.skillFile;
    const content = resolved.content;
    const result = validateSkillContent(content);

    if (!result.valid) {
      exitWithError(
        `${skillFile} is invalid: ${result.errors.map((error) => `${error.field}: ${error.message}`).join(', ')}`
      );
    }
  } catch (e) {
    exitWithError((e as Error).message);
  }

  const files: string[] = [skillFile!];
  try { statSync(join(cwd, 'index.js')); files.push('index.js'); } catch {}
  try { statSync(join(cwd, 'index.ts')); files.push('index.ts'); } catch {}
  try { statSync(join(cwd, 'src')); files.push('src'); } catch {}

  try {
    await tar.create({
      cwd,
      gzip: true,
      file: outputFile,
    }, files);

    logSuccess(`Created ${outputFile}`);
  } catch {
    await tar.create({
      cwd,
      gzip: true,
      file: outputFile,
    }, [skillFile!]);

    logInfo(`Created ${outputFile} (${skillFile} only)`);
  }
}
