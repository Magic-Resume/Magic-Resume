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
