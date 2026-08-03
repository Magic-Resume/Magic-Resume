import { LegalDocument, legalMetadata } from '@/lib/extensions/legal';

export const metadata = legalMetadata.terms.zh;

export default function Page() {
  return <LegalDocument doc="terms" locale="zh" />;
}
