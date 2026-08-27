'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Beautiful } from '@magic-resume/genui';
import Markdown from '@/app/dashboard/edit/_components/ai/conversation/Markdown';
import ApplicationTrackerCard from '@/app/dashboard/edit/_components/ai/widgets/ApplicationTrackerCard';
import { readAsset, type LibraryAsset } from '@/lib/api/workspace';

/**
 * 预览区。正文是**第二个请求**（列表只回元信息），所以它有自己的加载与失败状态。
 *
 * 三种失败必须分开说：过期（410）/ 已归档（409）/ 不存在（404）。统一成「加载失败」
 * 是偷懒——前两种是可解释的，用户需要知道是自己没留住，而不是系统坏了。
 */
export default function AssetPreview({ asset }: { asset: LibraryAsset }) {
  const { t } = useTranslation();
  const [content, setContent] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // 投递面板与面试记录的正文列表里就带回来了，没有「按 id 再读一次」这条路由。
    if (asset.extra) {
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setContent(null);
    readAsset(asset.resumeId, asset.id)
      .then((data) => {
        if (alive) setContent(data.content);
      })
      .catch((err: { response?: { status?: number } }) => {
        if (!alive) return;
        const status = err?.response?.status;
        setError(
          status === 410
            ? t('aiLab.assets.previewExpired')
            : status === 409
              ? t('aiLab.assets.previewArchived')
              : status === 404
                ? t('aiLab.assets.previewMissing')
                : t('aiLab.assets.loadFailed'),
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [asset.resumeId, asset.id, asset.extra, t]);

  if (asset.extra === 'BOARD') {
    // 与对话里那块面板是**同一个组件**：两处形状一旦分岔，就会出现只在一处复现的 bug。
    // 这里是只读视图，所以不给 `onAction`——没有 AI 在场，按钮点了也无人接。
    return (
      <ApplicationTrackerCard
        instance={{
          widgetId: 'job-application-tracker',
          kind: 'application_tracker',
          // `submitted` 而不是 `pending`：这块面板不在等谁回答，它是一份已成事实的
          // 记录。留 pending 会让卡片渲染成「等待中」的样子。
          status: 'submitted',
          props: (asset.payload ?? {}) as Record<string, unknown>,
        }}
        // 只读视图：没有 AI 在场，卡里的动作无人接。给一个空实现而不是把按钮留成
        // 「点了没反应」——后者用户会当成坏了。
        onAction={() => undefined}
      />
    );
  }

  if (asset.extra === 'INTERVIEW') {
    const session = asset.payload as
      | { sessionId: string; score?: number | null }
      | undefined;
    return (
      <div className="space-y-3">
        {typeof session?.score === 'number' && (
          <p className="text-[13px] text-ink-2">
            {t('aiLab.assets.interviewScore', { score: session.score })}
          </p>
        )}
        {/* 「打开报告」已经在下方动作栏上——每一类的主行动都在同一条基线，
            这里再放一条就是同一个动作出现两次。 */}
      </div>
    );
  }

  if (loading) {
    // 骨架而不是转圈：标题和元信息列表里已经有了，正文位置先把形状摆出来。
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-white/[0.05]"
            style={{ width: `${[92, 78, 85, 60][i]}%` }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="status" className="text-[13px] text-ink-3">
        {error}
      </p>
    );
  }

  const text = typeof content === 'string' ? content : null;
  if (text !== null && asset.mimeType.startsWith('text/')) {
    return <Markdown>{text}</Markdown>;
  }
  if (asset.mimeType.startsWith('image/') && text) {
    return (
      <img
        src={text}
        alt={asset.title}
        className="max-w-full rounded-[10px] shadow-hairline"
      />
    );
  }
  if (content !== null && content !== undefined) {
    return (
      <Beautiful.CodeBlock
        code={JSON.stringify(content, null, 2)}
        lang="JSON"
        copyLabel={t('aiLab.chat.copy')}
        copiedLabel={t('aiLab.chat.copied')}
      />
    );
  }
  // 认不出就说认不出，不渲染乱码。
  return (
    <p role="status" className="text-[13px] text-ink-3">
      {t('aiLab.assets.previewUnsupported')}
    </p>
  );
}
