import { LegalDocument, legalMetadata } from '@/lib/extensions/legal';

export const metadata = legalMetadata.refund.zh;

export default function Page() {
  return <LegalDocument doc="refund" locale="zh" />;
}
