import { redirect } from 'next/navigation';

// The marketing site is the standalone Astro app (apps/landing); this app
// opens straight on the resume dashboard.
export default function Home() {
  redirect('/dashboard');
}
