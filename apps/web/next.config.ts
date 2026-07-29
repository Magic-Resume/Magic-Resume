import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Magic-Resume commercial overlay alias. Roots are provided only by private commercial builds.
  webpack: (config, { webpack }) => {
    const runtimeRoot = process.env.MAGIC_RESUME_COMMERCIAL_RUNTIME_ROOT;
    const billingRoot = process.env.MAGIC_RESUME_COMMERCIAL_BILLING_ROOT;
    if (!runtimeRoot && !billingRoot) return config;

    const slots: Record<string, string> = {};
    if (runtimeRoot) {
      slots['@/lib/commercial/runtime'] = path.join(runtimeRoot, 'src/runtime.tsx');
      slots['@/lib/extensions/app-lifecycle'] = path.join(runtimeRoot, 'src/app-lifecycle.ts');
    }
    if (billingRoot) {
      slots['@/lib/extensions/billing-client'] = path.join(billingRoot, 'src/billing-client.ts');
      slots['@/lib/extensions/billing-ui'] = path.join(billingRoot, 'src/billing-ui.tsx');
      slots['@/lib/extensions/billing-proxy'] = path.join(billingRoot, 'src/billing-proxy.ts');
    }

    // Replacement at the module-factory stage, not `resolve.alias`. These
    // requests start with `@/`, which tsconfig `paths` already claims, and
    // Next's JsConfigPathsPlugin resolves it during `described-resolve` —
    // before AliasPlugin ever runs. An alias keyed on `@/lib/...` is therefore
    // dead code: it never matches, and the slot silently stays on its
    // open-source stub.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^@\/lib\/(commercial\/runtime|extensions\/(app-lifecycle|billing-client|billing-ui|billing-proxy))$/,
        (resource: { request: string }) => {
          const target = slots[resource.request];
          if (target) resource.request = target;
        }
      )
    );
    return config;
  },
  output: "standalone",
  transpilePackages: ['@magic-resume/resume-templates'],
  
  // 图片优化
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: '',
        pathname: '/**',
      }
    ],
    // 优化图片格式
    formats: ['image/avif', 'image/webp'],
    // 启用图片优化
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // 编译优化
  compiler: {
    // 移除console.log (仅生产环境)
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false,
  },

  // Turbopack配置（现在是稳定功能）
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // 实验性功能
  experimental: {
    // 优化包导入
    optimizePackageImports: [
      'react-icons',
      'lucide-react',
      '@radix-ui/react-icons',
      'framer-motion',
      '@langchain/core',
    ],
    viewTransition: true,
  },

  // Webpack优化暂时禁用，避免构建错误

  // 静态资源优化
  assetPrefix: process.env.NODE_ENV === 'production' ? undefined : undefined,
  
  // 启用gzip压缩
  compress: true,

  // PoweredByHeader
  poweredByHeader: false,

  // React严格模式
  reactStrictMode: true,

  // 生产环境源码映射（调试用，可关闭以减小体积）
  productionBrowserSourceMaps: false,

  // SWC minification 现在是默认启用的，无需显式配置

  // 后端统一走单一 origin（NEXT_PUBLIC_API_URL）+ 本地网关；
  // 不再用 next.config 注入 BACKEND_URL，也不再做 interview 路径转发。
};

export default nextConfig;
