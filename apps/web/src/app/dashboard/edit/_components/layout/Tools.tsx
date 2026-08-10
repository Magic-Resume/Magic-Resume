import { cn } from "@/lib/utils";
import { Resume } from '@/types/frontend/resume';
import { DownloadIcon } from "@radix-ui/react-icons";
import { Bot, History, Share2, MessageCircle, ChevronDown, ChevronUp, Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ReactNode, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { useSettingStore } from "@/store/useSettingStore";
import { isCloudMode } from "@/lib/config/app";
import {
  exportResumeToImage,
  exportResumeToJson,
  exportResumeToPdf,
  preloadResumePdfExport,
} from "@/lib/utils/pdf-export";
import ExportModal, { type ExportFormat } from "../modals/ExportModal";
import { appLifecycle } from "@/lib/extensions/app-lifecycle";

export type ToolsProps = {
  isMobile: boolean;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetTransform: (step?: number) => void;
  resume: Resume;
  onShowAI: () => void;
  onVersionClick?: () => void;
  rightCollapsed?: boolean;
  onShareClick?: () => void;
  onFeedbackClick?: () => void;
};

type ToolButtonProps = {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  onFocus?: () => void;
  onPointerEnter?: () => void;
  disabled?: boolean;
};

const toolButtonClassName =
  "w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white hover:bg-neutral-700 transition disabled:opacity-60 disabled:cursor-not-allowed";

function ToolButton({ title, children, onClick, onFocus, onPointerEnter, disabled = false }: ToolButtonProps) {
  return (
    <button
      className={toolButtonClassName}
      onClick={onClick}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      disabled={disabled}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

export function Tools({ isMobile, zoomIn, zoomOut, resetTransform, resume, onShowAI, onVersionClick, rightCollapsed = false, onShareClick, onFeedbackClick }: ToolsProps){
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useParams();
  // We can fallback to 'default' or handle error if id is missing, but it should be present in this context
  const currentId = (params?.id as string) || resume.id;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const cloudSync = useSettingStore((state) => state.cloudSync);
  
  // 计算桌面端工具栏的right位置，避免被模板栏遮挡
  const desktopRightPosition = rightCollapsed ? '76px' : '300px'; // 56px模板栏 + 20px间距 或 280px模板栏 + 20px间距
  
  const toggleCollapsed = () => setIsCollapsed((prev) => !prev);
  // Match the locale the preview renders with so the export reuses its cached blob.
  const pdfLocale = i18n.resolvedLanguage || i18n.language;

  const warmupPdfExport = () => {
    // Lightweight: only warms the template + fonts. The full blob is produced
    // (and cached) by the live preview, so the click-to-export stays instant.
    void preloadResumePdfExport(resume).catch(() => {
      // Best-effort warmup only; export handles real failures.
    });
  };

  // PDF 走客户端 @react-pdf/renderer,矢量、文字可选中(ATS 友好),无打印框;
  // 产出是「一整页连续长页」而非分页 A4——见 resume-templates 的
  // MagicResumePdfDocument 顶部说明。
  // 图片由同一份 PDF 光栅化而来,两者逐像素同源;JSON 是原始数据,不经渲染。
  const COPY: Record<ExportFormat, { loading: string; ok: string; fail: string }> = {
    pdf: { loading: 'tools.exportingPDF', ok: 'tools.exportPDFSuccess', fail: 'tools.exportPDFError' },
    png: { loading: 'modals.export.imaging', ok: 'modals.export.imageSuccess', fail: 'modals.export.imageError' },
    json: { loading: '', ok: 'modals.export.jsonSuccess', fail: '' },
  };

  const handleExport = async (format: ExportFormat) => {
    if (isExporting) return;
    setIsExporting(true);
    const copy = COPY[format];
    // JSON 是同步序列化,不该为它闪一下 loading——那会读成"在做很重的事"。
    const toastId = copy.loading ? toast.loading(t(copy.loading)) : undefined;
    const startedAt = Date.now();
    try {
      if (format === 'pdf') await exportResumeToPdf(resume, pdfLocale);
      else if (format === 'png') await exportResumeToImage(resume, pdfLocale);
      else exportResumeToJson(resume);
      toast.success(t(copy.ok), toastId ? { id: toastId } : undefined);
      appLifecycle.resumeExported({
        format,
        source: 'tools',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error(`${format} export failed:`, error);
      if (copy.fail) toast.error(t(copy.fail), toastId ? { id: toastId } : undefined);
      // Failures matter as much as successes here: export is where the product
      // delivers its value, so its success rate is the number worth watching.
      appLifecycle.resumeExported({
        format,
        source: 'tools',
        success: false,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div 
      className={cn(
        "z-20 flex gap-2 overflow-hidden",
        isMobile
          ? "fixed bottom-6 left-1/2 -translate-x-1/2 flex-row p-2 rounded-full bg-neutral-900/70 border border-neutral-700 backdrop-blur-sm"
          : "fixed bottom-10 flex-col transition-all duration-300"
      )}
      style={!isMobile ? { right: desktopRightPosition } : undefined}
    >

      <div
        className={cn(
          "flex gap-2 transition-all duration-300 ease-out",
          isMobile ? "flex-row" : "flex-col",
          isCollapsed && !isMobile ? "max-h-0 opacity-0 scale-95 pointer-events-none" : "max-h-[520px] opacity-100 scale-100"
        )}
      >
        <>
          {!isMobile && isCloudMode && (
            <ToolButton
              title={t('tools.aiAssistant')}
              onClick={onShowAI}
            >
              <Bot size={18}/>
            </ToolButton>
          )}
          
          {cloudSync && (
            <ToolButton
              title={t('tools.share', 'Share')}
              onClick={onShareClick}
            >
              <Share2 size={18}/>
            </ToolButton>
          )}

          {isCloudMode && (
            <ToolButton
              onClick={() => {
                  if (onFeedbackClick) {
                      onFeedbackClick();
                  } else if (currentId) {
                      // Fallback to internal navigation if prop is not provided, though it should be.
                      router.push('/dashboard/edit/' + currentId + '/feedback');
                  }
              }}
              title={t('tools.feedback', 'Feedback')}
            >
              <MessageCircle size={18}/>
            </ToolButton>
          )}

          {cloudSync && !isMobile && (
            <ToolButton
              onClick={onVersionClick}
              title={t('header.versionHistory')}
            >
              <History size={18}/>
            </ToolButton>
          )}
          <ToolButton
            onClick={() => setExportOpen(true)}
            disabled={isExporting}
            title={isExporting ? t('tools.exportingPDF') : t('modals.export.title')}
            onFocus={warmupPdfExport}
            onPointerEnter={warmupPdfExport}
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <DownloadIcon />}
          </ToolButton>
          <ToolButton
            onClick={() => zoomIn()}
            title={t('tools.zoomIn')}
          >
            <ZoomIn size={18} />
          </ToolButton>
          <ToolButton
            onClick={() => zoomOut()}
            title={t('tools.zoomOut')}
          >
            <ZoomOut size={18} />
          </ToolButton>
          <ToolButton
            onClick={() => resetTransform()}
            title={t('tools.resetZoom')}
          >
            <RotateCcw size={18} />
          </ToolButton>
        </>
      </div>

      {!isMobile && (
        <ToolButton
          onClick={toggleCollapsed}
          title={isCollapsed ? t('tools.expand', 'Expand') : t('tools.collapse', 'Collapse')}
        >
          {isCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </ToolButton>
      )}

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExport}
        resume={resume}
      />
    </div>
  )
}
