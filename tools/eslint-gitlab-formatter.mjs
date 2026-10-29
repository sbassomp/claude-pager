// ESLint formatter emitting GitLab Code Quality reports (CodeClimate JSON subset):
// https://docs.gitlab.com/ci/testing/code_quality/#code-quality-report-format
import { createHash } from 'node:crypto';
import { relative } from 'node:path';

const SEVERITY = { 1: 'minor', 2: 'major' };

export default function format(results, context) {
  const issues = [];
  for (const result of results) {
    const path = relative(context.cwd, result.filePath);
    for (const msg of result.messages) {
      const checkName = msg.ruleId || 'eslint';
      issues.push({
        description: msg.message,
        check_name: checkName,
        fingerprint: createHash('md5')
          .update(`${path}:${msg.line}:${msg.column}:${checkName}:${msg.message}`)
          .digest('hex'),
        severity: msg.fatal ? 'blocker' : SEVERITY[msg.severity] || 'info',
        location: { path, lines: { begin: msg.line || 1 } },
      });
    }
  }
  return JSON.stringify(issues, null, 2);
}
