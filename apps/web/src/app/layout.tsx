import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';

// Brand typeface is loaded from @fontsource-variable/inter in globals.css.
// Keeping it local makes CI and offline production builds deterministic.
import { Fragment } from "react";
import { Toaster } from "sonner";
import { ThemeProvider, themeInitScript } from "@/components/providers/ThemeProvider";
import metaConfig from "@/lib/constants/metaConfig";
import { isCloudMode } from "@/lib/config/app";

import PreloadOptimizer from "@/components/shared/PreloadOptimizer";
import I18nProvider from "@/components/providers/I18nProvider";
import { HttpClientProvider } from "@/components/providers/HttpClientProvider";
import { GlobalErrorListener } from "@/components/providers/GlobalErrorListener";
import { CommercialRuntimeProvider } from "@/lib/commercial/runtime";
import { RuntimeEnvScript } from "@/lib/commercial/runtime-env";
import { runtimePublicUrl } from "@/lib/config/runtime-public-url";
import { CloudAuthBridge } from "@/lib/auth";
import { NotificationRealtimeProvider } from "@/components/providers/NotificationRealtimeProvider";

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

// Provider tree (cloud):    ClerkProvider → CloudAuthBridge → HttpClientProvider → ...
// Provider tree (self-hosted): Fragment → HttpClientProvider → ... (default context)
// CloudAuthBridge MUST wrap HttpClientProvider so getToken is available from context.
const AuthWrapper = isCloudMode ? ClerkProvider : Fragment;
// Global backstop for every sign-out path: whatever calls Clerk's signOut (the
// account menu goes through CloudAuthBridge, but a bare signOut() would fall
// back to Clerk's default of '/'), it lands on /sign-in rather than '/', whose
// server component can bounce a just-signed-out user back into the app. Spread
// conditionally so the self-hosted Fragment receives no stray prop.
const authWrapperProps = isCloudMode ? { afterSignOutUrl: '/sign-in' } : {};
const AuthBridge = isCloudMode ? CloudAuthBridge : Fragment;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthWrapper {...authWrapperProps}>
      <AuthBridge>
        <HttpClientProvider>
          <html lang="zh-CN" className="hide-scrollbar dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
            <head>
              <script
                // 水合前落定主题 class,避免浅/深闪烁(FOUC)。
                dangerouslySetInnerHTML={{ __html: themeInitScript }}
              />
            </head>
            <body className="font-sans">
              {/* Runtime API origin → window.__ENV, injected before any client
                  bundle reads it. Kept OUT of CommercialRuntimeProvider because
                  the commercial overlay replaces that module — see runtime-env.tsx. */}
              <RuntimeEnvScript />
              {/* window.onerror / unhandledrejection 的唯一汇聚点。挂在最外层，因为
                  它要能收到 Provider 树自己抛出来的东西。 */}
              <GlobalErrorListener />
              <CommercialRuntimeProvider>
                <I18nProvider>
                  <ThemeProvider>
                    <NotificationRealtimeProvider>
                      {children}
                      <Toaster />
                      <PreloadOptimizer />
                    </NotificationRealtimeProvider>
                  </ThemeProvider>
                </I18nProvider>
              </CommercialRuntimeProvider>
            </body>
          </html>
        </HttpClientProvider>
      </AuthBridge>
    </AuthWrapper>
  );
}
