"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { processAndStoreAvatar, AvatarError } from "@/lib/api/avatarUpload";
import { ACCEPTED_IMAGE_ACCEPT_ATTR } from "@/lib/utils/image";

/* ------------------------------------------------------------------ *
 * 左侧表单的统一控件 —— 与右侧自定义面板同一套深色工作台 + sky 风格。
 * 不改全站共享的 @/components/ui/input,这里是编辑器面板专用控件。
 * ------------------------------------------------------------------ */

export const fieldInputClass =
  "h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] text-neutral-100 outline-none transition-colors duration-150 placeholder:text-neutral-600 hover:border-white/20 focus:border-sky-400/60 focus:bg-white/[0.06]";

export function FieldLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-[12px] font-medium text-neutral-400", className)}
    >
      {children}
    </label>
  );
}

export function TextField({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <FieldLabel htmlFor={name}>{label}</FieldLabel>}
      <input
        id={name}
        name={name}
        type={type}
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        className={fieldInputClass}
      />
    </div>
  );
}

export function AvatarField({
  value,
  onChange,
  onValueChange,
  name = "avatar",
  alt,
  placeholder = "https://...",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** 上传 / 清除后直接回写头像值(URL 或 data:URL) */
  onValueChange?: (value: string) => void;
  name?: string;
  alt: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const openPicker = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一个文件
    if (!file) return;
    setUploading(true);
    try {
      const next = await processAndStoreAvatar(file);
      onValueChange?.(next);
      toast.success(t("basicForm.avatarUpload.success"));
    } catch (err) {
      const code = err instanceof AvatarError ? err.code : "UPLOAD_FAILED";
      toast.error(t(`basicForm.avatarUpload.errors.${code}`));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={openPicker}
        disabled={uploading}
        aria-label={t("basicForm.avatarUpload.button")}
        title={t("basicForm.avatarUpload.button")}
        className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] outline-none transition-colors hover:border-sky-400/60 focus-visible:border-sky-400/60"
      >
        {value ? (
          // 用原生 img:头像可能是 data:URL(self-hosted 内嵌),与简历模板保持一致渲染。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={alt} className="h-full w-full object-cover" />
        ) : null}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/50 text-white transition-opacity",
            uploading
              ? "opacity-100"
              : value
                ? "opacity-0 group-hover:opacity-100"
                : "opacity-60 group-hover:opacity-100",
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      <div className="relative flex-1">
        <input
          id={name}
          name={name}
          type="text"
          value={value ?? ""}
          onChange={onChange}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(fieldInputClass, value && "pr-8")}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onValueChange?.("")}
            aria-label={t("basicForm.avatarUpload.clear")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 transition-colors hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
