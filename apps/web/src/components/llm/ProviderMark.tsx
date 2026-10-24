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
  return (
    <BrandMark
      file={provider.id}
      // 单色品牌（OpenAI / xAI / Kimi / OpenRouter）的真实 logo 是纯黑或纯白，
      // 钉死任何一个都会在另一个主题下消失。跟随 currentColor 让它自动翻面。
      color={provider.monochrome ? 'currentColor' : provider.brandColor}
      size={size}
      className={className}
    />
  );
}

/**
 * 渲染 `/public/providers/{file}.svg` 的那一层，不认识任何业务类型。
 *
 * 抽出来是因为社交账户（GitHub / Google）要用同一套渲染规则，而它拿到的是 Clerk 的
 * provider 字符串，不是 `ModelProvider`。两处共用一个实现，图标与配色规则才不会分叉。
 */
export function BrandMark({
  file,
  color,
  size = 16,
  className,
}: {
  /** `/public/providers/{file}.svg` 里的文件名（不含扩展名） */
  file: string;
  /** 任意 CSS 颜色；`currentColor` 表示跟随文字色 */
  color: string;
  size?: number;
  className?: string;
}) {
  const mask = `url(/providers/${file}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        mask,
        WebkitMask: mask,
      }}
    />
  );
}
