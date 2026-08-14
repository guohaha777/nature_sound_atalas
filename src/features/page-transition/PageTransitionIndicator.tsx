"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { finishPageTransition, startPageTransition } from "./pageTransition";

export function PageTransitionIndicator() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const frame = window.requestAnimationFrame(finishPageTransition);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search]);

  useEffect(() => {
    const beginForInternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      const next = new URL(link.href);
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      startPageTransition();
    };
    document.addEventListener("click", beginForInternalLink, true);
    return () => document.removeEventListener("click", beginForInternalLink, true);
  }, []);

  return <div className="page-transition-indicator" role="status" aria-live="polite"><span /><b>正在前往下一段声音</b></div>;
}
