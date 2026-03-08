import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getClient } from '../api/client.js';
import { discoverSkills, getToolLabel, resolveToolName } from '../tool-dirs.js';
import { exitWithError, isJsonOutput, logInfo, printJson, printNote, printPrimary, printSection } from '../utils/output.js';

interface ListOptions {
  published?: boolean;
  tool?: string;
}

function getProjectSkillsDir(): string {
  return join(process.cwd(), '.claude', 'skills');
}

async function listProjectSkills(): Promise<void> {
  const skillsDir = getProjectSkillsDir();

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

    if (isJsonOutput()) {
      printJson({
        command: 'list',
        mode: 'project',
        skills: skills.map((skill) => ({
          name: skill.name,
          modified: skill.modified.toISOString(),
        })),
      });
      return;
    }

    if (skills.length === 0) {
      logInfo('No project skills installed.');
      return;
    }

    printSection(`Project skills (${skills.length})`);
    for (const skill of skills) {
      printPrimary(skill.name);
      printNote('modified', skill.modified.toISOString().split('T')[0]);
    }
  } catch {
    if (isJsonOutput()) {
      printJson({ command: 'list', mode: 'project', skills: [] });
      return;
    }
    logInfo('No project skills installed.');
  }
}

async function listToolSkills(tool: string): Promise<void> {
  const resolved = resolveToolName(tool);
  if (!resolved || resolved === 'all') {
    exitWithError(`Unknown tool "${tool}". Use claude, codex, cursor, amp, windsurf, opencode, cline, roo, or openclaw.`);
  }

  const skills = await discoverSkills(resolved);
  if (isJsonOutput()) {
    printJson({
      command: 'list',
      mode: 'tool',
      tool: resolved,
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
    });
    return;
  }

  if (skills.length === 0) {
    logInfo(`No skills found in ${getToolLabel(resolved)}.`);
    return;
  }

  printSection(`${getToolLabel(resolved)} skills (${skills.length})`);
  for (const skill of skills) {
    printPrimary(skill.name);
    if (skill.description) {
      printNote('about', skill.description);
    }
  }
}

async function listPublishedSkills(): Promise<void> {
  const client = await getClient();
  const skills = await client.getUserSkills();

  if (isJsonOutput()) {
    printJson({
      command: 'list',
      mode: 'published',
      skills,
    });
    return;
  }

  if (skills.length === 0) {
    logInfo('No published skills yet.');
    return;
  }

  printSection(`Published skills (${skills.length})`);
  for (const skill of skills) {
    printPrimary(`@${skill.namespace}/${skill.name}@${skill.version}`);
    printNote('visibility', skill.listed ? 'public' : 'unlisted');
    if (skill.description) {
      printNote('about', skill.description);
    }
  }
}

export async function listCommand(options: ListOptions = {}): Promise<void> {
  try {
    if (options.published) {
      await listPublishedSkills();
      return;
    }

    if (options.tool) {
      await listToolSkills(options.tool);
      return;
    }

    await listProjectSkills();
  } catch (e) {
    exitWithError((e as Error).message);
  }
}
