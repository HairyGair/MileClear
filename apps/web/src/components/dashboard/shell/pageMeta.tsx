"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

  // Next re-applies the root (marketing) <title> after some navigations and
  // client re-renders. Watch the tag and put the page title back.
  useEffect(() => {
    if (!meta.title) return;
    const want = `${meta.title} · MileClear`;
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    const el = document.querySelector("title");
    if (!el) return;
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [meta.title]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePageMeta(): PageMetaCtx {
  return useContext(Ctx);
}
