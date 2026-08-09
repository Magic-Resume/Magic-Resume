import React from 'react';
import { cn } from '@/lib/utils';
import type { ModelProvider } from '@/lib/constants/modals';

/**
 * 服务商品牌标。**唯一**一处渲染 /public/providers/{id}.svg 的地方——设置页的服务商
 * 下拉和 AI Lab 的模型标都走它，所以两边永远是同一批图标、同一套配色规则。
 *
 * 走 CSS mask 而不是 <img>：mask 吃的是 alpha 通道，颜色由 CSS 决定，于是
 * 「单色品牌跟随文字色、其余用品牌色」这条规则可以是数据驱动的（`monochrome`
 * 字段），而不是散在组件里的 if。
 *
 * House rule：SVG 标记留在 public/，不进 JSX。
 */
export function ProviderMark({
  provider,
  size = 16,
  className,
}: {
  provider: ModelProvider;
  size?: number;
  className?: string;
}) {
  const mask = `url(/providers/${provider.id}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0', className)}
      style={{
        width: size,
        height: size,
        // 单色品牌（OpenAI / xAI / Kimi / OpenRouter）的真实 logo 是纯黑或纯白，
        // 钉死任何一个都会在另一个主题下消失。跟随 currentColor 让它自动翻面。
        backgroundColor: provider.monochrome ? 'currentColor' : provider.brandColor,
        mask,
        WebkitMask: mask,
      }}
    />
  );
}
