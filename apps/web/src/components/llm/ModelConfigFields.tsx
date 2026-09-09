"use client";

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { RiEyeLine, RiEyeOffLine } from '@remixicon/react';
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  PlugZap,
  CheckCircle2,
  XCircle,
  Image as ImageGlyph,
} from '@magic-resume/icons';
import { LockClosedIcon } from '@magic-resume/icons';
import { useSettingStore } from '@/store/useSettingStore';
import {
  MODEL_PROVIDERS,
  getProvider,
  CUSTOM_PROVIDER_ID,
  MODEL_IMAGE_SUPPORT_MAP,
} from '@/lib/constants/modals';
import { ProviderMark } from '@/components/llm/ProviderMark';
import { classifyLlmTestError } from '@/lib/utils/llmTestError';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/product-button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type TestState = 'idle' | 'testing' | 'ok' | 'error';

/**
 * Provider-first LLM config fields, bound directly to {@link useSettingStore}.
 * Shared by the settings page and the in-chat config gate so the catalog +
 * store-setter logic lives in exactly one place. Callers own save/chrome.
 */
export function ModelConfigFields() {
  const { t } = useTranslation();
  const {
    provider,
    apiKey,
    baseUrl,
    model,
    maxTokens,
    setProvider,
    setApiKey,
    setBaseUrl,
    setModel,
    setMaxTokens,
  } = useSettingStore();

  const meta = getProvider(provider);
  const isCustom = provider === CUSTOM_PROVIDER_ID;
  // 聚合器服务商的目录有几千个、每周都在变,枚举出来发版即过时。它们的 models 是空的,
  // 这里退回自由填——空列表是刻意的信号,不是没写完。
  const freeformModel = isCustom || (meta?.models.length ?? 0) === 0;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Custom needs base URL up front; presets keep Base URL / Max Tokens tucked away.
  const showAdvanced = advancedOpen || isCustom;

  const [showKey, setShowKey] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [testStatus, setTestStatus] = useState<number | undefined>(undefined);
  const [testImageSupport, setTestImageSupport] = useState<boolean | undefined>(undefined);
  const canTest = Boolean(apiKey?.trim() && baseUrl?.trim() && model?.trim());

  // Classify the last failure (if any) into a stable kind for friendly copy.
  const testKind =
    testState === 'error' ? classifyLlmTestError(testStatus, testMsg) : undefined;

  // Any change to the connection inputs invalidates a prior test result.
  useEffect(() => {
    setTestState('idle');
    setTestMsg('');
    setTestStatus(undefined);
    setTestImageSupport(undefined);
  }, [provider, apiKey, baseUrl, model]);

  const handleTest = async () => {
    setTestState('testing');
    setTestMsg('');
    setTestStatus(undefined);
    setTestImageSupport(undefined);
    try {
      const res = await fetch('/api/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, apiKey, model }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        status?: number;
        latencyMs?: number;
        supportsImage?: boolean;
      };
      if (data.ok) {
        setTestState('ok');
        setTestMsg(typeof data.latencyMs === 'number' ? `${data.latencyMs}ms` : '');
        // Probe result first; when the endpoint gives an inconclusive answer,
        // fall back to the known capability from the model catalog.
        setTestImageSupport(data.supportsImage ?? MODEL_IMAGE_SUPPORT_MAP[model]);
      } else {
        setTestState('error');
        setTestMsg(data.message || '');
        setTestStatus(data.status);
      }
    } catch {
      setTestState('error');
      setTestMsg('');
    }
  };

  const inputClass =
    'h-9 rounded-2lg border-border-button-default bg-background-primary-default text-text-primary shadow-xs transition-all placeholder:text-text-placeholder focus-visible:ring-border-focus-ring focus-visible:ring-offset-0';
  const selectTriggerClass =
    'h-9 w-full rounded-2lg border-border-button-default bg-background-primary-default text-text-primary shadow-xs transition-all focus:ring-border-focus-ring';

  return (
    <div className="rounded-2xl bg-background-secondary-default p-3">
      {/* Provider + Model on one row — both are short selects, so this fills the
          width and keeps the form compact instead of a sparse vertical stack. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-body-2-medium text-text-primary">
            {t('settings.llm.providerLabel')}
          </label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className={selectTriggerClass}>
              <SelectValue placeholder={t('settings.llm.providerPlaceholder')} />
            </SelectTrigger>
            <SelectContent className="z-[110] max-h-[min(60vh,26rem)] rounded-xl border-border-button-default bg-background-primary-default text-text-primary shadow-dropdown">
              {(['global', 'china', 'custom'] as const).map((region) => {
                const group = MODEL_PROVIDERS.filter((p) => p.region === region);
                if (!group.length) return null;
                return (
                  <SelectGroup key={region}>
                    <SelectLabel className="text-mr-micro font-medium uppercase tracking-[0.14em] text-text-tertiary">
                      {t(`settings.llm.region.${region}`)}
                    </SelectLabel>
                    {group.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="rounded-lg transition-colors focus:bg-background-primary-hover focus:text-text-primary"
                      >
                        <ProviderMark provider={p} size={16} />
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="model" className="text-body-2-medium text-text-primary">
            {t('settings.llm.modelLabel')}
          </label>
          {freeformModel ? (
            <Input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t('settings.llm.modelCustomPlaceholder')}
              className={inputClass}
            />
          ) : (
            <Select value={model} onValueChange={setModel} disabled={!meta}>
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue
                  placeholder={
                    meta
                      ? t('settings.llm.modelPlaceholder')
                      : t('settings.llm.selectProviderFirst')
                  }
                />
              </SelectTrigger>
              <SelectContent className="z-[110] rounded-xl border-border-button-default bg-background-primary-default text-text-primary shadow-dropdown">
                {meta?.models.map((m) => (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    className="rounded-lg transition-colors focus:bg-background-primary-hover focus:text-text-primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      {m.id}
                      {m.supportsImage ? (
                        <span
                          title={t('settings.llm.imageSupported')}
                          className="inline-flex items-center gap-1 rounded bg-mr-surface-soft px-1.5 py-0.5 text-mr-micro font-medium text-emerald-400"
                        >
                          <ImageGlyph size={10} />
                          {t('settings.llm.imageBadge')}
                        </span>
                      ) : (
                        <span
                          title={t('settings.llm.imageNotSupported')}
                          className="inline-flex items-center rounded bg-mr-surface-soft px-1.5 py-0.5 text-mr-micro font-medium text-neutral-500"
                        >
                          {t('settings.llm.textOnlyBadge')}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* API key + connection test side by side — keeps the key input a sane width
          in a wide card instead of stretching it across the whole row. */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 min-h-[1.25rem]">
            <label
              htmlFor="apiKey"
              className="flex items-center gap-2 text-body-2-medium text-text-primary"
            >
              <LockClosedIcon className="w-3.5 h-3.5" />
              {t('settings.llm.apiKeyLabel')}
            </label>
            {meta?.keyUrl && (
              <a
                href={meta.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-300 transition-colors hover:text-sky-200"
              >
                {t('settings.llm.getKeyLink')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="relative">
            <Input
              id="apiKey"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={'sk-...'}
              className={`${inputClass} pr-10`}
            />
            <Button
              variant="secondary"
              size="xs"
              iconOnly
              leadingIcon={showKey ? RiEyeOffLine : RiEyeLine}
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? t('settings.llm.hideKey') : t('settings.llm.showKey')}
              className="absolute right-2 top-1/2 -translate-y-1/2 border-transparent bg-transparent text-text-secondary shadow-none hover:border-border-button-hover"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <span className="block min-h-[1.25rem]" aria-hidden="true" />
          <div className="flex h-9 min-w-0 items-center gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={handleTest}
              disabled={!canTest || testState === 'testing'}
              className="shrink-0"
            >
              {testState === 'testing' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <PlugZap size={13} />
              )}
              {testState === 'testing' ? t('settings.llm.testing') : t('settings.llm.testConnection')}
            </Button>
          </div>
          {testState === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                {testMsg || t('settings.llm.testConnected')}
                {testImageSupport !== undefined && (
                  <>
                    {' · '}
                    {testImageSupport
                      ? t('settings.llm.imageSupported')
                      : t('settings.llm.imageNotSupported')}
                  </>
                )}
              </span>
            </span>
          )}
          {testState === 'error' && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-red-400">
              <XCircle size={14} className="shrink-0" />
              <span className="min-w-0">
                {testKind ? (
                  <>
                    <span>{t(`settings.llm.testErrors.${testKind}`)}</span>
                    {testMsg && (
                      <span className="block truncate text-mr-label text-red-400/60" title={testMsg}>
                        {testMsg}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="truncate">{testMsg || t('settings.llm.testFailed')}</span>
                )}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Advanced — Base URL + Max Tokens, prefilled. Collapsed for presets. */}
      <div className="mt-5 border-t border-separator-border pt-4">
        {!isCustom && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="border-transparent bg-transparent text-text-secondary shadow-none hover:border-border-button-hover"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
            {t('settings.llm.advanced')}
          </Button>
        )}
        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <label htmlFor="baseUrl" className="text-body-2-medium text-text-primary">
                  {t('settings.llm.baseUrlLabel')}
                </label>
                <Input
                  id="baseUrl"
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={'https://api.openai.com/v1'}
                  className={inputClass}
                />
                {/* 这家的端点是工作区级的模板,原样保存必然连不上——把待替换的部分说明白。 */}
                {meta?.baseUrlNeedsEdit && baseUrl.includes('{') && (
                  <p className="text-mr-label leading-snug text-amber-400/80">
                    {t('settings.llm.baseUrlNeedsEdit')}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="maxTokens" className="text-body-2-medium text-text-primary">
                  {t('settings.llm.maxTokensLabel')}
                </label>
                <Input
                  id="maxTokens"
                  type="number"
                  value={maxTokens}
                  min={1024}
                  max={65536}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  placeholder="8192"
                  className={inputClass}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
