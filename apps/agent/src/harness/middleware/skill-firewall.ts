import { createMiddleware } from 'langchain';
import { toolPath } from '../workspace/files.js';
import { denied } from './common.js';
export const NAME = 'SkillFirewall';
const common = new Set(['read_file', 'ls', 'glob', 'grep', 'write_todos']);
export function createSkillFirewall(
  allowlists: Map<string, { allowedTools: string[] }>,
  initialSkill?: string,
) {
  let active = initialSkill;
  return createMiddleware({
    name: NAME,
    wrapToolCall: async (request, handler) => {
      const name = request.toolCall.name;
      const path = toolPath(request.toolCall.args);
      const skill =
        name === 'read_file' && path
          ? /^\/skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1]
          : undefined;
      // Selecting a new skill replaces the active policy. Read-only skills cannot
      // gain write access by retaining the union of earlier loaded skills.
      if (skill && allowlists.has(skill)) active = skill;
      if (
        active &&
        !common.has(name) &&
        !allowlists.get(active)?.allowedTools.includes(name)
      )
        return denied(
          request.toolCall,
          `Skill ${active} does not permit ${name}. Continue within its allowed-tools or load the skill appropriate to the user's new request.`,
        );
      return handler(request);
    },
  });
}
