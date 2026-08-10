'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getProvider, resolveProviderIdFromModel } from '@/lib/constants/modals';
import { ProviderMark } from '@/components/llm/ProviderMark';

/**
 * 输入框里的模型标：一个下沉的小圆盘 + 该模型所属服务商的品牌标。
 *
 * 图标不在这里画——`resolveProviderIdFromModel` 把模型名认到服务商，再交给
 * {@link ProviderMark} 渲染 /public/providers/{id}.svg。设置页的服务商下拉用的是
 * 同一批文件，所以两处永远不会出现「同一家两个样子」。
 *
 * 认不出来（模型目录由后端下发、BYOK 更是随便填）就退回中性 sparkle，不硬猜。
 */
export default function ModelMark({
  model,
  /** 「自动」这类没有具体模型的态：系统替你挑，用中性的 sparkle 表达。 */
  generic,
  size = 28,
  className,
}: {
  model: string;
  generic?: boolean;
  size?: number;
  className?: string;
}) {
  const providerId = generic ? null : resolveProviderIdFromModel(model);
  const provider = providerId ? getProvider(providerId) : undefined;
  const glyphSize = Math.round(size * 0.56);

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.06]',
        // 单色标跟随文字色 —— 让 ProviderMark 的 currentColor 落到一个能读的值上。
        provider?.monochrome !== false && 'text-neutral-200',
        className
      )}
      style={{
        width: size,
        height: size,
        // 盘底用品牌色极淡染，小尺寸下也能一眼分出是哪家。
        background: provider && !provider.monochrome
          ? `color-mix(in oklab, ${provider.brandColor} 16%, var(--surface-sunk))`
          : 'var(--surface-sunk)',
      }}
    >
      {provider ? (
        <ProviderMark provider={provider} size={glyphSize} />
      ) : (
        <Sparkles size={glyphSize} className="text-sky-300/90" />
      )}
    </span>
  );
}
