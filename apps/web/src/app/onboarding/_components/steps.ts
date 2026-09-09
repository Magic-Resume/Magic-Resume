/**
 * 求职画像向导问哪些问题。
 *
 * 四步，每步不超过两个决策（`.impeccable.md`：一步一张卡、三个以内的决策）。
 * 前三步是背景，**第四步是意图**——「现在最难的是哪一步」决定 AI 第一句话该说什么，
 * 那才是整个向导的价值所在。
 *
 * 选项是**起点不是栅栏**（设计原则 5）：每一题都能自由输入，每一步都能跳过。画像最终
 * 交给模型合成，而自由文本比选项有信息量得多——「想从测开转前端，但简历上全是测试
 * 经历」这种话，任何选项都表达不了。
 */

export type FieldKind = 'single' | 'multi';

export interface OnboardingField {
  id: string;
  /** i18n 后缀，落在 `onboarding.fields.<id>.*`。 */
  kind: FieldKind;
  /** 选项的 i18n 键后缀；文案与 `FORM_DEFS.create_target` 同源。 */
  options: string[];
  /** 允许在选项之外自己填。 */
  allowCustom?: boolean;
}

export interface OnboardingStep {
  id: string;
  /** 这一步 Polaris 的姿态。资产在 `public/marks/`，六个 viewBox 都是 0 0 24 24。 */
  pose: string;
  /** 角色背后那层柔光的色相。随步骤推进而变，读作「进展」。 */
  glow: string;
  fields: OnboardingField[];
  /** 这一步额外给一个自由输入框。 */
  freeText?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'direction',
    pose: 'polaris-pet-sit',
    glow: 'var(--accent)',
    fields: [
      {
        id: 'role',
        kind: 'multi',
        allowCustom: true,
        /**
         * 覆盖面要够宽。只列九个研发岗，等于对着一个投运营 / HR / 财务的人说
         * 「这个产品不是给你用的」——而简历工具本来就不分职能。
         */
        options: [
          'frontend', 'backend', 'fullstack', 'client', 'algorithm', 'data',
          'ai', 'test', 'devops', 'security', 'embedded', 'gamedev',
          'product', 'design', 'operations', 'marketing', 'sales',
          'hr', 'finance', 'legal', 'pm', 'research', 'content', 'customer',
        ],
      },
      {
        id: 'industry',
        kind: 'multi',
        allowCustom: true,
        options: [
          'internet', 'ecommerce', 'finance', 'ai', 'game', 'hardware', 'soe',
          'education', 'healthcare', 'manufacturing', 'auto', 'media',
          'consulting', 'realestate', 'logistics', 'energy', 'retail', 'nonprofit',
        ],
      },
    ],
  },
  {
    id: 'stage',
    pose: 'polaris-pet-thinking',
    glow: 'oklch(0.72 0.10 221)',
    fields: [
      {
        id: 'careerStage',
        kind: 'single',
        options: ['campus', 'experienced', 'switching', 'intern'],
      },
      {
        id: 'city',
        kind: 'multi',
        allowCustom: true,
        options: ['beijing', 'shanghai', 'shenzhen', 'hangzhou', 'guangzhou', 'chengdu', 'remote'],
      },
    ],
  },
  {
    id: 'skills',
    pose: 'polaris-pet-typing',
    glow: 'oklch(0.62 0.18 293)',
    fields: [
      {
        id: 'stack',
        kind: 'multi',
        allowCustom: true,
        /** 同理：技术栈只列十个前后端关键词，非研发岗在这一步会无从下手。 */
        options: [
          'react', 'vue', 'typescript', 'node', 'java', 'go', 'python', 'cpp',
          'rust', 'swift', 'kotlin', 'flutter', 'sql', 'k8s', 'docker', 'aws',
          'pytorch', 'figma', 'excel', 'sap', 'ps', 'office', 'tableau', 'crm',
        ],
      },
    ],
  },
  {
    /**
     * 卡点。**这一步是整个向导的价值所在**：前三步说明他是谁，这一步说明他现在要什么。
     * 一个「投了没回音」的人和一个「有 offer 在纠结」的人，需要的第一句话完全不同。
     */
    id: 'blocker',
    pose: 'polaris-pet-excited',
    glow: 'oklch(0.76 0.13 70)',
    freeText: true,
    fields: [
      {
        id: 'blocker',
        kind: 'single',
        options: ['whereToApply', 'thinResume', 'noReply', 'failInterview', 'choosingOffer'],
      },
    ],
  },
];

/** 用户在向导里的作答。跳过的步骤**不留键**——不要写一句「未知」进去污染画像。 */
export type OnboardingAnswers = Record<string, string[]>;
