'use client';

// Fires a GA4 `page_view` event on every Next.js App Router navigation.
// Without this, gtag('config', ...) in the root layout only fires once on
// initial load — client-side Link navigations are invisible to GA4, which
// causes the pageview count, top-pages list, and engagement time to all
// look artificially low.

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function GAPageTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (typeof window === 'undefined' || !window.gtag) return;

    const search = searchParams?.toString();
    const path = search ? `${pathname}?${search}` : pathname;

    window.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.origin + path,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}

// useSearchParams() must be wrapped in Suspense per Next 15 requirements.
export default function GAPageTracker() {
  return (
    <Suspense fallback={null}>
      <GAPageTrackerInner />
    </Suspense>
  );
}
