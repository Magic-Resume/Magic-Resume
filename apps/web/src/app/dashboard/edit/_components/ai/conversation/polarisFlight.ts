/**
 * 「欢迎态大宠 → 输入框工位小宠」那一跳的起点交接。
 *
 * 两端是不同子树里的两个节点，起点那个在终点挂载前就已卸载，所以没法在同一帧里
 * 同时量到。这里用一个模块级的暂存：欢迎态在场时持续记录自己的位置，工位挂载时
 * 取走它算出位移。
 *
 * 为什么不用 framer-motion 的 `layoutId`：那是布局动画，每帧都要在 JS 里重算投影
 * 再写回样式，**上不了合成器**。而这一跳恰好触发在最忙的一帧——同一时刻还在挂载
 * 整个 ChatThread、发起请求、开始解析 SSE 流，动画和它们抢同一个帧预算，第一次
 * 必卡。换成纯 transform 的 FLIP 之后动画交给合成器，主线程再忙也不掉帧；顺带
 * 还能给 x / y 各配一条曲线，做出真正的抛物线（layoutId 只能两点直线插值）。
 */

export type FlightOrigin = { x: number; y: number; size: number };

let origin: FlightOrigin | null = null;

/** 欢迎态的宠物在场时持续上报自己的位置（中心点 + 边长）。 */
export function setFlightOrigin(next: FlightOrigin | null): void {
  origin = next;
}

/**
 * 取走起点并清空——一次转场只用一次。不清的话「新对话」回到欢迎态再进来时，
 * 会拿到一个早已失效的旧坐标，宠物从屏幕外某处飞进来。
 */
export function takeFlightOrigin(): FlightOrigin | null {
  const taken = origin;
  origin = null;
  return taken;
}
