"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminIcon } from "./icons";
import { ADMIN_NAV, ADMIN_ROOT, findActiveNav, type AdminNavItem } from "./nav";

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

function NavLink({ item, pathname, activeHref, activeChildHref }: { item: AdminNavItem; pathname: string; activeHref: string | null; activeChildHref: string | null }) {
  const inSection = activeHref === item.href;
  const exact = inSection && !activeChildHref;
  return (
    <li>
      <Link
        href={item.href}
        className={`adm-side__link${inSection ? " adm-side__link--in" : ""}${exact ? " adm-side__link--active" : ""}`}
        aria-current={exact ? "page" : undefined}
        title={item.hint}
      >
        <span className="adm-side__icon"><AdminIcon name={item.icon} /></span>
        <span className="adm-side__label">{item.label}</span>
        {item.isNew && <span className="adm-side__new">New</span>}
      </Link>
      {item.children && item.children.length > 0 && (
        <ul className="adm-side__children">
          {item.children.map((c) => {
            const on = activeChildHref === c.href || pathname === c.href;
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  className={`adm-side__child${on ? " adm-side__child--active" : ""}`}
                  aria-current={on ? "page" : undefined}
                >
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** The admin area's frame: grouped sidebar (a drawer on narrower screens),
 *  a top bar with where-you-are and the find-a-user search, and the page. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ADMIN_ROOT;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  const active = findActiveNav(pathname);

  // Close the drawer whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // "/" jumps to the user search; Escape closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(document.activeElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `${ADMIN_ROOT}/users?q=${encodeURIComponent(q)}` : `${ADMIN_ROOT}/users`);
    searchRef.current?.blur();
  };

  const crumbs: Array<{ label: string; href?: string }> = [{ label: "Admin", href: ADMIN_ROOT }];
  if (active && active.item.href !== ADMIN_ROOT) {
    if (active.group.label) crumbs.push({ label: active.group.label });
    crumbs.push({ label: active.item.label, href: active.child ? active.item.href : undefined });
    if (active.child) crumbs.push({ label: active.child.label });
  } else if (active) {
    crumbs.push({ label: "Overview" });
  }

  return (
    <div className="adm">
      <button
        type="button"
        className={`adm-backdrop${open ? " adm-backdrop--open" : ""}`}
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <aside id="adm-side" className={`adm-side${open ? " adm-side--open" : ""}`} aria-label="Admin">
        <div className="adm-side__head">
          <Link href={ADMIN_ROOT} className="adm-side__brand">
            <span className="adm-side__mark" aria-hidden="true">
              <AdminIcon name="overview" size={16} />
            </span>
            <span>
              <span className="adm-side__title">Admin</span>
              <span className="adm-side__sub">MileClear</span>
            </span>
          </Link>
          <button type="button" className="adm-iconbtn adm-side__close" onClick={() => setOpen(false)} aria-label="Close admin menu">
            <AdminIcon name="close" />
          </button>
        </div>
        <nav className="adm-side__nav" aria-label="Admin sections">
          {ADMIN_NAV.map((group, gi) => (
            <div className="adm-side__group" key={group.label ?? `g${gi}`}>
              {group.label && <p className="adm-side__group-label">{group.label}</p>}
              <ul className="adm-side__list">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    activeHref={active?.item.href ?? null}
                    activeChildHref={active?.child?.href ?? null}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="adm-side__foot">
          <Link href="/dashboard" className="adm-side__back">
            <AdminIcon name="arrowLeft" size={14} />
            Back to my dashboard
          </Link>
          <p>
            Press <kbd>/</kbd> to find a user
          </p>
        </div>
      </aside>

      <div className="adm-main">
        <div className="adm-topbar">
          <button
            ref={menuBtnRef}
            type="button"
            className="adm-iconbtn adm-topbar__menu"
            onClick={() => setOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={open}
            aria-controls="adm-side"
          >
            <AdminIcon name="menu" />
            <span className="adm-topbar__menu-label">Admin menu</span>
          </button>
          <nav className="adm-crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((c, i) => (
                <li key={i}>
                  {c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <form className="adm-search" role="search" onSubmit={onSearch}>
            <label htmlFor="adm-user-search" className="adm-sr">Find a user by email or name</label>
            <span className="adm-search__icon"><AdminIcon name="search" size={16} /></span>
            <input
              ref={searchRef}
              id="adm-user-search"
              type="search"
              placeholder="Find a user by email or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="adm-search__hint" aria-hidden="true">/</kbd>
          </form>
        </div>
        <div className="adm-content">{children}</div>
      </div>
    </div>
  );
}
