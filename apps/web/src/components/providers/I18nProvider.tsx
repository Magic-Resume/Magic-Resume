"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { LANGUAGE_STORAGE_KEY } from "@/i18n";

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
  if (preferred !== "en" && preferred !== "zh") {
    // 无历史偏好：跟随浏览器语言（默认中文站点）。
    const nav = typeof navigator !== "undefined" ? navigator.language : "";
    preferred = nav.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  if (preferred !== i18n.language) {
    void i18n.changeLanguage(preferred);
  }
}

export default function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    restorePreferredLanguage();
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
