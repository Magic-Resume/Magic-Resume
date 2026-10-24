import type {
  AnalysisImprovementAction,
  MultiPersonaResumeAnalysis,
} from '@/types/agent/multi-persona';

/** New reports carry verified actions; persisted legacy reports degrade to actionable text safely. */
export function analysisImprovementActions(
  analysis: MultiPersonaResumeAnalysis,
  cap = 6,
): AnalysisImprovementAction[] {
  const personas = [
    analysis.peer_analysis,
    analysis.leader_analysis,
    analysis.hrbp_analysis,
  ];
  const structured = analysis.improvement_actions?.length
    ? analysis.improvement_actions
    : personas.flatMap((persona, personaIndex) =>
        persona.issues?.length
          ? persona.issues
          : (persona.weaknesses ?? []).map((problem, issueIndex) => ({
              id: `legacy-${personaIndex}-${issueIndex}`,
              problem,
              suggestion: persona.suggestions?.[issueIndex] ?? '',
              evidence: [],
              missingEvidence: [],
            })),
      );

  const seen = new Set<string>();
  const out: AnalysisImprovementAction[] = [];
  for (const issue of structured) {
    const problem = issue.problem?.trim();
    const key = problem?.toLocaleLowerCase();
    if (!problem || !key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: issue.id || `issue-${out.length}`,
      problem,
      suggestion: issue.suggestion?.trim() ?? '',
      evidence: Array.isArray(issue.evidence) ? issue.evidence : [],
      missingEvidence: Array.isArray(issue.missingEvidence)
        ? issue.missingEvidence
        : [],
    });
    if (out.length >= cap) break;
  }
  return out;
}
