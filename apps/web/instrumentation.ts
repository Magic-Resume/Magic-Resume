/**
 * Commercial overlay 的槽位自检。
 *
 * overlay 不是运行时开关，是 bundler 在**解析阶段**把 `@/lib/extensions/*` 换成商业包
 * 的实现。这种替换一旦没生效，**没有任何报错**：槽安静地停在开源桩上，付费墙、法务
 * 文案、埋点一起消失，而页面照常渲染。Turbopack 不识别 `next.config.ts` 里的
 * `webpack()` 钩子，正是这种错法——所以配了 overlay 就必须验一次。
 *
 * 判据是桩独有的哨兵（`OSS_SLOT_SENTINEL`）：还读得到，就是没换成功。
 */
export async function register() {
  // 只在 Node 运行时验一次。edge 那份是同一套解析结果，验两遍只是重复报同一件事。
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // 跟 next.config.ts 的 `commercialOptIn()` 同一道门：dev 下没带 `--commercial`
  // 时槽本来就该留在开源桩上，那不是故障。
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.MAGIC_RESUME_COMMERCIAL !== '1'
  ) {
    return;
  }

  // 按 root 分别判定：只配了 legal root 时，billing 槽留在桩上是正确的。
  if (!process.env.MAGIC_RESUME_COMMERCIAL_BILLING_ROOT) return;

  const slot = await import('@/lib/extensions/billing-proxy');
  if ('OSS_SLOT_SENTINEL' in slot) {
    throw new Error(
      '[overlay] MAGIC_RESUME_COMMERCIAL_BILLING_ROOT is set, but ' +
        '@/lib/extensions/billing-proxy still resolves to the open-source stub — ' +
        'the slot replacement never ran. Billing would answer 404 and the paywall ' +
        'would silently disappear. Check the slot wiring in next.config.ts; note ' +
        'that Turbopack does not read the webpack() hook.',
    );
  }
}
