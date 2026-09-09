// Multi-Persona Resume Analysis Types

/** 后端对这一轮的判定：pending = 还没跑完，failed = 跑完但没给出可用分数。 */
export type PersonaResultStatus = 'ok' | 'failed' | 'pending';

export interface PersonaAnalysis {
  persona: 'peer_developer' | 'tech_lead' | 'hrbp';
  /** 旧的分析结果没有这个字段，读的时候按 'ok' 兜底。 */
  status?: PersonaResultStatus;
  score: number;
  categories_scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  issues?: AnalysisImprovementAction[];
}

export interface AnalysisEvidenceRef {
  sectionKey: string;
  itemId: string;
  fieldKey: string;
  path: string;
  quote: string;
}

export interface AnalysisImprovementAction {
  id: string;
  problem: string;
  suggestion?: string;
  evidence: AnalysisEvidenceRef[];
  missingEvidence: string[];
}

export interface MultiPersonaResumeAnalysis {
  overall_score: number;
  /** 一句针对这份简历的总结评语，晚于分数到达；没有就用按档位的兜底文案。 */
  verdict?: string;
  category_averages: Record<string, number>;
  peer_analysis: PersonaAnalysis;
  leader_analysis: PersonaAnalysis;
  hrbp_analysis: PersonaAnalysis;
  improvement_actions?: AnalysisImprovementAction[];
}
