"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface PageMeta {
  title: string;
  back?: { href: string; label: string };
}

interface PageMetaCtx {
  meta: PageMeta;
  setMeta: (m: PageMeta) => void;
}

const Ctx = createContext<PageMetaCtx>({ meta: { title: "" }, setMeta: () => {} });

/** Holds the current page's title and back link so the top bar can show them. */
export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: "" });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageMeta(): PageMetaCtx {
  return useContext(Ctx);
}
