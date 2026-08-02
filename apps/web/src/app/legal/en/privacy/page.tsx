import { LegalDocument, legalMetadata } from '@/lib/extensions/legal';

export const metadata = legalMetadata.privacy.en;

export default function Page() {
  return <LegalDocument doc="privacy" locale="en" />;
}
