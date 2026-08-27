'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Clock } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui/contract';
import { useResumeStore } from '@/store/useResumeStore';
import { buildResumeContext } from '@/lib/interview/resumeContext';
import {
  useInterviewUiStore,
  type InterviewDifficulty,
  type InterviewLanguage,
  type InterviewStyle,
} from '@/store/useInterviewUiStore';

/**
 * 实时语音面试的入口卡。
 *
 * 此前入口是前端写死的技能 chip（`AiChatShell` 里 `surface === "immersive"` 直接开浮层），
 * 零参数、agent 全程没参与——用户得先知道有这个按钮才用得上，跟「能力按需浮现」拧着。
 * 现在由 agent 判断该不该面、面什么岗位，再把这张卡推出来。
 *
 * `interaction: 'client'`：点「进入」直接跳面试页，不回传 agent。绕一圈只会多一次停顿
 * 和一次计费，而这个决定用户已经做完了（同 `TemplateGalleryCard` 换模板）。
 *
 * **卡片不含 session**：会话由面试页在用户选定语音/打字之后才创建——`mode` 是 `start`
 * 的入参，提前建会话就等于替用户把这个选择做了。
 */
export default function InterviewRoomCard({ instance }: WidgetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const setLaunch = useInterviewUiStore((s) => s.setLaunch);
  const activeResume = useResumeStore((s) => s.activeResume);

  const props = instance.props as {
    role: string;
    jobDescription?: string;
    durationMinutes: number;
    style: InterviewStyle;
    language?: InterviewLanguage;
    difficulty?: InterviewDifficulty;
  };

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-tint-sky">
          <Mic size={14} className="text-ink-sky" />
        </div>
        <span className="text-[13px] leading-snug text-primary">
          {t('aiLab.widgets.interviewRoom.title')}
        </span>
      </div>

      <WidgetItem className="mt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-secondary">
          <span className="font-medium text-primary">{props.role}</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            {t('aiLab.widgets.interviewRoom.duration', {
              count: props.durationMinutes,
            })}
          </span>
          <span>{t(`aiLab.widgets.interviewRoom.style.${props.style}`)}</span>
          <span>
            {t(`aiLab.widgets.interviewRoom.language.${props.language ?? 'zh'}`)}
          </span>
          <span>
            {t(
              `aiLab.widgets.interviewRoom.difficulty.${props.difficulty ?? 'standard'}`,
            )}
          </span>
        </div>
      </WidgetItem>

      <WidgetItem className="mt-3">
        <button
          type="button"
          disabled={!activeResume}
          onClick={() => {
            if (!activeResume) return;
            setLaunch(
              {
                brief: {
                  role: props.role,
                  jobDescription: props.jobDescription,
                  durationMinutes: props.durationMinutes,
                  style: props.style,
                  // 老卡片（这两个字段之前不存在）落到默认，而不是把 undefined 传下去
                  // 让后端按"没指定"处理——那会让语言重新变成猜的。
                  language: props.language ?? 'zh',
                  difficulty: props.difficulty ?? 'standard',
                },
                // 简历上下文在**这里**算：面试页在编辑器之外，不知道你在编辑哪一份。
                resumeContext: buildResumeContext(activeResume),
              },
              // 退出面试回 **AI Lab**——面试就是从这儿点进去的。回编辑器根路径会把
              // 对话关掉，用户得自己再点开一次才能接着聊。
              `/dashboard/edit/${activeResume.id}/ai-lab`,
            );
            router.push('/dashboard/interview/new');
          }}
          className="w-full cursor-pointer rounded-xl bg-tint-sky px-4 py-2 text-[13px] font-medium text-ink-sky transition-colors hover:bg-tint-sky/80"
        >
          {t('aiLab.widgets.interviewRoom.enter')}
        </button>
      </WidgetItem>
    </WidgetShell>
  );
}
