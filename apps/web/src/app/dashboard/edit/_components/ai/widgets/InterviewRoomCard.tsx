'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Clock } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui';
import { useResumeDocumentStore } from '@/store/resume/document';
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
 * 卡片自带发卡时分配的 roomId；首次进入才初始化会话和计时。同一张卡再次进入
 * 始终使用这个 ID，避免重开并重复占用额度。
 */
export default function InterviewRoomCard({ instance }: WidgetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const props = instance.props as {
    roomId?: string;
    role: string;
    jobDescription?: string;
    durationMinutes: number;
    style: InterviewStyle;
    language?: InterviewLanguage;
    difficulty?: InterviewDifficulty;
  };
  const setLaunch = useInterviewUiStore((s) => s.setLaunch);
  const setReturnTo = useInterviewUiStore((s) => s.setReturnTo);
  const existingSession = useInterviewUiStore(
    (s) => (props.roomId ? s.cardSessions[instance.widgetId] : undefined),
  );
  const activeResume = useResumeDocumentStore((s) => s.activeResume);

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-mr-accent-tint">
          <Mic size={14} className="text-mr-accent" />
        </div>
        <span className="text-mr-caption leading-snug text-mr-ink">
          {t('aiLab.widgets.interviewRoom.title')}
        </span>
      </div>

      <WidgetItem className="mt-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-mr-overline text-mr-ink-secondary">
          <span className="font-medium text-mr-ink">{props.role}</span>
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
            if (existingSession) {
              setReturnTo(`/dashboard/edit/${activeResume.id}/ai-lab`);
              router.push(`/dashboard/interview/${existingSession}`);
              return;
            }
            setLaunch(
              {
                roomId: props.roomId,
                cardId: props.roomId ? instance.widgetId : undefined,
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
                resumeId: activeResume.id,
              },
              // 退出面试回 **AI Lab**——面试就是从这儿点进去的。回编辑器根路径会把
              // 对话关掉，用户得自己再点开一次才能接着聊。
              `/dashboard/edit/${activeResume.id}/ai-lab`,
            );
            router.push('/dashboard/interview/new');
          }}
          className="w-full cursor-pointer rounded-xl bg-mr-accent-tint px-4 py-2 text-mr-caption font-medium text-mr-accent transition-colors hover:bg-mr-accent-tint/80"
        >
          {t(
            existingSession
              ? 'aiLab.widgets.interviewRoom.reenter'
              : 'aiLab.widgets.interviewRoom.enter',
          )}
        </button>
      </WidgetItem>
    </WidgetShell>
  );
}
