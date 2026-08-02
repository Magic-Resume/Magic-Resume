import { LegalDocument, legalMetadata } from '@/lib/extensions/legal';

export const metadata = legalMetadata.terms.en;

export default function Page() {
  return <LegalDocument doc="terms" locale="en" />;
}
