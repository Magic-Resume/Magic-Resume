/**
 * Compatibility facade for the web app's historical import path.
 * Canonical document fields live in @magic-resume/resume-schema; only client
 * lifecycle metadata (versions and required local identifiers) is added here.
 */
import type {
  CustomInfoField,
  CustomTemplateConfig,
  Info,
  Resume as SchemaResume,
  Section,
  SectionItem,
  SectionOrderItem,
} from '@magic-resume/resume-schema';

export type { CustomInfoField, CustomTemplateConfig, Section, SectionItem };
export type InfoType = Info;
export type SectionOrder = SectionOrderItem;

export type ResumeVersion = {
  id: string;
  updatedAt: number;
  type: 'auto' | 'manual';
  data: Omit<Resume, 'versions'>;
  name?: string;
};

export type Resume = Omit<SchemaResume, 'id' | 'updatedAt'> & {
  id: string;
  updatedAt: number;
  versions?: ResumeVersion[];
};

// Cloud version shape returned by the API.
export interface CloudVersion {
  id: string;
  createdAt?: string;
  timestamp?: number;
  changelog?: string;
  type?: string;
  content: string | object;
}

export interface CloudResume {
  id: string;
  title: string;
  updatedAt: string;
  content: string | object;
  isPublic: boolean;
  shareId?: string;
  shareRole: 'VIEWER' | 'COMMENTER' | 'EDITOR';
  /** 服务端乐观锁版本号,作为下次 PATCH 的 baseRevision. */
  revision?: number;
  versions?: CloudVersion[];
}
