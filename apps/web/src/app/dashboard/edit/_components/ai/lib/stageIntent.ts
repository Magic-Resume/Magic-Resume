/**
 * 右舞台此刻需要多大空间。
 *
 * ## 为什么要这一层
 *
 * 宽度原来是 `livingOpen ? '58%' : canvas.open ? '44%' : '0%'`——**宽度被绑在了内容
 * 身份上**：58% 属于活画布、44% 属于工件画布。三个后果，一层比一层深：
 *
 * 1. 切换内容时栏宽跳 14%，而用户并没有要求改变布局
 * 2. 新增第三种右舷内容时，必须再发明一个宽度数字
 * 3. **没有任何一处代码在回答「该给多大空间」**——只有两个开关碰巧组合出三个数
 *
 * 第 3 条是根因，前两条是它的症状。所以这里插一个意图层：内容决定意图，意图决定宽度，
 * 宽度不再认识内容。
 *
 * ## 为什么 assist 与 immerse 暂时不合并
 *
 * 活画布是逐段审阅改动的界面（`ChangesPanel` / `ReviewBar` / `SelectionActionBar`），
 * 58% 可能真有理由。**先引入这一层（无视觉变化、可独立回滚），再拿实测决定要不要合并**
 * ——不要在一次改动里既换结构又改视觉，那样出问题分不清是哪一半。
 *
 * 判据见 `docs/specs/ai-lab-pane-layout/design.md` §4。
 */
export type StageIntent =
  /** AI 不在场 */
  | 'hidden'
  /** 在旁边给东西看（工件画布：分析、报告） */
  | 'assist'
  /** 需要在右舷里干活（活画布：逐段审阅改动） */
  | 'immerse';

/**
 * 唯一决定右舷宽度的地方。
 *
 * 取值与重构前逐值等价——这一步是**纯重构，渲染结果一像素不变**。肉眼若看出差异，
 * 说明映射写错了，那正是这一步要暴露的东西。
 *
 * 未来加窄屏断点也改这里：把它换成读容器宽度的函数即可，调用处一行不动。
 */
export const STAGE_WIDTH: Record<StageIntent, string> = {
  hidden: '0%',
  assist: '44%',
  immerse: '58%',
};

/**
 * 右舷此刻装着谁。**互斥**——右舞台只有一块地方。
 *
 * 是判别联合而不是几个布尔：三个布尔能组合出 8 种状态而只有 4 种合法，多出来的那些
 * 迟早会被某条路径写出来，而且不会报错，只会同时渲染两位住客。
 */
export type StageOccupant =
  | { kind: 'none' }
  /** 活画布：逐段审阅改动 */
  | { kind: 'living' }
  /** 工件画布：分析、报告 */
  | { kind: 'artifact' }
  /** 来源面板：某一条回答用到的网页与记忆 */
  | { kind: 'sources'; messageId: string };

/** 由「右舷此刻装着谁」推出意图。**这是唯一允许内容影响宽度的地方。** */
export function stageIntentOf(occupant: StageOccupant): StageIntent {
  if (occupant.kind === 'living') return 'immerse';
  if (occupant.kind === 'artifact' || occupant.kind === 'sources')
    return 'assist';
  return 'hidden';
}

/**
 * 低于这个视口宽度，44% 的右舷只剩一条缝，来源面板改为**整幅接管**（沿用轨迹页整列
 * 替换对话的那套做法）。
 *
 * 只作用于来源面板：活画布和报告画布的窄屏行为是另一件事，不在这次范围里顺手改掉。
 *
 * 阈值仍是估计值——真正的分界要拿窄窗口实测（见
 * `docs/specs/search-and-citations/design-brief.md` §11-3）。
 */
export const STAGE_TAKEOVER_BREAKPOINT = 1024;

/** 右舷此刻该多宽。宽度仍只由意图决定，窄屏只是多一条接管规则。 */
export function stageWidthOf(occupant: StageOccupant, narrow = false): string {
  if (narrow && occupant.kind === 'sources') return '100%';
  return STAGE_WIDTH[stageIntentOf(occupant)];
}
