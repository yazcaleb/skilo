import { writeFile } from 'node:fs/promises';
import { generateSkillTemplate } from '../manifest.js';

const SKILL_FILE = 'SKILL.md';

export async function initCommand(name?: string): Promise<void> {
  const skillName = name || 'my-skill';
  const description = 'A skill for Claude Code';

  const content = generateSkillTemplate(skillName, description);

  try {
    await writeFile(SKILL_FILE, content, 'utf-8');
    console.log(`✓ Created ${SKILL_FILE}`);
    console.log('  Edit the file to customize your skill.');
  } catch (e) {
    console.error(`Error creating ${SKILL_FILE}: ${(e as Error).message}`);
    process.exit(1);
  }
}