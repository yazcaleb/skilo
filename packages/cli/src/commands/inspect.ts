// Inspect skill without installing
import { getClient } from '../api/client.js';
import type { SkillMetadata } from '../types.js';
import { normalizeSourceInput } from '../utils/source-kind.js';
import { exitWithError, isJsonOutput, logWarn, printJson, printKeyValue, printNote, printPrimary, printSection, printUsage } from '../utils/output.js';
import { printTrustSummary } from '../utils/trust.js';
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
      const verifiedCount = pack.skills.filter((skill) => skill.verified).length;

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
      printKeyValue('verified', `${verifiedCount}/${pack.skills.length}`);
      if (pack.trust) {
        printTrustSummary(pack.trust);
      }
      printPrimary('');
      for (const skill of pack.skills) {
        printPrimary(`${skill.namespace}/${skill.name} ${skill.version ? `v${skill.version}` : ''}`.trim());
        if (skill.description) {
          printKeyValue('description', skill.description);
        }
        if (skill.trust) {
          printTrustSummary(skill.trust);
        } else if (skill.visibility) {
          printKeyValue('visibility', skill.visibility);
        }
      }
      printPrimary('');
      printNote('install', `skilo add https://skilo.xyz/p/${pack.token}`, 'primary');
      return;
    }

    let skill: SkillMetadata;
    let linkInfo: {
      oneTime: boolean;
      expiresAt?: number | null;
      maxUses?: number | null;
      usesCount: number;
      passwordProtected: boolean;
    } | undefined;

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
      linkInfo = data.link;
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
        link: linkInfo || null,
        trust: skill.trust || null,
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
    printTrustSummary(skill.trust, { includeFindings: true });
    if (skill.checksum) {
      printKeyValue('checksum', `${skill.checksum.substring(0, 16)}...`);
    }
    if (linkInfo?.oneTime) {
      printKeyValue('link', 'one-time');
    }
    if (linkInfo?.expiresAt) {
      printKeyValue('expires', new Date(linkInfo.expiresAt).toISOString());
    }
    if (linkInfo?.maxUses) {
      printKeyValue('max uses', String(linkInfo.maxUses));
    }

    printPrimary('');
    printNote('install', `skilo add ${source}`, 'primary');
  } catch (e) {
    exitWithError(`Inspect failed: ${(e as Error).message}`);
  }
}
