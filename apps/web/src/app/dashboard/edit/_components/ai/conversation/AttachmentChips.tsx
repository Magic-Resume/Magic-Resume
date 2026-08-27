'use client';

import { useState } from 'react';
import { FileText, Image as ImageIcon, X } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { type StagedAttachment } from '../lib/attachments';

/**
 * 输入框里暂存的附件。
 *
 * ## 形态：卡片两行，不是胶囊一行
 *
 * 第一版把「文件名 · 意图 ▾ · 错误全文 · ×」四样东西横着塞进一颗胶囊，又密又宽，
 * 一个长文件名加一句错误说明就能把整行撑爆。改成**图标 + 两行**：
 * 第一行文件名，第二行只说类型。信息按重要性分层，而不是并排堆着。
 *
 * 文件只有一个动作：作为简历附件上传并解析。用途选择会让一张简单的上传卡
 * 看起来像一份工作流表单，所以不在输入框里额外暴露分支。
 */

const KIND_LABEL: Record<StagedAttachment['kind'], string> = {
  pdf: 'PDF',
  image: 'IMAGE',
};

/** 文件名中间截断，**保留扩展名**——「…算法工程师.pdf」比截掉尾巴有用。 */
function middleTruncate(name: string, max = 26): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem.slice(0, Math.max(4, max - ext.length - 1))}…${ext}`;
}

function Card({
  attachment,
  onRemove,
  disabled,
}: {
  attachment: StagedAttachment;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const failed = attachment.status === 'failed';
  const uploading = attachment.status === 'uploading';

  return (
    <li
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group relative flex h-[54px] w-[228px] shrink-0 items-center gap-2.5 rounded-2xl border px-2.5',
        'transition-colors',
        failed
          ? 'border-red-500/25 bg-red-500/[0.06]'
          : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.06]',
      )}
    >
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center">
        {uploading ? (
          <span role="status" aria-label={t('aiLab.attach.parsingShort')}>
            {/*
              不展示上传百分比；圆环只表示「仍在上传」，不伪造百分比。
              它替代文件图标，而不是套在图标外：状态一眼可见，也不会读成文件类型。
            */}
            <span
              aria-hidden
              className="block h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200 motion-reduce:animate-none"
            />
          </span>
        ) : (
          <div
            className={cn(
              'flex h-full w-full items-center justify-center rounded-[7px]',
              failed ? 'bg-red-500/15 text-red-300' : 'bg-white/[0.06] text-neutral-400',
            )}
          >
            {attachment.kind === 'pdf' ? (
              <FileText size={16} aria-hidden />
            ) : (
              <ImageIcon size={16} aria-hidden />
            )}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span
          className="truncate text-[13px] leading-tight text-neutral-100"
          title={attachment.file.name}
        >
          {middleTruncate(attachment.file.name)}
        </span>

        <span className="flex min-w-0 items-center gap-1 text-[11px] leading-tight">
          {failed ? (
            <span className="truncate text-red-300/90" title={attachment.error}>
              {attachment.error}
            </span>
          ) : (
            <span className="shrink-0 text-neutral-500">
              {KIND_LABEL[attachment.kind]}
            </span>
          )}
        </span>
      </div>

      {/* 移除键悬停才出，压在卡片右上角外沿——常驻会让每张卡都多一个视觉噪点。 */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t('aiLab.attach.remove', { name: attachment.file.name })}
        className={cn(
          'absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full',
          'border border-white/10 bg-neutral-800 text-neutral-300 shadow-sm',
          'transition-opacity hover:bg-neutral-700 disabled:opacity-40',
          hovered ? 'opacity-100' : 'opacity-0',
          // 键盘用户看不到 hover，聚焦时也要出得来。
          'focus-visible:opacity-100',
        )}
      >
        <X size={11} aria-hidden />
      </button>
    </li>
  );
}

export default function AttachmentChips({
  attachments,
  onRemove,
  notice,
  disabled,
}: {
  attachments: StagedAttachment[];
  onRemove: (id: string) => void;
  /** 越界说明（超上限 / 格式不受理 / 过大）。就地一行，不弹 toast。 */
  notice?: string | null;
  disabled?: boolean;
}) {
  if (attachments.length === 0 && !notice) return null;

  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {attachments.length > 0 && (
        // 多个附件横向排，超出就横向滚——换行会把输入框顶得忽高忽低。
        <ul className="flex items-center gap-2 overflow-x-auto pb-0.5 pt-1.5">
          {attachments.map((a) => (
            <Card
              key={a.id}
              attachment={a}
              disabled={disabled}
              onRemove={() => onRemove(a.id)}
            />
          ))}
        </ul>
      )}
      {notice && <div className="text-[11px] text-amber-300/80">{notice}</div>}
    </div>
  );
}
