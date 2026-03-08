// Inspect skill without installing
import { getClient } from '../api/client.js';
import { normalizeSourceInput } from '../utils/source-kind.js';
import { exitWithError, isJsonOutput, logWarn, printJson, printKeyValue, printNote, printPrimary, printSection, printUsage } from '../utils/output.js';
import { parsePackToken } from './share.js';

export async function inspectCommand(source: string): Promise<void> {
  if (!source) {
    printUsage([
      'Usage: skilo inspect <skill>',
      '',
      'Examples:',
      '  skilo inspect namespace/name',
      '  skilo inspect https://skilo.xyz/s/abc123',
    ]);
  }

  try {
    source = normalizeSourceInput(source);
    const packToken = parsePackToken(source);

    if (packToken) {
      const client = await getClient();
      const pack = await client.resolvePack(packToken);

      if (isJsonOutput()) {
        printJson({
          command: 'inspect',
          source,
          pack,
          installCommand: `skilo add https://skilo.xyz/p/${pack.token}`,
        });
        return;
      }

      printSection(pack.name || 'Skill Pack', 'primary');
      printKeyValue('skills', String(pack.skills.length));
      printPrimary('');
      for (const skill of pack.skills) {
        printPrimary(`${skill.namespace}/${skill.name} ${skill.version ? `v${skill.version}` : ''}`.trim());
        if (skill.description) {
          printKeyValue('description', skill.description);
        }
      }
      printPrimary('');
      printNote('install', `skilo add https://skilo.xyz/p/${pack.token}`, 'primary');
      return;
    }

    let skill: {
      name: string;
      namespace: string;
      description?: string;
      version?: string;
      author?: string | null;
      homepage?: string | null;
      repository?: string | null;
      keywords?: string[];
      checksum?: string;
      size?: number;
    };

    if (source.startsWith('https://skilo.xyz/s/')) {
      // Inspect share link
      const token = source.split('/s/')[1];
      const client = await getClient();
      const response = await fetch(`${client.baseUrl}/v1/skills/share/${token}`);

      if (!response.ok) {
        throw new Error('Invalid or expired share link');
      }

      const data = await response.json();
      if (data.requiresPassword) {
        logWarn('This skill is password protected');
        return;
      }
      skill = data.skill;
    } else if (source.includes('/')) {
      // Inspect by namespace/name
      const [namespace, name] = source.split('/');
      const client = await getClient();
      skill = await client.getSkillMetadata(namespace, name);

      // Also get verification info
      const verifyResponse = await fetch(`${client.baseUrl}/v1/skills/${namespace}/${name}/verify`);
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        skill.checksum = verifyData.checksum;
      }
    } else {
      throw new Error('Invalid skill reference. Use: namespace/name or https://skilo.xyz/s/...');
    }

    if (isJsonOutput()) {
      printJson({
        command: 'inspect',
        source,
        skill,
        installCommand: `skilo add ${source}`,
      });
      return;
    }

    printSection(`${skill.namespace}/${skill.name}`, 'primary');

    if (skill.description) {
      printKeyValue('description', skill.description);
    }
    if (skill.version) {
      printKeyValue('version', skill.version);
    }
    if (skill.author) {
      printKeyValue('author', skill.author);
    }
    if (skill.homepage) {
      printKeyValue('homepage', skill.homepage);
    }
    if (skill.repository) {
      printKeyValue('repository', skill.repository);
    }
    if (skill.keywords && skill.keywords.length > 0) {
      printKeyValue('keywords', skill.keywords.join(', '));
    }
    if (skill.size) {
      printKeyValue('size', `${(skill.size / 1024).toFixed(2)} KB`);
    }
    if (skill.checksum) {
      printKeyValue('checksum', `${skill.checksum.substring(0, 16)}...`);
    }

    printPrimary('');
    printNote('install', `skilo add ${source}`, 'primary');
  } catch (e) {
    exitWithError(`Inspect failed: ${(e as Error).message}`);
  }
}
