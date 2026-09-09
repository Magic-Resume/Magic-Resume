import type { Resume } from '@/types/frontend/resume';

/**
 * 把简历压成面试要用的上下文。
 *
 * 不直接 `JSON.stringify(resume)`：那会把模板 id、主题色、排版设置、版本历史一起送上去
 * ——对出题没有任何用，却要占 token，而语音链路的每一轮都在等这段 prompt 编码完。
 * 只留内容字段，样式与元数据一律丢掉。
 */
export function buildResumeContext(resume: Resume): string {
  const sections = resume.sections as unknown as Record<string, unknown>;
  const order: string[] =
    resume.sectionOrder?.length > 0
      ? // sectionOrder 决定阅读顺序，面试官按它组织话题更接近真人读简历的样子。
        resume.sectionOrder.map((entry) =>
          typeof entry === 'string' ? entry : String((entry as { id?: string })?.id ?? ''),
        )
      : Object.keys(sections ?? {});

  return JSON.stringify({
    name: resume.name,
    info: resume.info,
    sections: order
      .filter((key) => key && sections?.[key] != null)
      .map((key) => ({ section: key, items: sections[key] })),
  });
}
