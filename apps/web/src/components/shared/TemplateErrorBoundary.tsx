"use client";

import React from "react";
import { useTranslation } from "react-i18next";

/**
 * 模板渲染的错误边界。
 *
 * ## 为什么必须有
 *
 * 此前整个仓库**没有任何错误边界**：模板渲染一抛异常，React 卸载整棵树，
 * 用户的编辑器直接白屏——而他刚打了半小时的字还在 store 里，只是看不见了。
 *
 * 今天这个风险还小，因为模板是我们手写、评审过的代码。但模板系统的方向是
 * **让 AI 生成模板**，那时「AI 吐了一棵坏树 → 用户的编辑器没了」会是日常。
 * 所以这道边界要**在开放生成之前**就位，而不是出事之后补。
 *
 * ## 为什么不吞掉错误
 *
 * `onError` 仍然把异常往上报（默认 `console.error`）。边界的职责是**别让局部故障
 * 变成全局故障**，不是让故障消失——静默的渲染失败比白屏更难查。
 */

interface Props {
  children: React.ReactNode;
  /** 兜底 UI。不给就用下面那块最简提示。 */
  fallback?: React.ReactNode;
  /** 变化时重置边界——例如换了模板，应当再试一次而不是一直卡在错误态。 */
  resetKey?: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class TemplateErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 上报，不吞。静默失败比白屏更难查。
    if (this.props.onError) this.props.onError(error, info);
    else console.error("[template] 渲染失败", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // 换了模板/数据就再试一次，否则用户会一直卡在错误态里，
    // 连"换个模板"这个最自然的自救动作都没有效果。
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <TemplateRenderFailed />;
  }
}

/** 兜底 UI 单独拆出来，因为类组件用不了 `useTranslation`。 */
function TemplateRenderFailed() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <p className="text-[14px] text-neutral-300">
          {t("templateError.title")}
        </p>
        {/* 说清楚「你的内容还在」——用户看到空白页第一反应是数据没了。 */}
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          {t("templateError.description")}
        </p>
      </div>
    </div>
  );
}
