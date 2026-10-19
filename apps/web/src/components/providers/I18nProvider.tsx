"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { LANGUAGE_STORAGE_KEY, applyLanguage } from "@/i18n";

interface I18nProviderProps {
  children: React.ReactNode;
}

/** 水合后恢复用户上次选择的语言，并同步 <html lang>。 */
function restorePreferredLanguage() {
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级。
  }
  // 无历史偏好：跟随浏览器语言（默认中文站点）。
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  const language =
    preferred === "en" || preferred === "zh"
      ? preferred
      : nav.toLowerCase().startsWith("zh")
        ? "zh"
        : "en";
  if (language !== i18n.language) {
    void applyLanguage(language);
  }
}

export default function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    restorePreferredLanguage();
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
