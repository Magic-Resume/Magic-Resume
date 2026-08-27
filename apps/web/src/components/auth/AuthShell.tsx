"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from '@magic-resume/icons';
import { BrandMark } from "@/app/dashboard/_components/BrandMark";
import { useTheme } from "@/components/providers/ThemeProvider";
import { setPreferredLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * 认证页外壳:单列居中、深色工作台(浅色为日光实验台),入场轻 stagger。
 * 「就地」——邮箱/验证等步骤在 children 内部切换,外壳不动。见 brief §4/§6。
 */
export function AuthShell({
  title,
  switchPrompt,
  switchHref,
  switchLabel,
  mark,
  children,
}: {
  title: string;
  switchPrompt: string;
  switchHref: string;
  switchLabel: string;
  /**
   * Neutral marker id placed on the shell as `data-magic-<mark>`.
   *
   * Sign-in and sign-up share this component, so the id has to come from the
   * caller. It says nothing about what is measured — that lives in the tracking
   * manifest.
   */
  mark?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <main
      className="relative flex min-h-screen items-center justify-center bg-desk px-6 py-16"
      {...(mark ? { [`data-magic-${mark}`]: '' } : {})}
    >
      {/* 深色下一抹极淡 sky 辉光,呼应「黑工作台上的一点光」;浅色下不显。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-[45vh] dark:block"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--glow-sky) 8%, transparent), transparent 70%)",
        }}
      />

      <LanguageToggle />
      <ThemeToggle />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.07 } } }}
        className="relative z-10 flex w-full max-w-[380px] flex-col items-center"
      >
        <motion.div variants={item}>
          <BrandMark size={40} />
        </motion.div>

        <motion.h1
          variants={item}
          className="mt-6 text-center text-[24px] font-semibold tracking-[-0.01em] text-[color:var(--text-primary)]"
          style={{ fontFamily: "var(--font-brand), system-ui, sans-serif" }}
        >
          {title}
        </motion.h1>

        <motion.p variants={item} className="mt-2 text-center text-[13.5px] text-[color:var(--text-muted)]">
          {switchPrompt}{" "}
          <Link
            href={switchHref}
            className="font-medium text-ink-sky transition-colors hover:text-ink-sky-hover"
          >
            {switchLabel}
          </Link>
        </motion.p>

        {/* 步骤区:定位上下文 + 预留高度。各步骤在内部绝对定位、原地 opacity 交叉淡入,
            不参与流式布局 → 切步时本区高度恒定、整列不重排 → logo 绝不移动。
            高度按常见步骤(社交/邮箱/密码)取值;更高的重置步会向下延伸(下方本就空)。 */}
        <motion.div variants={item} className="relative mt-9 w-full" style={{ minHeight: 188 }}>
          {children}
        </motion.div>
      </motion.div>
    </main>
  );
}

/**
 * 语言切换。**两个语种就不该做成下拉**——菜单是为了藏起长列表，这里只有两项，
 * 藏起来的代价是多一次点击和一次「里面有什么」的猜测。分段控件把两个选项和当前
 * 状态一次说完。
 *
 * 摆在左上角，和右上角的主题开关对称：都是「这一页的设置」，不是登录流程的一步，
 * 所以都留在卡片之外。
 */
function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  // 首屏 SSR 与客户端首渲染同为 zh（见 `src/i18n.ts` 的注释），偏好在水合后的
  // effect 里才应用——所以这里直接读 `i18n.language` 不会造成 hydration mismatch。
  const current = (i18n.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";

  return (
    <div
      role="group"
      aria-label={t("auth.language")}
      className="absolute left-5 top-5 inline-flex h-9 items-center rounded-lg border border-hairline bg-raised p-0.5"
    >
      {(["zh", "en"] as const).map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setPreferredLanguage(code)}
            aria-pressed={active}
            className={cn(
              "relative h-8 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-sky/40",
              active
                ? "text-[color:var(--text-primary)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
            )}
          >
            {active && (
              // 共享 `layoutId`：滑块在两个语种之间**滑过去**，而不是在这边消失、
              // 那边出现——切换才读得出是同一个开关移动了位置。
              <motion.span
                layoutId="auth-language-pill"
                transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 0.61, 0.25, 1] }}
                className="absolute inset-0 rounded-[7px] bg-sunk"
              />
            )}
            <span className="relative">{code === "zh" ? "中文" : "EN"}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light" : "Switch to dark"}
      className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-raised text-[color:var(--text-secondary)] transition-colors hover:border-strong"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
