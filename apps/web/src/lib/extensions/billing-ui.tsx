import type { AccountTabContribution, MenuItemProps } from './contracts';

/**
 * Pricing UI slot — the open-source build has no paywall to show.
 *
 * The commercial build replaces this module with the commercial billing
 * package, which renders the real pricing modal. Rendering nothing here matches
 * what the app already did in self-hosted mode, where the modal short-circuited
 * on `isCloudMode`.
 */
export function PricingModal() {
  return null;
}

/**
 * Checkout slot — the stop-over between picking a plan and leaving for the
 * payment channel.
 *
 * Same reasoning as the modal above, plus one of its own: the page's whole job
 * is to name the payment methods a buyer can use, and naming them is exactly
 * what this side of the line must not do. `app/billing/checkout/page.tsx` is a
 * shell because the overlay cannot add a route; everything it renders lives in
 * the commercial package.
 */
export function CheckoutPage() {
  return null;
}

/** Body of `/billing/return` — the payment channel's `return_url`. Nothing to poll here. */
export function BillingReturnPage() {
  return null;
}

/** The upgrade strip under the AI composer. */
export function ComposerUpgradeBanner(props: { retired?: boolean }) {
  void props;
  return null;
}

/** The quota popover in the AI panel header. */
export function AiQuotaIndicator() {
  return null;
}

/** The plan-and-usage card in the account modal header. */
export function AccountPlanSummary() {
  return null;
}

/** The upgrade row at the top of the account menu. */
export function UpgradeMenuItem(props: MenuItemProps) {
  void props;
  return null;
}

/** No billing tab in the account modal. */
export const billingAccountTab: AccountTabContribution | null = null;
