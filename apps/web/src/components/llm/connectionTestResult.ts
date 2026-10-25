import { MODEL_IMAGE_SUPPORT_MAP } from '@/lib/constants/modals';

/** A measured negative result must override a catalog entry just like a positive result. */
export function testImageSupportForModel(measured: boolean | undefined, model: string): boolean | undefined {
  return measured ?? MODEL_IMAGE_SUPPORT_MAP[model];
}

export function connectionTestText(
  latencyText: string,
  supportsImage: boolean | undefined,
  t: (key: string) => string,
): string {
  const connected = latencyText || t('settings.llm.testConnected');
  return supportsImage === undefined
    ? connected
    : `${connected} · ${t(supportsImage ? 'settings.llm.imageSupported' : 'settings.llm.imageNotSupported')}`;
}
