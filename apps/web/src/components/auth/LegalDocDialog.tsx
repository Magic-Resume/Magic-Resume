"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, X } from "@magic-resume/icons";

export type LegalDocId = "terms" | "privacy";

/**
 * 条款 / 隐私正文的**就地**阅读窗。
 *
 * 这两个链接原来是 `target="_blank"`：让人读一份自己正要同意的东西，代价是把半填的
 * 登录表单丢在另一个标签页背后——而这一步恰恰最不该被打断。就地打开、读完关掉，
 * 光标还在原处（设计原则 ④「就地而非另开」）。
 *
 * 正文用 `<iframe>` 装同源的既有路由，而**不是**把文本搬进这个组件：这个仓库里根本
 * 没有条款正文。`lib/extensions/legal.tsx` 在开源构建里直接 `notFound()`，真正的正文
 * 由商业构建覆盖同一个模块提供。iframe 让弹窗对正文一无所知也能显示它——开源构建里
 * 显示的是 404，那是诚实的：那份部署确实没有我们的条款。
 *
 * 仍留一个「新标签页打开」：要打印、要留着慢慢读的人应该拿得到整页。
 */
export function LegalDocDialog({
  doc,
  onOpenChange,
}: {
  /** `null` = 关闭。切换文档时 key 会换，加载态随之重置。 */
  doc: LegalDocId | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [loaded, setLoaded] = React.useState(false);

  // 换一份文档要重新等加载：不重置的话，上一份留下的 `loaded` 会让新的一份在还没
  // 渲染出来时就显形，看到的是一闪的空白页。
  React.useEffect(() => setLoaded(false), [doc]);

  // 语言跟着界面走。英文界面读中文条款是当场的挫败，而这两份文档本来就有各自的路由。
  const zh = (i18n.language || "zh").toLowerCase().startsWith("zh");
  const href = doc ? (zh ? `/legal/${doc}` : `/legal/en/${doc}`) : "";
  const title = doc === "privacy" ? t("auth.terms.docPrivacy") : t("auth.terms.docTerms");

  return (
    <Dialog.Root open={Boolean(doc)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 0.61, 0.25, 1] }}
            className="fixed left-1/2 top-1/2 z-[211] flex h-[min(78vh,760px)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[14px] border border-hairline bg-raised shadow-overlay outline-none"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3.5">
              <Dialog.Title className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[color:var(--text-primary)]">
                {title}
              </Dialog.Title>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text-secondary)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("auth.terms.openInNewTab")}
              </a>
              <Dialog.Close
                aria-label={t("auth.terms.close")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[color:var(--text-muted)] transition-colors hover:bg-sunk hover:text-[color:var(--text-secondary)]"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="relative flex-1">
              {doc ? (
                <iframe
                  key={`${doc}-${zh ? "zh" : "en"}`}
                  src={href}
                  title={title}
                  onLoad={() => setLoaded(true)}
                  className="h-full w-full border-0 bg-desk"
                />
              ) : null}
              {!loaded ? (
                <div className="absolute inset-0 grid place-items-center bg-raised">
                  <Loader2 className="h-5 w-5 animate-spin text-[color:var(--text-muted)]" />
                </div>
              ) : null}
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
