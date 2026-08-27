'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FolderOpen, Trash2 } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MaskIcon } from '@/components/icons/MaskIcon';
import { SidebarNav } from '@magic-resume/genui/beautiful';
import {
  conversationApi,
  type ConversationSummary,
} from '@/lib/api/conversationApi';

/**
 * 历史对话抽屉。
 *
 * 浮层而不是推挤式：画布展开时对话栏只剩 ~42% 宽，再切 280px 出去卡片会被压变形。
 * 浮层让「画布开没开」与这里彻底无关，不用写一套折叠联动。
 *
 * 两种寿命，同一个面：
 * - **窥视**（左缘悬停）：无遮罩、不吃点击，指针一走就收。它要足够轻，轻到误触也不烦。
 * - **钉住**（点按钮）：有遮罩，Esc / 点外部才关。要慢慢翻的时候用这个。
 */

/** 左缘热区宽度。再宽会在用户只是把指针甩到左边时频繁触发。 */
const EDGE_PX = 14;
/** 停留多久才算「想开」。路过不算——这是边缘触发最招人烦的那一类误触。 */
const OPEN_DELAY_MS = 160;
/** 指针离开后的宽限。太短会在用户伸手去够抽屉的路上把它收走。 */
const CLOSE_DELAY_MS = 240;
/** 头部高度，热区从它下面才开始：避开左上角（系统热区）与面板头。 */
const HEADER_PX = 68;

export default function ConversationHistory({
  resumeId,
  resumeName,
  currentId,
  onPick,
  onNewChat,
  onOpenAssets,
  busy,
}: {
  resumeId: string;
  /** 抽屉头部写简历名——「只列这份简历」必须在列表所在的地方说明。 */
  resumeName: string;
  currentId: string | null;
  onPick: (id: string) => void;
  onNewChat: () => void;
  /** 打开内嵌的资产库面板。不给就不显示那条入口。 */
  onOpenAssets?: () => void;
  /** 有任务在跑。切走会中断，需要确认——**这个确认是真的**。 */
  busy: boolean;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'closed' | 'peek' | 'pinned'>('closed');
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<string | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = mode !== 'closed';

  // 面板挂载就取，不等用户点开。**抽屉必须瞬开**——它已经放弃了「一眼看到历史」，
  // 若再加一次转圈就彻底不值得开了。
  useEffect(() => {
    let alive = true;
    conversationApi
      .list(resumeId)
      .then((list) => alive && setItems(list))
      // 取不到**不清空当前会话**：用户还在这场对话里，把它弄没了比看不到历史糟得多。
      .catch(() => alive && setItems([]))
      .finally(() => {
        if (!alive) return;
      });
    return () => {
      alive = false;
    };
    // currentId 变化 = 换了会话，列表要跟着重取（刚收尾的那场该出现在里面）。
  }, [resumeId, currentId]);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  // 左缘热区。用 window 上的 pointermove 而不是一个透明 div：那个 div 会挡住
  // 它覆盖范围内的一切点击，而这条边正好压在对话内容上。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // 触摸屏没有 hover，硬当 hover 处理会变成「碰哪儿弹哪儿」。
      if (e.pointerType !== 'mouse') return;
      const inZone = e.clientX <= EDGE_PX && e.clientY >= HEADER_PX;
      if (inZone) {
        if (openTimer.current || mode !== 'closed') return;
        openTimer.current = setTimeout(() => {
          openTimer.current = null;
          setMode((m) => (m === 'closed' ? 'peek' : m));
        }, OPEN_DELAY_MS);
      } else if (openTimer.current) {
        clearTimeout(openTimer.current);
        openTimer.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'pinned') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode('closed');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const close = useCallback(() => {
    clearTimers();
    setMode('closed');
    setConfirmDelete(null);
    setPendingPick(null);
  }, []);

  /** 窥视态下指针移开就收。**有未决的确认时不收**——那个框会在伸手的路上消失。 */
  const scheduleClose = () => {
    if (mode !== 'peek' || confirmDelete || pendingPick) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMode('closed'), CLOSE_DELAY_MS);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const pick = (id: string) => {
    if (busy) {
      setPendingPick(id);
      return;
    }
    close();
    onPick(id);
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    setItems((prev) => (prev ?? []).filter((c) => c.id !== id));
    await conversationApi.remove(id).catch(() => undefined);
  };

  const [query, setQuery] = useState('');

  /**
   * 资产库的快捷入口。`SidebarNav` 只认「选中了哪个 key」，所以用一个不可能与会话 id
   * 相撞的哨兵键，在 `onSelect` 里先拦一道。
   *
   * **不跳转**：AI Lab 里点它就在本页开一块内嵌面板（`onOpenAssets`），符合「就地而非
   * 另开」。跳到 /dashboard/assets 会把用户从对话里踢出去，而他多半只是想回头看一眼。
   */
  const ASSETS_KEY = '__assets__';

  /**
   * 分组 + 搜索 → `SidebarNav` 的 sections。
   *
   * 删除确认是**行内变形**（整行文案换成「删掉这条？」，右边出现取消/删除两颗），
   * 不弹模态——删一场对话弹模态太重，而直接删又没有后悔的余地。`SidebarItem` 的
   * `labelNode` / `trailing` 两个插槽就是为这种形态留的。
   */
  const needle = query.trim().toLowerCase();
  const sections = groupByTime(
    (items ?? []).filter(
      (item) =>
        !needle || (item.title ?? '').toLowerCase().includes(needle),
    ),
  ).map(([label, group]) => ({
    key: label,
    label: t(`aiLab.history.group.${label}`),
    items: group.map((item) => {
      const confirming = confirmDelete === item.id;
      return {
        key: item.id,
        label: item.title || t('aiLab.history.untitled'),
        labelNode: confirming ? (
          <span className="text-neutral-400">{t('aiLab.history.confirmDelete')}</span>
        ) : undefined,
        trailing: confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <span
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmDelete(null);
              }}
              className="rounded-md px-1.5 py-0.5 text-[12px] text-neutral-400 transition-colors hover:text-white"
            >
              {t('common.cancel')}
            </span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                void remove(item.id);
              }}
              className="rounded-md px-1.5 py-0.5 text-[12px] text-rose-400 transition-colors hover:text-rose-300"
            >
              {t('aiLab.history.delete')}
            </span>
          </span>
        ) : (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t('aiLab.history.delete')}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmDelete(item.id);
            }}
            /* `opacity-0` **不会**挡住点击——透明元素照样吃事件。少了
               `pointer-events-none`，这颗看不见的垃圾桶就压在行的右侧：触摸和快速点击
               没有 hover 这一拍，一下就落在它身上，用户以为自己在切换对话，实际点开了
               删除确认。可见才可点。 */
            className="pointer-events-none shrink-0 rounded-md p-1 text-neutral-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          >
            <Trash2 size={13} />
          </span>
        ),
      };
    }),
  }));

  return (
    <>
      {/* 常驻，不做 hover 才出：触摸与键盘只有这一条路。字形用 ▤ 而不是时钟——
        ▤ 是「这儿有个侧栏」的既有约定，时钟会被读成「时间线」。 */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'pinned' ? 'closed' : 'pinned'))}
        aria-label={t('aiLab.history.toggle')}
        title={t('aiLab.history.toggle')}
        aria-expanded={open}
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors cursor-pointer',
          open ? 'text-white' : 'text-neutral-500 hover:text-white',
        )}
      >
        <MaskIcon src="/marks/sidebar.svg" size={20} className="block" />
      </button>

      <AnimatePresence>
        {/* 遮罩只在钉住时出。窥视要是也压一层暗，每次误触都会闪一下。 */}
        {mode === 'pinned' && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={close}
            className="absolute inset-0 z-40 bg-black/40"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="drawer"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            className="absolute inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-white/[0.06] bg-neutral-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            {/* 抽屉外壳（左缘窥视 / 钉住 / 遮罩）留在这一层，只有内容换成 SidebarNav：
                窥视是这个面板最好用的地方，而常驻左导航壳里没有这个概念。 */}
            <SidebarNav
              embedded
              className="min-h-0 flex-1"
              workspace={{ name: resumeName }}
              action={{
                label: t('aiLab.header.newChat'),
                // 与历史条目同分量：一屏里唯一的彩色元素会压过整列历史，
                // 而「新建」并不比「打开哪一条」更重要。图标沿用换掉之前那个。
                quiet: true,
                icon: <MaskIcon src="/marks/compose.svg" size={18} />,
                onClick: () => {
                  close();
                  onNewChat();
                },
              }}
              search={{
                value: query,
                onChange: setQuery,
                placeholder: t('aiLab.history.search'),
              }}
              activeKey={currentId ?? undefined}
              onSelect={(id: string) => {
                if (id === ASSETS_KEY) {
                  close();
                  onOpenAssets?.();
                  return;
                }
                pick(id);
              }}
              sections={[
                ...(onOpenAssets
                  ? [
                      {
                        key: 'assets',
                        items: [
                          {
                            key: ASSETS_KEY,
                            label: t('aiLab.assets.title'),
                            icon: <FolderOpen size={18} />,
                          },
                        ],
                      },
                    ]
                  : []),
                ...sections,
              ]}
              footer={
                items === null ? (
                  <SkeletonRows />
                ) : sections.length === 0 ? (
                  <p className="px-2.5 py-2 text-[12px] text-neutral-500">
                    {query
                      ? t('aiLab.history.searchEmpty')
                      : t('aiLab.history.empty')}
                  </p>
                ) : null
              }
            />

            {/*
              切走会中断正在跑的任务——**这个确认是真的**，与「新对话」那个
              （上云后旧对话进历史、什么都没丢）不同。
            */}
            <AnimatePresence>
              {pendingPick && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.16 }}
                  className="border-t border-white/[0.06] p-3"
                >
                  <p className="text-[12px] leading-relaxed text-neutral-300">
                    {t('aiLab.history.switchWhileBusy')}
                  </p>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingPick(null)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] text-neutral-400 transition-colors hover:text-white cursor-pointer"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = pendingPick;
                        close();
                        onPick(id);
                      }}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-[12px] text-white transition-colors hover:bg-white/[0.12] cursor-pointer"
                    >
                      {t('aiLab.history.switchAnyway')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

/** 骨架行而不是转圈：列表几乎总有内容，先把形状摆出来，别让抽屉开出一个空洞。 */
function SkeletonRows() {
  return (
    <div className="space-y-1.5 pt-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded-xl bg-white/[0.04]"
          style={{ width: `${88 - i * 14}%` }}
        />
      ))}
    </div>
  );
}

type Group = 'today' | 'week' | 'earlier';

/** 按 今天 / 本周 / 更早 分组——与主流对话应用一致，用户不用学。 */
function groupByTime(
  items: ConversationSummary[],
): Array<[Group, ConversationSummary[]]> {
  const now = Date.now();
  const day = 86_400_000;
  const buckets: Record<Group, ConversationSummary[]> = {
    today: [],
    week: [],
    earlier: [],
  };
  for (const item of items) {
    const age = now - new Date(item.updatedAt).getTime();
    if (age < day) buckets.today.push(item);
    else if (age < 7 * day) buckets.week.push(item);
    else buckets.earlier.push(item);
  }
  return (
    Object.entries(buckets) as Array<[Group, ConversationSummary[]]>
  ).filter(([, group]) => group.length > 0);
}
