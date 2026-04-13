"use client";

import { useState, useEffect } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => setOpen(false);

  return (
    <nav className={`nav${scrolled ? " nav--scrolled" : ""}`}>
      <div className="nav__inner">
        <a href="/" className="nav__logo">
          <img src="/branding/logo-120x120.png" alt="" className="logo-mark" aria-hidden="true" width={32} height={32} />
          MileClear
        </a>

        <ul className="nav__links">
          <li><a href="/features" className="nav__link">Features</a></li>
          <li><a href="/pricing" className="nav__link">Pricing</a></li>
          <li><a href="/faq" className="nav__link">FAQ</a></li>
          <li><a href="/updates" className="nav__link">Updates</a></li>
        </ul>

        <div className="nav__actions">
          <a href="/login" className="nav__link">Sign in</a>
          <a href="/register" className="nav__cta">Get Started</a>
        </div>

        <button
          className={`nav__burger${open ? " nav__burger--open" : ""}`}
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <span /><span /><span />
        </button>
      </div>

      <div className={`nav__mobile${open ? " nav__mobile--open" : ""}`}>
        <a href="/features" onClick={close}>Features</a>
        <a href="/pricing" onClick={close}>Pricing</a>
        <a href="/faq" onClick={close}>FAQ</a>
        <a href="/updates" onClick={close}>Updates</a>
        <a href="/login" onClick={close}>Sign in</a>
        <a href="/register" className="nav__mobile-cta" onClick={close}>
          Get Started
        </a>
      </div>
    </nav>
  );
}
