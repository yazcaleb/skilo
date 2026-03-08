import { basename } from 'node:path';
import { type DiscoveredSkill, type ToolSourceName, discoverSkills, getToolLabel, resolveToolName } from '../tool-dirs.js';
import { pickSkills } from './picker.js';
import { isInteractiveOutput, isJsonOutput } from './output.js';

type SelectedMode = 'all' | 'explicit' | 'interactive' | 'single';

interface ToolSourceBase {
  sourceTool: ToolSourceName;
  sourceLabel: string;
  availableSkills: DiscoveredSkill[];
}

export type ToolSourceSelectionResult =
  | (ToolSourceBase & {
      mode: 'selected';
      selectionMode: SelectedMode;
      selectedSkills: DiscoveredSkill[];
    })
  | (ToolSourceBase & {
      mode: 'needs_selection';
    })
  | (ToolSourceBase & {
      mode: 'cancelled';
      selectedSkills: [];
    });

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getSkillLookupTokens(skill: DiscoveredSkill): string[] {
  return [skill.name, basename(skill.path)].map(normalize);
}

export function quoteShellValue(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

export async function selectToolSourceSkills(
  source: string,
  options: { all?: boolean; skill?: string[] } = {}
): Promise<ToolSourceSelectionResult> {
  const sourceTool = resolveToolName(source);
  if (!sourceTool) {
    throw new Error(`Unknown tool source: ${source}`);
  }

  const sourceLabel = getToolLabel(sourceTool);
  const availableSkills = await discoverSkills(sourceTool);

  if (availableSkills.length === 0) {
    throw new Error(`No skills found in ${sourceLabel}.`);
  }

  if (options.skill?.length) {
    const wanted = options.skill.map(normalize);
    const selectedSkills: DiscoveredSkill[] = [];
    const matchedPaths = new Set<string>();
    const missing: string[] = [];

    for (const query of wanted) {
      const match = availableSkills.find((skill) => getSkillLookupTokens(skill).includes(query));
      if (!match) {
        missing.push(query);
        continue;
      }

      if (!matchedPaths.has(match.path)) {
        matchedPaths.add(match.path);
        selectedSkills.push(match);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Skill${missing.length === 1 ? '' : 's'} not found in ${sourceLabel}: ${missing.join(', ')}. Available: ${availableSkills.map((skill) => skill.name).join(', ')}`
      );
    }

    return {
      mode: 'selected',
      selectionMode: 'explicit',
      sourceTool,
      sourceLabel,
      availableSkills,
      selectedSkills,
    };
  }

  if (options.all) {
    return {
      mode: 'selected',
      selectionMode: 'all',
      sourceTool,
      sourceLabel,
      availableSkills,
      selectedSkills: availableSkills,
    };
  }

  if (availableSkills.length === 1) {
    return {
      mode: 'selected',
      selectionMode: 'single',
      sourceTool,
      sourceLabel,
      availableSkills,
      selectedSkills: availableSkills,
    };
  }

  if (process.stdin.isTTY && isInteractiveOutput() && !isJsonOutput()) {
    const picked = await pickSkills(availableSkills, `Select skills from ${sourceLabel}`);
    if (picked.cancelled || picked.selected.length === 0) {
      return {
        mode: 'cancelled',
        sourceTool,
        sourceLabel,
        availableSkills,
        selectedSkills: [],
      };
    }

    return {
      mode: 'selected',
      selectionMode: 'interactive',
      sourceTool,
      sourceLabel,
      availableSkills,
      selectedSkills: picked.selected,
    };
  }

  return {
    mode: 'needs_selection',
    sourceTool,
    sourceLabel,
    availableSkills,
  };
}
