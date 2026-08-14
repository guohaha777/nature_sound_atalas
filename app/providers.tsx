"use client";

import { Suspense } from "react";
import { CompositionRoot } from "@/src/app";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="page-loading-fallback" role="status"><span /><b>正在整理声音…</b></div>}>
      <CompositionRoot>{children}</CompositionRoot>
    </Suspense>
  );
}
