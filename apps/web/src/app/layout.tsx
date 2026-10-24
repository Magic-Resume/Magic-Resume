import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

// Brand typeface is loaded from @fontsource-variable/inter in globals.css.
// Keeping it local makes CI and offline production builds deterministic.
import { Toaster } from "sonner";
import { ThemeProvider, themeInitScript } from "@/components/providers/ThemeProvider";
import metaConfig from "@/lib/constants/metaConfig";

import PreloadOptimizer from "@/components/shared/PreloadOptimizer";
import I18nProvider from "@/components/providers/I18nProvider";
import { GlobalErrorListener } from "@/components/providers/GlobalErrorListener";
import { runtimePublicUrl } from "@/lib/config/runtime-public-url";

export async function generateMetadata(): Promise<Metadata> {
  await headers();
  return {
    // The application is a product surface, not the public marketing site. Keep
    // its canonical base on the app host and opt the whole surface out of
    // indexing; landing/docs own the searchable entity pages.
    metadataBase: new URL(runtimePublicUrl()),
    ...metaConfig.Landing,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="hide-scrollbar dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <head>
        <script
          // 水合前落定主题 class,避免浅/深闪烁(FOUC)。
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="font-sans">
        {/* window.onerror / unhandledrejection 的唯一汇聚点。挂在最外层，因为
            它要能收到 Provider 树自己抛出来的东西。 */}
        <GlobalErrorListener />
        <I18nProvider>
          <ThemeProvider>
            {children}
            <Toaster />
            <PreloadOptimizer />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
