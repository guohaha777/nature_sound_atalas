"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

export const PAGE_TRANSITION_EVENT = "wanwu:page-transition-start";

export function startPageTransition() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("is-page-transitioning");
  window.dispatchEvent(new Event(PAGE_TRANSITION_EVENT));
}

export function finishPageTransition() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("is-page-transitioning");
}

export function usePageRouter() {
  const router = useRouter();
  return useMemo(() => ({
    push(href: string) {
      startPageTransition();
      router.push(href);
    },
    back() {
      startPageTransition();
      router.back();
    },
  }), [router]);
}
