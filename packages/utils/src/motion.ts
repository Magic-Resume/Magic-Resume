/**
 * 全项目共用的交互曲线。
 *
 * 取自 `animated-dropdown-recreation` —— 那个项目用 CDP 逐帧采样源站再拟合，
 * 曲线词汇窄得刻意：一条主曲线用了 53 次，其余三条各司一职。我们这边原本把同一个
 * 「快起长落」的意图拼成了四种写法（`.23,1,.32,1` / `.22,1,.36,1` / `.16,1,.3,1` /
 * `.22,.61,.25,1`），读起来像四种不同的动效，其实是同一件事。收成一条。
 *
 * CSS 侧的对应变量在 `apps/web/src/app/globals.css`（`--narrate-ease` / `--exit-ease`
 * / `--state-ease` / `--overshoot-ease`），并经 `@theme` 暴露成 `ease-enter` 等
 * Tailwind 工具类。**改一处必须改另一处。**
 */

type Cubic = [number, number, number, number];

/**
 * 主曲线：进入、展开、位移，凡是「东西出现或长出来」都用它。
 * 快起长落——头几帧就走掉大半距离，剩下的时间用来落定。
 */
export const EASE_ENTER: Cubic = [0.16, 1, 0.3, 1];

/**
 * 退场。比进入短一档，且**不回弹**——退场回弹会读成「它又想开」。
 * 进退不对称是有意的：展开要看清结构，收起时用户已经做完决定了。
 */
export const EASE_EXIT: Cubic = [0.2, 0.8, 0.2, 1];

/**
 * 状态微变：hover 换色、按下、一两个像素的位移。
 * 两头都收着，因为它不该有「飞过来」的观感——东西没有移动，只是变了个样。
 */
export const EASE_STATE: Cubic = [0.4, 0, 0.2, 1];

/**
 * 过冲。第二个控制点 1.56 > 1，中途会越过终点再落回来。
 *
 * **目前全项目没有一处在用**，定义在这里只为把参考的词汇补全。`.impeccable.md`
 * 明写「动效轻快贴元素，仅 transform / opacity，不弹跳」，参考那边也只在一个地方
 * 用过它。要用得是一次明确的决定，不该顺手抄进来。
 */
export const EASE_OVERSHOOT: Cubic = [0.34, 1.56, 0.64, 1];
