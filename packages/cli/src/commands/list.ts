import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

function getSkillsDir(): string {
  return join(process.cwd(), '.claude', 'skills');
}

export async function listCommand(): Promise<void> {
  const skillsDir = getSkillsDir();

  try {
    const entries = await readdir(skillsDir);
    const skills: Array<{ name: string; modified: Date }> = [];

    for (const entry of entries) {
      const path = join(skillsDir, entry);
      const st = await stat(path);

      if (st.isDirectory()) {
        const skillPath = join(path, 'SKILL.md');
        try {
          const content = await readFile(skillPath, 'utf-8');
          const nameMatch = content.match(/name:\s*(.+)/);
          const name = nameMatch ? nameMatch[1].trim() : entry;
          skills.push({ name, modified: st.mtime });
        } catch {
          skills.push({ name: entry, modified: st.mtime });
        }
      }
    }

    if (skills.length === 0) {
      console.log('No skills installed');
      return;
    }

    console.log(`Installed skills (${skills.length}):\n`);
    for (const skill of skills) {
      console.log(`  ${skill.name}`);
      console.log(`    Modified: ${skill.modified.toISOString().split('T')[0]}`);
    }
  } catch {
    console.log('No skills installed');
  }
}