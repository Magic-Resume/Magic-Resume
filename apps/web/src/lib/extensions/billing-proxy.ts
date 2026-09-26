import { NextResponse } from 'next/server';

/**
 * Billing passthrough slot — the open-source build has no billing backend.
 *
 * The commercial build replaces this module with the commercial billing
 * package, which forwards the caller's token to the platform API. The routes
 * under `app/api/billing/` stay in the open-source tree and call this, so a
 * self-hosted deployment answers them with a plain 404 instead of the route
 * disappearing at build time or failing on a missing upstream.
 */
export async function proxyBilling(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  void path;
  void init;
  return NextResponse.json(
    { error: 'Billing is not available in this build' },
    { status: 404 },
  );
}

/**
 * 槽位哨兵：**只有开源桩导出它**，commercial overlay 换进来之后读不到。
 *
 * `instrumentation.ts` 的断言据此判断槽是不是真的被替换了。没有它，overlay 接错
 * 的表现是付费墙悄悄消失而不报错——Turbopack 不识别 `webpack()` 钩子正是这种错法。
 */
export const OSS_SLOT_SENTINEL = true;
