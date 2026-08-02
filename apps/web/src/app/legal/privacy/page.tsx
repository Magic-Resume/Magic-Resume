import { LegalDocument, legalMetadata } from '@/lib/extensions/legal';

export const metadata = legalMetadata.privacy.zh;

export default function Page() {
  return <LegalDocument doc="privacy" locale="zh" />;
}
