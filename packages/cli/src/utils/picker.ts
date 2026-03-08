import { createInterface } from 'node:readline';
import { getToolLabel, resolveToolName, type DiscoveredSkill } from '../tool-dirs.js';
import { isInteractiveOutput, printSection, printNote } from './output.js';

export interface PickerItem<T> {
  value: T;
  name: string;
  description?: string;
  meta?: string;
}

export interface PickerResult<T> {
  selected: T[];
  cancelled: boolean;
}

function render<T>(title: string, items: PickerItem<T>[], selected: boolean[]): string {
  const lines: string[] = [];
  const selectedCount = selected.filter(Boolean).length;
  lines.push(title);
  lines.push(`${selectedCount} of ${items.length} selected`);
  lines.push('');

  for (let i = 0; i < items.length; i++) {
    const check = selected[i] ? 'x' : ' ';
    const num = String(i + 1).padStart(String(items.length).length);
    const meta = items[i].meta ? ` (${items[i].meta})` : '';
    lines.push(`  [${check}] ${num}. ${items[i].name}${meta}`);
    if (items[i].description) {
      lines.push(`       ${''.padStart(String(items.length).length)}${items[i].description}`);
    }
  }
  lines.push('');
  lines.push('Toggle with numbers like "1 3", then press enter.');
  lines.push('Shortcuts: a=all, n=none, enter=confirm, q=cancel');
  return lines.join('\n');
}

export async function pickItems<T>(
  items: PickerItem<T>[],
  title: string = 'Select items'
): Promise<PickerResult<T>> {
  if (!process.stdin.isTTY || !isInteractiveOutput()) {
    return { selected: items.map((item) => item.value), cancelled: false };
  }

  if (process.env.SKILO_NO_INK !== '1') {
    try {
      const { runSelectionPrompt } = await import('../ui/ink/selection.js');
      return await runSelectionPrompt({ title, items });
    } catch {
      // Fall back to the simple prompt if Ink cannot start in the current terminal.
    }
  }

  const selected = items.map(() => true);
  let rendered = render(title, items, selected);
  let lineCount = rendered.split('\n').length;

  printSection('Interactive selection');
  printNote('mode', 'Toggle skills, then press enter to continue');
  process.stdout.write(`\n${rendered}\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<PickerResult<T>>((resolve) => {
    const ask = () => {
      rl.question('> ', (answer) => {
        const trimmed = answer.trim().toLowerCase();

        if (trimmed === 'q') {
          rl.close();
          resolve({ selected: [], cancelled: true });
          return;
        }

        if (trimmed === '') {
          rl.close();
          const picked = items.filter((_, i) => selected[i]).map((item) => item.value);
          resolve({ selected: picked, cancelled: false });
          return;
        }

        if (trimmed === 'a') {
          selected.fill(true);
        } else if (trimmed === 'n') {
          selected.fill(false);
        } else {
          const nums = trimmed.split(/\s+/).map(Number);
          for (const n of nums) {
            if (n >= 1 && n <= items.length) {
              selected[n - 1] = !selected[n - 1];
            }
          }
        }

        // Move up past prompt line + previous render, then clear
        process.stdout.write(`\x1b[${lineCount + 1}A\x1b[J`);

        rendered = render(title, items, selected);
        lineCount = rendered.split('\n').length;
        process.stdout.write(rendered + '\n');

        ask();
      });
    };

    ask();
  });
}

export async function pickSkills(
  skills: DiscoveredSkill[],
  title: string = 'Select skills'
): Promise<PickerResult<DiscoveredSkill>> {
  const uniqueTools = new Set(skills.map((skill) => skill.tool));
  const showToolMeta = uniqueTools.size > 1;

  return pickItems(
    skills.map((skill) => ({
      value: skill,
      name: skill.name,
      description: skill.description,
      meta: showToolMeta && resolveToolName(skill.tool)
        ? getToolLabel(resolveToolName(skill.tool)!)
        : showToolMeta
          ? skill.tool
          : undefined,
    })),
    title
  );
}
