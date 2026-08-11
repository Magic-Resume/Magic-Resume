"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Section, SectionItem } from '@/types/frontend/resume';
import { useResumeStore, getSanitizedResume } from '@/store/useResumeStore';
import { useSettingStore } from '@/store/useSettingStore';
import debounce from 'lodash/debounce';
import BasicForm from './forms/BasicForm';
import sidebarMenu from '@/lib/constants/sidebarMenu';
import SectionListWithModal from './forms/SectionListWithModal';
import ResumePreviewPanel from './preview/ResumePreviewPanel';
import FormSection from './forms/FormSection';
import { formFieldsFor } from '@/lib/constants/dynamicFormFields';
import { isCustomSection } from '@/lib/utils/resumeSectionOrder';
import CustomSectionDialog from './forms/CustomSectionDialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { fromThrown } from '@/lib/errors/normalize';
import { presentAppError } from '@/lib/errors/present';
import ResumeEditSkeleton from './layout/ResumeEditSkeleton';
import TemplatePanel, { rightPanelWidth } from './templates/TemplatePanel';
import EditorFormPanel from './layout/EditorFormPanel';
import { sectionMeta, leftPanelWidth } from './layout/OutlineRail';
import useMobile from '@/hooks/useMobile';
import MobileResumEdit from './mobile/MobileResumEdit';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import HeaderTab from './layout/HeaderTab';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

// 预览面板静态引入:它本体很轻(pdf.js / @react-pdf 在更下层各自懒加载)。整个面板 dynamic
// 会造成"spinner → dock 单独弹出 → 纸才出现"的三段跳,静态引入让它们同帧入场。

type ResumeEditProps = {
  id: string;
};

const MIN_EDITOR_STAGE_WIDTH = 420;

export default function ResumeEdit({ id }: ResumeEditProps) {
  const {
    activeResume,
    loadResumeForEdit,
    saveResume: saveActiveResumeToResumes,
    syncToCloud,
    updateInfo,
    setSectionOrder: updateSectionOrder,
    updateSectionItems,
    addCustomSection,
    updateCustomSection,
    removeCustomSection,
    updateTemplate,
    rightCollapsed,
    setRightCollapsed,
    leftCollapsed,
    setLeftCollapsed,
    activeSection,
    setActiveSection,
    isStoreLoading,
    resumes,
    syncStatus,
    isAiGenerating,
  } = useResumeStore();

  const router = useRouter();

  const cloudSync = useSettingStore(state => state.cloudSync);

  const { isMobile } = useMobile();

  const [viewportWidth, setViewportWidth] = useState(0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<{ key: string; label: string; icon?: string } | null>(null);
  const [deletingSection, setDeletingSection] = useState<{ key: string; label: string } | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState(activeResume?.template || 'classic');
  const [resumeNotFound, setResumeNotFound] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const openJsonModal = () => router.push(`/dashboard/edit/${id}/json`);

  const openAIModal = async () => {
    // agent 是从云端库读简历的，先尽力把编辑器最新状态推上去（关了云同步则无操作）。
    try {
      await syncToCloud();
    } catch (err) {
      // 这一次吞掉的后果不是「少存一次」，而是**agent 接下来读的是旧简历**：它会照着
      // 过时内容提改动，用户看着自己刚写的段落被改回去。必须说出来。
      presentAppError(fromThrown(err, 'local'), { surface: 'background' });
    }
    router.push(`/dashboard/edit/${id}/ai-lab`);
  };
  const [isSaving, setIsSaving] = useState(false);

  const openVersionHistory = () => router.push(`/dashboard/edit/${id}/history`);
  const openShareModal = () => router.push(`/dashboard/edit/${id}/share`);
  const openFeedback = () => router.push(`/dashboard/edit/${id}/feedback`);

  const { t } = useTranslation();

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);

    return () => {
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  const narrowWorkspace =
    !isMobile &&
    viewportWidth > 0 &&
    viewportWidth <
      leftPanelWidth(false) +
        rightPanelWidth(false) +
        MIN_EDITOR_STAGE_WIDTH;

  const rightWorkspaceInset =
    rightPanelWidth(rightCollapsed) + (rightCollapsed ? 0 : 1);

  const toggleLeftPanel = useCallback(() => {
    const nextCollapsed = !leftCollapsed;
    if (!nextCollapsed && narrowWorkspace && !rightCollapsed) {
      setRightCollapsed(true);
    }
    setLeftCollapsed(nextCollapsed);
  }, [leftCollapsed, narrowWorkspace, rightCollapsed, setLeftCollapsed, setRightCollapsed]);

  const setRightPanelCollapsed = useCallback(
    (collapsed: boolean) => {
      if (!collapsed && narrowWorkspace && !leftCollapsed) {
        setLeftCollapsed(true);
      }
      setRightCollapsed(collapsed);
    },
    [leftCollapsed, narrowWorkspace, setLeftCollapsed, setRightCollapsed],
  );

  const handleDownloadJson = () => {
    if (!activeResume) return;
    const sanitized = getSanitizedResume(activeResume);
    const jsonString = JSON.stringify(sanitized, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeResume.name || 'resume'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t('editPage.notifications.jsonDownloadStarted'));
  };

  const info = activeResume?.info;
  const sectionItems = activeResume?.sections;
  const sectionOrder = activeResume?.sectionOrder;

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const suppressNextScroll = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // activeSection 变化 → 滚动到对应模块(外部导航 / 轨跳转);scroll-spy 触发的变化跳过,避免回环
  useEffect(() => {
    if (suppressNextScroll.current) {
      suppressNextScroll.current = false;
      return;
    }
    const el = sectionRefs.current[activeSection];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeSection]);

  useEffect(() => {
    const setupEditor = async () => {
      if (!isStoreLoading) {
        const resume = resumes.find(r => r.id === id);
        if (!resume && resumes.length > 0) {
          setResumeNotFound(true);
        } else if (resume) {
          setResumeNotFound(false);
          router.prefetch(`/dashboard/edit/${id}/ai-lab`);
          router.prefetch(`/dashboard/edit/${id}/history`);
          router.prefetch(`/dashboard/edit/${id}/json`);
          router.prefetch(`/dashboard/edit/${id}/share`);
          router.prefetch(`/dashboard/edit/${id}/feedback`);
        }
      }

      const { activeResume, isSyncing } = useResumeStore.getState();
      if (activeResume?.id === id && !isStoreLoading && !isSyncing) {
          return;
      }

      loadResumeForEdit(id);
    };

    setupEditor();
  }, [id, loadResumeForEdit, isStoreLoading, resumes, router]); // resumes 依然保留，但靠内部 activeResume?.id === id 熔断

  useEffect(() => {
    if (activeResume?.template && activeResume.template !== currentTemplateId) {
      setCurrentTemplateId(activeResume.template);
    }
  }, [activeResume?.template, currentTemplateId]);

  useEffect(() => {
    if (narrowWorkspace && !leftCollapsed && !rightCollapsed) {
      setLeftCollapsed(true);
    }
  }, [leftCollapsed, narrowWorkspace, rightCollapsed, setLeftCollapsed]);

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    console.log('[Save] Starting manual save process...');
    try {
      if (activeResume) {
        appLifecycle.resumeSaveRequested({ source: 'manual' });
      }
      
      console.log('[Save] Calling store saveResume...');
      
      console.log('[Save] Calling store saveResume...');
      await saveActiveResumeToResumes('manual', activeResume || undefined);
      console.log('[Save] Store saveResume completed.');
      
      const freshResume = useResumeStore.getState().activeResume;
      if (freshResume) {
          lastUpdatedAtRef.current = freshResume.updatedAt;
      }
    } catch (err) {
      console.error('[Save] Manual save failed:', err);
      // 用户按了保存按钮，然后什么都没发生——静默在这里就是 bug。
      presentAppError(fromThrown(err, 'local'), { surface: 'inline' });
    } finally {
      setIsSaving(false);
      console.log('[Save] Manual save process ended, loading state released.');
    }
  };

  // 自动同步:10s 防抖 + 45s maxWait。纯 trailing 防抖会被持续输入无限重置,
  // maxWait 保证再怎么连续编辑至多 45s 也会落一次云。
  const debouncedSync = useMemo(
    () => debounce(async () => {
      await syncToCloud();
    }, 10000, { maxWait: 45000 }),
    [syncToCloud]
  );

  const lastUpdatedAtRef = React.useRef<number | null>(null);
  
  useEffect(() => {
    lastUpdatedAtRef.current = null;
  }, [id]);

  useEffect(() => {
    const triggerSync = async () => {
      if (cloudSync && activeResume && !isStoreLoading) {
        if (lastUpdatedAtRef.current === null) {
          lastUpdatedAtRef.current = activeResume.updatedAt;
          return;
        }

        if (activeResume.updatedAt === lastUpdatedAtRef.current) {
          return;
        }

        debouncedSync();
        lastUpdatedAtRef.current = activeResume.updatedAt;
      }
    };
    
    triggerSync();

    // cleanup 里不要 cancel:此 effect 每次编辑都重跑,cancel 会静默丢弃待同步修改,
    // 并把 maxWait 计时每次击键清零,让"最迟 45s 必落云"彻底失效。
  }, [activeResume, cloudSync, isStoreLoading, debouncedSync]);

  // 卸载或切换简历时把防抖窗口里的待同步刷出去而不是丢弃。flush 时 syncToCloud 同步
  // 快照 store 里的 activeResume(此刻仍是旧简历),对象不会串。
  useEffect(() => {
    return () => {
      debouncedSync.flush();
    };
  }, [id, debouncedSync]);

  // 隐藏/关闭时尽力刷出,分两档:visibilitychange 页面还活着 → axios flush 走完整算法;
  // pagehide 时 axios 不保送达 → keepalive fetch,并 cancel 防抖避免 bfcache 恢复后重推。
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void debouncedSync.flush();
    };
    const onPageHide = () => {
      debouncedSync.cancel();
      useResumeStore.getState().flushSyncOnExit();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [debouncedSync]);

  // 网络恢复时若仍有未落云的修改或上次同步失败,立即补一次,不必等下次编辑。
  useEffect(() => {
    const onOnline = () => {
      const { syncStatus: status } = useResumeStore.getState();
      if (cloudSync && (status === 'modified' || status === 'error')) {
        void syncToCloud();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [cloudSync, syncToCloud]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const jumpToSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: true }));
    if (leftCollapsed) {
      if (narrowWorkspace && !rightCollapsed) {
        setRightCollapsed(true);
      }
      setLeftCollapsed(false);
    }
    setActiveSection(key);
  }, [leftCollapsed, narrowWorkspace, rightCollapsed, setLeftCollapsed, setRightCollapsed, setActiveSection]);

  const handleLeftScroll = useCallback(() => {
    const container = leftScrollRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    let current = sectionOrder?.[0]?.key ?? 'basics';
    (sectionOrder || []).forEach(({ key }) => {
      const el = sectionRefs.current[key];
      if (el && el.getBoundingClientRect().top - top <= 28) current = key;
    });
    if (current !== activeSection) {
      suppressNextScroll.current = true;
      setActiveSection(current);
    }
  }, [sectionOrder, activeSection, setActiveSection]);

  const handleSelectTemplate = useCallback((templateId: string) => {
    if (activeResume) {
      appLifecycle.resumeTemplateSelected({
        previousTemplateId: currentTemplateId,
        nextTemplateId: templateId
      });
    }
    setCurrentTemplateId(templateId);
    updateTemplate(templateId);
  }, [activeResume, currentTemplateId, updateTemplate]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id && sectionOrder) {
      const oldIndex = sectionOrder.findIndex(item => item.key === active.id);
      const newIndex = sectionOrder.findIndex(item => item.key === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sectionOrder, oldIndex, newIndex);
        updateSectionOrder(newOrder);
        // 这里是模块之间的排序；模块内条目排序是另一个高频动作，不走这里。
        appLifecycle.editorSectionReordered();
      }
    }
  }

  if (resumeNotFound) {
    return (
      <div className="flex h-screen bg-desk text-white items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t('editPage.errors.resumeNotFound')}</h1>
          <p className="text-neutral-400 mb-8">
            {t('editPage.errors.resumeNotFoundDescription', { id })}
          </p>
          <button
            onClick={() => window.history.back()}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors"
          >
            {t('editPage.errors.goBack')}
          </button>
        </div>
      </div>
    );
  }

  if (isStoreLoading || !activeResume || !info || !sectionItems || !sectionOrder) {
    return <ResumeEditSkeleton />;
  }

  function renderSections() {
    return (
      <DndContext
        key="dnd-context"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sectionOrder?.map(s => s.key) || []} strategy={verticalListSortingStrategy}>
          {(sectionOrder || []).map(({ key, label, icon: iconName }) => {
            const meta = sectionMeta(key, iconName);
            const Icon = meta.icon;
            // 兜底用存下来的 label 而非裸 key：自定义 section 没有 i18n key，
            // 旁边的 OutlineRail 就是这么读的，两边不一致会一处显 key 一处显中文。
            const title = meta.labelKey ? t(meta.labelKey) : label || key;
            const custom = isCustomSection(key);
            return (
              <FormSection
                key={key}
                sectionId={key}
                icon={<Icon size={15} />}
                title={title}
                actions={custom ? (
                  <>
                    <button
                      type="button"
                      aria-label={t('customSection.rename', { defaultValue: '重命名' })}
                      title={t('customSection.rename', { defaultValue: '重命名' })}
                      onClick={() => setEditingSection({ key, label: label || key, icon: iconName })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
                    >
                      <SquarePen size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={t('common.delete', { defaultValue: '删除' })}
                      title={t('common.delete', { defaultValue: '删除' })}
                      onClick={() => setDeletingSection({ key, label: label || key })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : undefined}
                open={openSections[key] ?? true}
                onToggle={() => toggleSection(key)}
                registerRef={(el) => { sectionRefs.current[key] = el; }}
                disabled={key === 'basics' || isAnyModalOpen}
              >
                {key === 'basics' ? (
                  <BasicForm
                    info={info!}
                    updateInfo={updateInfo}
                    enableCustomFields={activeResume?.template === 'product-ops-focus'}
                  />
                ) : (
                  <SectionListWithModal
                    // 埋点用稳定的 kind，`label` 是 i18n key，会随文案变。
                    sectionKey={key}
                    label={meta.labelKey || key}
                    fields={formFieldsFor(key).map(f => ({ name: f.key, label: t(f.labelKey), placeholder: f.placeholderKey ? t(f.placeholderKey) : '', required: f.required }))}
                    richtextKey="summary"
                    richtextPlaceholder="..."
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    itemRender={sidebarMenu.find(s => s.key === key)?.itemRender as any}
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    items={(sectionItems?.[key as keyof Section] ?? []).map((item: { id: any; }) => ({ ...item, id: String(item.id) })) as any}
                    setItems={(items) => updateSectionItems(key, items as SectionItem[])}
                    onModalStateChange={setIsAnyModalOpen}
                  />
                )}
              </FormSection>
            );
          })}
        </SortableContext>

        <button
          type="button"
          onClick={() => setCreatingSection(true)}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 py-2.5 text-[13px] text-neutral-500 transition-colors duration-150 hover:border-sky-400/40 hover:text-sky-300"
        >
          <Plus size={14} />
          {t('customSection.add', { defaultValue: '添加自定义模块' })}
        </button>

        <CustomSectionDialog
          open={creatingSection || editingSection !== null}
          initial={editingSection ? { label: editingSection.label, icon: editingSection.icon } : undefined}
          onOpenChange={(open) => {
            if (open) return;
            setCreatingSection(false);
            setEditingSection(null);
          }}
          onSubmit={({ label, icon }) => {
            if (editingSection) {
              updateCustomSection(editingSection.key, { label, icon });
            } else {
              const key = addCustomSection(label, icon);
              // 立刻展开：新建的 section 不显示表单会让人以为什么都没发生。
              if (key) setOpenSections(prev => ({ ...prev, [key]: true }));
            }
          }}
        />

        <ConfirmDialog
          isOpen={deletingSection !== null}
          onClose={() => setDeletingSection(null)}
          title={t('customSection.deleteTitle', { defaultValue: '删除模块' })}
          description={t('customSection.deleteHint', {
            defaultValue: '「{{name}}」及其中的条目会一并删除，此操作无法撤销。',
            name: deletingSection?.label ?? '',
          })}
          confirmText={t('common.delete', { defaultValue: '删除' })}
          onConfirm={() => {
            if (deletingSection) removeCustomSection(deletingSection.key);
            setDeletingSection(null);
          }}
        />
      </DndContext>
    );
  }

  if (isMobile) {
    return (
      <MobileResumEdit
        activeResume={activeResume}
        leftPanelOpen={leftPanelOpen}
        setLeftPanelOpen={setLeftPanelOpen}
        rightPanelOpen={rightPanelOpen}
        setRightPanelOpen={setRightPanelOpen}
        isJsonModalOpen={false}
        closeJsonModal={() => router.push(`/dashboard/edit/${id}`)}
        openJsonModal={openJsonModal}
        handleCopyJson={handleDownloadJson}
        renderSections={renderSections}
        handleSave={handleSave}
        onShowAI={openAIModal}
        isAiJobRunning={isAiGenerating}
        onShareClick={openShareModal}
        onSelectTemplate={handleSelectTemplate}
        currentTemplateId={currentTemplateId}
      />
    );
  }

  return (
    <>
      <main
        data-magic-editor-canvas
        // 编辑器内的所有上报（含 AI 面板、分享弹窗）都自动带上这份简历 id，控件不必各自传。
        data-magic-context={JSON.stringify({
          resumeId: activeResume.id,
          templateId: currentTemplateId,
        })}
        className="flex h-screen min-w-0 overflow-hidden bg-desk text-white flex-1"
      >
        {/* 左侧:大纲轨 + 可折叠表单面板(入场:opacity-only,不动 fixed 定位) */}
        <div className="editor-enter-left">
          <EditorFormPanel
            renderSections={renderSections}
            sectionOrder={(sectionOrder || []).map(s => ({ key: s.key, label: s.label }))}
            activeSection={activeSection}
            collapsed={leftCollapsed}
            onToggleCollapse={toggleLeftPanel}
            onJump={jumpToSection}
            scrollRef={leftScrollRef}
            onScroll={handleLeftScroll}
          />
        </div>
        <div
          className='min-w-0 flex-1 flex items-center justify-center bg-desk relative overflow-hidden transition-all duration-300 editor-enter-stage'
          style={{
            marginLeft: leftPanelWidth(leftCollapsed),
            marginRight: rightWorkspaceInset
          }}
        >
          <HeaderTab
            updatedAt={activeResume?.updatedAt}
            syncStatus={syncStatus}
            onVersionClick={openVersionHistory}
            onFeedbackClick={openFeedback}
          />
          {/* 简历预览面板 */}
          <ResumePreviewPanel
            activeResume={activeResume}
            onShowAI={openAIModal}
            isAiJobRunning={isAiGenerating}
            onShareClick={openShareModal}
            onJsonClick={openJsonModal}
          />
        </div>
      </main>

      {/* 模板面板(入场:opacity-only,不动 fixed 定位) */}
      <div className="editor-enter-right">
        <TemplatePanel
          rightCollapsed={rightCollapsed}
          setRightCollapsed={setRightPanelCollapsed}
          onSelectTemplate={handleSelectTemplate}
          currentTemplateId={currentTemplateId}
        />
      </div>
    </>
  );
}
