"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccountUiStore } from "@/store/useAccountUiStore";

/**
 * Deep link for the billing emails.
 *
 * Billing itself is a tab of the account modal — see
 * `components/account/billing/BillingTab`. This route exists because the
 * renewal letters need a URL, and it takes the same shape as
 * `/dashboard/settings`: open the right panel, then hand the user back to the
 * dashboard so the address bar does not keep a route that renders nothing.
 *
 * A real route rather than a query parameter on another one, because this URL
 * is read by a human in an email and should say where the button goes.
 */
export default function BillingRedirect() {
  const router = useRouter();
  const openAccount = useAccountUiStore((s) => s.openAccount);

  useEffect(() => {
    openAccount("billing");
    router.replace("/dashboard");
  }, [openAccount, router]);

  return null;
}
