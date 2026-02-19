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
        <a href="#" className="nav__logo">
          <span className="logo-mark" aria-hidden="true">M</span>
          MileClear
        </a>

        <ul className="nav__links">
          <li><a href="#features" className="nav__link">Features</a></li>
          <li><a href="#pricing" className="nav__link">Pricing</a></li>
          <li><a href="#faq" className="nav__link">FAQ</a></li>
        </ul>

        <a href="#early-access" className="nav__cta">Get Early Access</a>

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
        <a href="#features" onClick={close}>Features</a>
        <a href="#pricing" onClick={close}>Pricing</a>
        <a href="#faq" onClick={close}>FAQ</a>
        <a href="#early-access" className="nav__mobile-cta" onClick={close}>
          Get Early Access
        </a>
      </div>
    </nav>
  );
}
