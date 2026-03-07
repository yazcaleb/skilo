import { getClient } from '../api/client.js';

function parseSkillRef(skill: string): { namespace: string; name: string } {
  const parts = skill.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid skill reference. Use format: namespace/name');
  }
  return { namespace: parts[0], name: parts[1] };
}

export async function catCommand(skill: string): Promise<void> {
  if (!skill) {
    console.error('Usage: skilo cat <namespace/name>');
    process.exit(1);
  }

  try {
    const { namespace, name } = parseSkillRef(skill);
    const client = await getClient();

    // Get skill metadata (works for both listed and unlisted)
    const metadata = await client.getSkillMetadata(namespace, name);

    console.log(`# ${metadata.name}\n`);
    console.log(metadata.description);
    console.log(`\nVersion: ${metadata.version}`);
    console.log(`Namespace: ${metadata.namespace}`);
    console.log(`Listed: ${metadata.listed ? 'yes' : 'no (unlisted)'}`);
    if (metadata.author) console.log(`Author: ${metadata.author}`);
    if (metadata.homepage) console.log(`Homepage: ${metadata.homepage}`);
    if (metadata.repository) console.log(`Repository: ${metadata.repository}`);
    if (metadata.keywords?.length) console.log(`Keywords: ${metadata.keywords.join(', ')}`);
    console.log(`\nInstall with: skilo add ${namespace}/${name}`);

    // Download and show SKILL.md content
    try {
      const tarball = await client.downloadTarball(namespace, name, metadata.version);
      const decompressed = await decompressGzip(new Uint8Array(tarball));

      // Parse tarball to find SKILL.md
      const content = extractFileFromTarball(decompressed, 'SKILL.md');
      if (content) {
        console.log('\n--- SKILL.md ---\n');
        console.log(content);
      }
    } catch (e) {
      // Could not fetch SKILL.md - maybe version not found
    }
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const { gunzip } = await import('node:zlib');
  return new Promise((resolve, reject) => {
    gunzip(data, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function extractFileFromTarball(tarball: Uint8Array, filename: string): string | null {
  // Simple tar parser - look for the file
  // TAR format: 512-byte blocks, each file starts with header
  const BLOCK_SIZE = 512;
  let offset = 0;

  while (offset + BLOCK_SIZE <= tarball.length) {
    const header = tarball.slice(offset, offset + 100);
    const name = new TextDecoder().decode(header.slice(0, 100)).replace(/\0/g, '');

    if (name === filename) {
      const sizeBytes = tarball.slice(offset + 124, offset + 136);
      const size = parseInt(new TextDecoder().decode(sizeBytes).replace(/\0/g, '').trim(), 8);

      if (size > 0) {
        const contentOffset = offset + BLOCK_SIZE;
        const content = new TextDecoder().decode(tarball.slice(contentOffset, contentOffset + size));
        return content;
      }
    }

    // Get file size from header and skip to next block
    const sizeBytes = tarball.slice(offset + 124, offset + 136);
    const size = parseInt(new TextDecoder().decode(sizeBytes).replace(/\0/g, '').trim(), 8);
    const blocks = Math.ceil(size / BLOCK_SIZE);
    offset += (blocks + 1) * BLOCK_SIZE;
  }

  return null;
}