/** Compatibility exports for template consumers. The persisted resume contract
 * is defined once in @magic-resume/resume-schema. */
export type {
  CustomInfoField,
  CustomTemplateConfig,
  Info as InfoType,
  Resume,
  Section,
  SectionItem,
  SectionOrderItem as SectionOrder,
} from '@magic-resume/resume-schema';

export type CustomItemField = {
  id: string;
  name: string;
  value: string;
};
