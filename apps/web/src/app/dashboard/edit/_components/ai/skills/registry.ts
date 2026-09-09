import { Wand2, BarChart3, BotMessageSquare, Mic, Languages, Target } from '@magic-resume/icons';
import i18n from '@/i18n';
import type { AiSkill, SkillId } from '../types';

/**
 * The AI skill registry — pure metadata (labels, icons, intents). The shell
 * wires each skill to its runner: `analyze` calls the backend today, the rest
 * route through `/api/chat` (create) or are being migrated onto it. Editing this
 * metadata never touches the runners.
 */
export const SKILLS: Record<SkillId, AiSkill> = {
  create: {
    id: 'create',
    scope: ['whole-resume'],
    name: '引导创建',
    tagline: '对话式从零搭建',
    icon: BotMessageSquare,
    accent: 'text-sky-400',
    accentHex: '#38bdf8',
    surface: 'inline',
    isChat: true,
    buildIntent: () => i18n.t('aiLab.intent.create'),
    doneSummary: '',
  },
  optimize: {
    id: 'optimize',
    scope: ['whole-resume', 'element', 'selection'],
    name: '智能优化',
    tagline: '按 JD 定向改写',
    icon: Wand2,
    accent: 'text-violet-400',
    accentHex: '#a78bfa',
    surface: 'inline',
    canvas: { views: ['preview', 'json'], defaultView: 'preview' },
    buildIntent: (p) => `智能优化 · ${p.company || '—'} · ${p.title || '—'}`,
    doneSummary: '已改写 4 个模块',
  },
  analyze: {
    id: 'analyze',
    scope: ['whole-resume'],
    name: '简历分析',
    tagline: '多角色体检评分',
    icon: BarChart3,
    accent: 'text-emerald-400',
    accentHex: '#34d399',
    surface: 'inline',
    canvas: { views: ['score', 'json'], defaultView: 'score' },
    buildIntent: () => i18n.t('aiLab.intent.analyze'),
    doneSummary: '多角色体检完成',
  },
  fit: {
    id: 'fit',
    scope: ['whole-resume'],
    name: '岗位匹配',
    tagline: '按 JD 打分找差距',
    icon: Target,
    accent: 'text-cyan-400',
    accentHex: '#22d3ee',
    surface: 'inline',
    canvas: { views: ['match', 'json'], defaultView: 'match' },
    buildIntent: () => i18n.t('aiLab.intent.fit'),
    doneSummary: '匹配度评估完成',
  },
  translate: {
    id: 'translate',
    scope: ['whole-resume', 'element', 'selection'],
    name: '一键翻译',
    tagline: '生成多语言版本',
    icon: Languages,
    accent: 'text-amber-400',
    accentHex: '#fbbf24',
    surface: 'inline',
    canvas: { views: ['preview', 'json'], defaultView: 'preview' },
    buildIntent: (p) => `翻译成 ${p.lang || 'English'}`,
    doneSummary: '已生成翻译版',
  },
  interview: {
    id: 'interview',
    scope: ['whole-resume'],
    name: '模拟面试',
    tagline: '语音实战演练',
    icon: Mic,
    accent: 'text-rose-400',
    accentHex: '#fb7185',
    surface: 'immersive',
    buildIntent: () => i18n.t('aiLab.intent.interview'),
    doneSummary: '',
  },
};

export const SKILL_LIST: AiSkill[] = Object.values(SKILLS);
