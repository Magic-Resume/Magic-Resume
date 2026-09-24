import type { ComponentType } from 'react';
import type { HoverSurfaceBinding } from '@/components/ui/hover-surface';
import type { AccountTab } from '@/store/useAccountUiStore';

/**
 * Shapes shared by the open-source stubs and the commercial overlay.
 *
 * Deliberately NOT a slot: nothing replaces this module. The overlay's build
 * step rewrites each slot stub into a shim that forwards runtime values only,
 * so a type declared inside a stub is gone the moment the stub is replaced.
 * Types both sides compile against therefore live here, where the overlay can
 * import them by the same `@/` specifier the app uses.
 *
 * Types only — no values, so importing it can never pull code into a bundle.
 */

/**
 * A tab a slot adds to the account modal.
 *
 * The modal owns the rail, the ordering and the layout; the slot supplies the
 * label and what the panel renders. A build that has no such tab exports
 * `null` instead, and the rail simply has one tab fewer.
 */
export type AccountTabContribution = {
  key: Extract<AccountTab, 'billing' | 'invite'>;
  /** i18n key for the rail label. */
  labelKey: string;
  /** Rendered full width, with no side rail. */
  Panel: ComponentType;
};

/**
 * Props for a control that sits inside a host-owned hover surface — the
 * editor header's tool cluster, the account menu's rows.
 *
 * The host keeps the surface (one sliding highlight shared by every item in
 * the cluster), so the slot receives the binding the host created rather than
 * making its own. Spread it onto the interactive element.
 */
export type SurfaceProps = {
  surface: HoverSurfaceBinding;
};

/** A row in the account menu: `run` closes the menu, then performs the action. */
export type MenuItemProps = SurfaceProps & {
  run: (action: () => void) => void;
};

/** Translation trees the `locales` slot contributes, one per app language. */
export type ExtensionResources = {
  zh: Record<string, unknown>;
  en: Record<string, unknown>;
};
