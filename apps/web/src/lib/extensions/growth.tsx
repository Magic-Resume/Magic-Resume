import { notFound } from 'next/navigation';
import type { AccountTabContribution, SurfaceProps } from './contracts';

/**
 * Referral slot — the open-source build has no referral programme.
 *
 * The commercial build replaces this module with the commercial billing
 * package, which owns invite links, the poster, and claiming a code after
 * sign-up (rewards are credit, so they live with billing). Here every mount
 * point renders nothing, which is what a self-hosted deployment already did:
 * each of these was gated on `isCloudMode`.
 */

/** Poster dialog, mounted once beside the other account overlays. */
export function InvitePosterModal() {
  return null;
}

/** Claims a pending invite code once the visitor is signed in. */
export function ReferralClaimer() {
  return null;
}

/** The invite entry in the editor header's tool cluster. */
export function InviteHeaderAction(props: SurfaceProps) {
  void props;
  return null;
}

/**
 * Body of the `/i/[code]` route. The route shell stays in this tree because the
 * overlay cannot add a route; a build with no referral programme has nothing
 * at that address, so it 404s — the same answer `legal.tsx` gives.
 *
 * `: never` for the same reason as there: `notFound()` never returns, and a
 * component typed `void` is not a valid JSX element type.
 */
export function InviteLanding(): never {
  notFound();
}

/** No invite tab in the account modal. */
export const inviteAccountTab: AccountTabContribution | null = null;
