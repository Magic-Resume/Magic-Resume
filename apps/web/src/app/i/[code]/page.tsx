import { InviteLanding } from '@/lib/extensions/growth';

/**
 * Route shell for invite links (`/i/{code}`). The overlay cannot add a route,
 * so the route lives here and renders the `growth` slot: the commercial build
 * stores the code and continues to the dashboard; a build with no referral
 * programme has nothing at this address and 404s.
 */
export default function InviteRoute() {
  return <InviteLanding />;
}
