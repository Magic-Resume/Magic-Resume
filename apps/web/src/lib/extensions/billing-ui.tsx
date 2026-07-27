/**
 * Pricing UI slot — the open-source build has no paywall to show.
 *
 * `next-config-overlay.mjs` aliases this module to the commercial billing
 * package, which renders the real pricing modal. Rendering nothing here matches
 * what the app already did in self-hosted mode, where the modal short-circuited
 * on `isCloudMode`.
 */
export function PricingModal() {
  return null;
}
