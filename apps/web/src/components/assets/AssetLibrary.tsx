'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Copy, Search, Sparkles } from '@magic-resume/icons';
import {
  ASSET_TYPES,
  EXTRA_ASSET_KINDS,
  archiveAsset,
  clearBoard,
  deleteAsset,
  keepAsset,
  listAssets,
  listExtraAssets,
  type AssetType,
  type ExtraAssetKind,
  type LibraryAsset,
} from '@/lib/api/workspace';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { interviewApi, type ArchivedInterview } from '@/lib/api/interviewApi';
import AssetPreview from './AssetPreview';

/**
 * 资产库。**master-detail，不是表格**：用户不横向比较资产，他找到一条然后读它，
 * 所以正文占主、列表退成一条窄栏。用表格会把正文挤成一行摘要，正好挤掉主行动。
 *
 * 一份实现两处用：`/dashboard/assets` 整页，和 AI Lab 里的内嵌面板。区别只有两点——
 * 内嵌时不显示自己的标题（外壳已经有了），且「拿它优化简历」**不跳转**，直接把引用
 * 填进当轮对话的输入框。就地，而非另开。
 *
 * 完整设计见 `docs/specs/asset-library/brief.md`。
 */

export type AssetLibraryProps = {
  /** 给了就默认只看这份简历的资产，并给一条「查看全部」。 */
  scopedResumeId?: string | null;
  /** 内嵌在 AI Lab 里：省掉标题行，主行动改成就地填输入框。 */
  embedded?: boolean;
  /** 内嵌时的主行动。给了就不跳转。 */
  onUse?: (prompt: string) => void;
};

/** 少于这个天数就换成「明天 / 今天」，并把圆点转成警示色。 */
const URGENT_DAYS = 2;
/** 后端硬上限是 500，接近时提前说，别等发布失败才提。 */
const NEAR_LIMIT = 450;

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function AssetLibrary({
  scopedResumeId = null,
  embedded = false,
  onUse,
}: AssetLibraryProps = {}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  /**
   * 默认只看 `scopedResumeId` 那一份。
   *
   * 从对话里进来，用户想的是「刚才那份调研」，不是全账号的库；从 dashboard 侧栏进来
   * 不带这个参数，看全部。同一份实现、两种默认视角。
   */
  const [scoped, setScoped] = useState(true);

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /**
   * 哪些组被展开了全部。
   *
   * 不持久化：每次进来看到「最近三场 + 还有 12 场」是对的默认——用户来这儿是找东西，
   * 不是接着上次的浏览位置。
   */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<LibraryAsset | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 窄屏是单栏推入，不是抽屉——抽屉盖在列表上，而这里用户要专心读内容。
  const [mobileReading, setMobileReading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    // 产物是主体，投递面板与面试记录是另外两类。产物取不到才算这张页面挂了——
    // 后两类取不到只是少两行，不该把整个资产库变成一句「加载失败」。
    listAssets()
      .then(async (artifacts) => {
        setAssets(artifacts);
        setAssets([...artifacts, ...(await listExtraAssets().catch(() => []))]);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  /**
   * 行标题。投递面板与面试记录的标题**由前端拼**：后端给的是角色名或什么都没有，
   * 而「投递面板」这四个字要跟着界面语言走。
   */
  const labelOf = useCallback(
    (asset: LibraryAsset) => {
      if (asset.extra === 'BOARD') return t('aiLab.assets.boardTitle');
      if (asset.extra === 'INTERVIEW') {
        return asset.title || t('aiLab.assets.interviewFallback');
      }
      return asset.title;
    },
    [t],
  );

  const timeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }),
    [i18n.language],
  );
  const relative = (iso: string) => {
    const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
    return timeFormatter.format(days, 'day');
  };

  /**
   * 副标题。**面试记录必须给绝对日期**：同一个岗位练十几次是常态，十几行「面试记录 ·
   * 3天前」而标题还全一样，用户根本挑不出想看的那一场。相对时间只在「最近发生过什么」
   * 里有用，在一串同名记录里等于没写。分数同理——它是这几行之间唯一的实质差别。
   */
  const subtitleOf = (asset: LibraryAsset): string[] => {
    const kind = t(`aiLab.assets.types.${asset.extra ?? asset.type}`);
    if (asset.extra !== 'INTERVIEW') return [kind, relative(asset.updatedAt)];
    const score = (asset.payload as ArchivedInterview | undefined)?.report?.overall;
    return [
      kind,
      new Date(asset.updatedAt).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
      }),
      ...(typeof score === 'number'
        ? [t('aiLab.assets.interviewScore', { score })]
        : []),
    ];
  };

  const inScope = useMemo(
    () =>
      scopedResumeId && scoped
        ? // 投递面板与面试记录是**账号级**的，不属于任何一份简历——它们的 `resumeId`
          // 是空串，拿简历 id 去筛只会把它们全滤没。之前「全部 0 条 / 查看全部 16 条」
          // 那个自相矛盾的空态就是这么来的。
          assets.filter(
            (asset) => asset.extra || asset.resumeId === scopedResumeId,
          )
        : assets,
    [assets, scopedResumeId, scoped],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // `labelOf` 参与比对：搜索比的是拼出来的标题，切语言后「投递面板」要能被新语言搜到。
    return q ? inScope.filter((a) => labelOf(a).toLowerCase().includes(q)) : inScope;
  }, [inScope, query, labelOf]);

  /**
   * 按类型分组。**取代了原来那排筛选 chips**——组头本身就是分类，两套并存的结果是
   * 用户得先想「我该用哪个」。搜索框留着，它筛的是另一个维度。
   *
   * 投递面板与面试记录排在产物**前面**：它们是求职这件事的主线，产物是过程材料。
   * 空组不出现——0 条产物就当没有这一类，一个写着「暂无」的组头只是噪音。
   */
  const groups = useMemo(() => {
    const order: (AssetType | ExtraAssetKind)[] = [
      ...EXTRA_ASSET_KINDS,
      ...ASSET_TYPES,
    ];
    return order
      .map((key) => ({
        key,
        label: t(`aiLab.assets.types.${key}`),
        items: visible.filter((asset) => (asset.extra ?? asset.type) === key),
      }))
      .filter((group) => group.items.length > 0);
  }, [visible, t]);

  // 默认选中第一条：右边空着会让人以为要先点一下才有东西。
  const selected =
    visible.find((asset) => asset.id === selectedId) ?? visible[0] ?? null;

  const patch = (id: string, next: Partial<LibraryAsset>) =>
    setAssets((current) =>
      current.map((asset) => (asset.id === id ? { ...asset, ...next } : asset)),
    );

  const handleKeep = async (asset: LibraryAsset) => {
    // 乐观更新：留住是只增不减的安全动作，等一个往返再变状态显得迟钝。
    patch(asset.id, { expiresAt: null });
    try {
      await keepAsset(asset.resumeId, asset.id);
    } catch {
      patch(asset.id, { expiresAt: asset.expiresAt });
    }
  };

  const handleDelete = async (asset: LibraryAsset) => {
    setConfirmDelete(null);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    try {
      if (asset.extra === 'INTERVIEW') {
        const sessionId = (asset.payload as ArchivedInterview | undefined)?.id;
        if (!sessionId) throw new Error('Interview session id is missing');
        await interviewApi.deleteSession(sessionId);
      } else {
        await deleteAsset(asset.resumeId, asset.id);
      }
    } catch {
      // 删失败要把行放回去——列表上凭空少一条、刷新又回来，比报错更让人不安。
      load();
    }
  };

  const handleClearBoard = async () => {
    setConfirmClear(false);
    setAssets((current) => current.filter((item) => item.extra !== 'BOARD'));
    try {
      await clearBoard();
    } catch {
      load();
    }
  };

  const handleArchive = async (asset: LibraryAsset) => {
    setConfirmArchive(null);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    try {
      await archiveAsset(asset.resumeId, asset.id);
    } catch {
      load();
    }
  };

  /** 主行动的出口：回到这条资产所属简历的 AI Lab，把引用预填进输入框。 */
  const handleUse = (asset: LibraryAsset) => {
    const prompt = t('aiLab.assets.usePrompt', { title: asset.title });
    // 已经在 AI Lab 里了就别再跳一次——就地把引用填进输入框。
    if (onUse) {
      onUse(prompt);
      return;
    }
    // AI Lab 是 `/dashboard/edit/{id}/ai-lab` 这条独立路由，不是 query 开关。
    router.push(
      `/dashboard/edit/${asset.resumeId}/ai-lab?prompt=${encodeURIComponent(prompt)}`,
    );
  };

  /** 面板里现在有多少条投递。确认框必须报这个数——不带数字的确认等于没确认。 */
  const boardSize = useMemo(() => {
    const board = assets.find((asset) => asset.extra === 'BOARD');
    const payload = board?.payload as { applications?: unknown[] } | undefined;
    return payload?.applications?.length ?? 0;
  }, [assets]);

  const expiryOf = (asset: LibraryAsset) => {
    if (!asset.expiresAt) return null;
    const days = daysUntil(asset.expiresAt);
    if (days <= 0) return { text: t('aiLab.assets.expiresToday'), urgent: true };
    if (days === 1) return { text: t('aiLab.assets.expiresTomorrow'), urgent: true };
    return {
      text: t('aiLab.assets.expiresIn', { count: days }),
      urgent: days <= URGENT_DAYS,
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 整页时和简历库同构：标题独占最上面一行，控件条在它下面。
          内嵌时省掉标题——外壳已经写了「资产库」，再来一遍是重复。 */}
      {!embedded && (
        <header className="flex shrink-0 items-baseline gap-2.5 px-6 pb-5 pt-10">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
            {t('aiLab.assets.title')}
          </h1>
          {assets.length > 0 && (
            <span className="text-sm text-neutral-500">
              {t('aiLab.assets.count', { count: assets.length })}
            </span>
          )}
        </header>
      )}

      {/* 只剩搜索。分类交给左栏的组头——两套分类控件并排，用户得先想「该用哪个」。 */}
      <div className={`flex shrink-0 items-center justify-end gap-3 px-6 pb-3 ${embedded ? 'pt-3' : ''}`}>
        <label className="flex h-8 w-56 shrink-0 items-center gap-2 rounded-full bg-surface px-3 shadow-btn">
          <Search size={14} className="shrink-0 text-ink-3" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            /* 占位符必须说清只搜标题：搜正文里的词搜不到，用户会以为坏了。 */
            placeholder={t('aiLab.assets.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      {scopedResumeId && scoped && assets.length > inScope.length && (
        <button
          type="button"
          onClick={() => setScoped(false)}
          className="mx-6 mb-2 self-start text-[12px] text-accent-ink hover:underline"
        >
          {t('aiLab.assets.seeAll', { count: assets.length })}
        </button>
      )}

      {assets.length >= NEAR_LIMIT && (
        <p role="status" className="mx-6 mb-2 text-[12px] text-orange">
          {t('aiLab.assets.nearLimit', { count: assets.length })}
        </p>
      )}

      {loading ? (
        <div className="flex-1 space-y-2 px-6" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-[10px] bg-white/[0.04]" />
          ))}
        </div>
      ) : failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-[13px] text-ink-2">{t('aiLab.assets.loadFailed')}</p>
          <button
            type="button"
            onClick={load}
            className="rounded-full bg-surface px-3 py-1.5 text-[12.5px] text-ink shadow-btn hover:bg-hover"
          >
            {t('aiLab.assets.retry')}
          </button>
        </div>
      ) : assets.length === 0 ? (
        // 真空：不是「暂无数据」。这是全篇唯一让性格出场的地方——说清这里会攒什么。
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-sunk ring-1 ring-inset ring-line">
            <Sparkles size={17} className="text-muted" />
          </div>
          <p className="text-[13.5px] font-medium text-ink">{t('aiLab.assets.emptyTitle')}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* ── 列表 ── */}
          <nav
            aria-label={t('aiLab.assets.ariaList')}
            className={`w-full shrink-0 overflow-y-auto border-r border-line px-3 pb-6 md:block md:w-[300px] ${mobileReading ? 'hidden' : ''}`}
          >
            {visible.length === 0 ? (
              // 筛空必须和真空分开：同一句话会让用户以为东西没了。
              <div className="px-3 py-8 text-center">
                <p className="text-[12.5px] text-ink-3">{t('aiLab.assets.filteredEmpty')}</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-2 text-[12.5px] text-accent-ink hover:underline"
                >
                  {t('aiLab.assets.clearFilter')}
                </button>
              </div>
            ) : (
              groups.map((group) => {
                // 超过这个数才折叠。少于它时「还有 N 场」比直接铺开还多一次点击。
                const COLLAPSE_OVER = 5;
                const open = expanded.has(group.key) || group.items.length <= COLLAPSE_OVER;
                const shown = open ? group.items : group.items.slice(0, 3);
                return (
                  <section key={group.key} className="mb-4">
                    {/* 组头是**标签不是按钮**：它说明这一段是什么，不承担交互。
                        真正可点的是下面那行「还有 N 场」，指向明确。 */}
                    <p className="flex items-baseline gap-2 px-3 pb-1.5 pt-2 text-[11.5px] font-medium text-ink-3">
                      <span className="truncate">{group.label}</span>
                      <span className="tabular-nums text-ink-3/70">{group.items.length}</span>
                    </p>

                    {shown.map((asset) => {
                      const active = selected?.id === asset.id;
                      const expiry = expiryOf(asset);
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => {
                            setSelectedId(asset.id);
                            setMobileReading(true);
                          }}
                          /* 选中态是左边 2px sky 线 + 底色微亮，不用整块蓝底——少 border、
                             不割裂是这套语言的基调。 */
                          className={`relative w-full rounded-[8px] px-3 py-2.5 text-left transition-colors duration-150 ${
                            active ? 'bg-hover-2' : 'hover:bg-hover'
                          }`}
                        >
                          {active && (
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                          )}
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {labelOf(asset)}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                            {subtitleOf(asset).map((part, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span aria-hidden>·</span>}
                                <span className={i === 0 ? 'truncate' : 'shrink-0'}>
                                  {part}
                                </span>
                              </React.Fragment>
                            ))}
                          </span>
                          {expiry && (
                            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                              <span
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ background: expiry.urgent ? 'var(--orange)' : 'var(--ink-3)' }}
                              />
                              {expiry.text}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {group.items.length > COLLAPSE_OVER && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(group.key)) next.delete(group.key);
                            else next.add(group.key);
                            return next;
                          })
                        }
                        className="mt-0.5 w-full rounded-[8px] px-3 py-1.5 text-left text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
                      >
                        {open
                          ? t('aiLab.assets.collapse')
                          : t('aiLab.assets.showMore', {
                              count: group.items.length - shown.length,
                            })}
                      </button>
                    )}
                  </section>
                );
              })
            )}
          </nav>

          {/* ── 预览 ── */}
          {selected && (
            <section
              className={`min-w-0 flex-1 overflow-y-auto px-6 pb-8 md:block ${mobileReading ? '' : 'hidden'}`}
            >
              <button
                type="button"
                onClick={() => setMobileReading(false)}
                className="mb-3 flex items-center gap-1.5 text-[12.5px] text-ink-2 md:hidden"
              >
                <ArrowLeft size={14} />
                {t('aiLab.assets.title')}
              </button>

              <h2 className="text-[16px] font-semibold leading-snug text-ink">
                {labelOf(selected)}
              </h2>
              {/* 「哪份简历 · 第几版」是产物的元信息。面板是活的、面试记录不属于任何
                  一份简历，硬套这句话只会写出「 · 第 1 版」这种没有意义的字。 */}
              <p className="mt-1 text-[12px] text-ink-3">
                {selected.extra
                  ? relative(selected.updatedAt)
                  : t('aiLab.assets.meta', {
                      resume: selected.resumeName,
                      time: relative(selected.updatedAt),
                      version: selected.version,
                    })}
              </p>

              {/* 过期/留住只对产物成立：面板是活的，面试记录是归档，两者都不会消失。 */}
              <div className={`mt-2 flex items-center gap-2 ${selected.extra ? 'hidden' : ''}`}>
                {selected.expiresAt ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          background: expiryOf(selected)?.urgent
                            ? 'var(--orange)'
                            : 'var(--ink-3)',
                        }}
                      />
                      {expiryOf(selected)?.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleKeep(selected)}
                      className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] text-ink shadow-btn transition-colors hover:bg-hover"
                    >
                      <Bookmark size={12} />
                      {t('aiLab.assets.keep')}
                    </button>
                  </>
                ) : (
                  // 已留住是**状态**不是按钮，别让人以为还能再点一次。
                  <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                    <Bookmark size={12} />
                    {t('aiLab.assets.kept')}
                  </span>
                )}
              </div>

              <div className="my-4 h-px bg-line" />

              <AssetPreview asset={selected} />

              {/* 动作栏**逐个判断，不整条隐藏**。

                  之前这里写的是 `selected.extra ? 'hidden' : 'flex'`——「拿它优化简历」和
                  「归档」确实只对某份简历的产物成立，但整条藏掉连带把本该存在的动作也
                  藏没了（「为什么没有删除按钮」正是这么来的）。
                  每一类都有自己的主行动，所以这条栏永远不空。 */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {!selected.extra && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUse(selected)}
                      className="rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90"
                    >
                      {t('aiLab.assets.use')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(selected.title);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[12.5px] text-ink shadow-btn hover:bg-hover"
                    >
                      <Copy size={13} />
                      {copied ? t('aiLab.assets.copied') : t('aiLab.assets.copy')}
                    </button>
                  </>
                )}

                {/* 面试记录的主行动是「打开报告」。它原来混在正文里当一条链接——
                    每一类的主行动都该在同一条基线上，用户才不用每次重新找。 */}
                {selected.extra === 'INTERVIEW' && (
                  <a
                    href={`/dashboard/interview/${
                      (selected.payload as ArchivedInterview | undefined)?.id ?? ''
                    }`}
                    className="rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90"
                  >
                    {t('aiLab.assets.openInterview')}
                  </a>
                )}

                {selected.extra === 'INTERVIEW' && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(selected)}
                    className="ml-auto rounded-full px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-[color:var(--rev-del)]"
                  >
                    {t('aiLab.assets.delete')}
                  </button>
                )}

                {selected.extra === 'BOARD' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleUse(selected)}
                      className="rounded-full bg-ink px-3.5 py-2 text-[12.5px] font-medium text-canvas transition-opacity hover:opacity-90"
                    >
                      {t('aiLab.assets.discussBoard')}
                    </button>
                    {/* 清空收进最右边的低强调位：频率极低、后果极重的东西不该和日常
                        动作同一层。 */}
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="ml-auto rounded-full px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
                    >
                      {t('aiLab.assets.clearBoard')}
                    </button>
                  </>
                )}

                {!selected.extra && (
                  <>
                    {/* 归档要确认，因为正文从此读不出来。行内二次点击，不弹模态。
                        不给图标：没有哪个图标能承载「归档且正文不再保留」，而 EyeOff
                        之类会读成「隐藏」——正是这里不能软化的那层意思。 */}
                    <button
                      type="button"
                      onClick={() =>
                        confirmArchive === selected.id
                          ? handleArchive(selected)
                          : setConfirmArchive(selected.id)
                      }
                      onBlur={() => setConfirmArchive(null)}
                      className="ml-auto rounded-full px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
                    >
                      {confirmArchive === selected.id
                        ? t('aiLab.assets.archiveConfirm')
                        : t('aiLab.assets.archive')}
                    </button>
                    {/* 删除和归档是两个语义：归档=收起来别占地方，删除=当它没发生过。
                        两个动词区分得开就不用解释，但删除走模态确认——它不可逆且
                        不留痕，比归档重一档。 */}
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(selected)}
                      className="rounded-full px-3 py-2 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-[color:var(--rev-del)]"
                    >
                      {t('aiLab.assets.delete')}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        title={t(
          confirmDelete?.extra === 'INTERVIEW'
            ? 'aiLab.assets.deleteInterviewConfirmTitle'
            : 'aiLab.assets.deleteConfirmTitle',
        )}
        description={t(
          confirmDelete?.extra === 'INTERVIEW'
            ? 'aiLab.assets.deleteInterviewConfirmBody'
            : 'aiLab.assets.deleteConfirmBody',
        )}
        confirmText={t('aiLab.assets.delete')}
      />

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void handleClearBoard()}
        title={t('aiLab.assets.clearBoardConfirmTitle')}
        // 带上数量：用户得知道自己要失去多少，才谈得上「确认」。
        description={t('aiLab.assets.clearBoardConfirmBody', { count: boardSize })}
        confirmText={t('aiLab.assets.clearBoard')}
      />
    </div>
  );
}
