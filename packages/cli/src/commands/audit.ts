import { discoverSkills, getToolLabel, resolveToolName, type ToolSourceName } from '../tool-dirs.js';
import { isJsonOutput, logInfo, logWarn, printJson, printKeyValue, printPrimary, printSection } from '../utils/output.js';
import { auditLocalSkill } from '../utils/trust.js';

export async function auditCommand(source = 'all'): Promise<void> {
  const tool = (resolveToolName(source) || 'all') as ToolSourceName;
  const skills = await discoverSkills(tool);

  if (skills.length === 0) {
    if (isJsonOutput()) {
      printJson({
        command: 'audit',
        tool,
        totalSkills: 0,
        blocked: 0,
        warnings: 0,
        clean: 0,
        results: [],
      });
    } else {
      logInfo(`No skills found in ${getToolLabel(tool)}.`);
    }
    return;
  }

  const results = await Promise.all(
    skills.map(async (skill) => ({
      skill,
      audit: await auditLocalSkill(skill.path),
    }))
  );

  const summary = {
    totalSkills: results.length,
    blocked: results.filter((result) => result.audit.auditStatus === 'blocked').length,
    warnings: results.filter((result) => result.audit.auditStatus === 'warning').length,
    clean: results.filter((result) => result.audit.auditStatus === 'clean').length,
  };

  if (isJsonOutput()) {
    printJson({
      command: 'audit',
      tool,
      ...summary,
      results: results.map((result) => ({
        name: result.skill.name,
        path: result.skill.path,
        tool: result.skill.tool,
        auditStatus: result.audit.auditStatus,
        capabilities: result.audit.capabilities,
        findings: result.audit.findings,
      })),
    });
    return;
  }

  printSection(`Audit ${getToolLabel(tool)}`, 'primary');
  printKeyValue('skills', String(summary.totalSkills));
  printKeyValue('clean', String(summary.clean));
  printKeyValue('warnings', String(summary.warnings));
  printKeyValue('blocked', String(summary.blocked));
  printPrimary('');

  for (const result of results) {
    printSection(`${result.skill.name} (${result.skill.tool})`, 'primary');
    printKeyValue('status', result.audit.auditStatus);
    if (result.audit.capabilities.length > 0) {
      printKeyValue('capabilities', result.audit.capabilities.join(', '));
    }
    for (const finding of result.audit.findings) {
      logWarn(`${result.skill.name}: ${finding.message}`);
    }
    printPrimary('');
  }

  if (summary.blocked > 0) {
    process.exit(1);
  }
}
