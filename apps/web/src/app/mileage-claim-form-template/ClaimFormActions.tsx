"use client";

import { useState } from "react";

const pillBtn: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "0.9375rem",
  padding: "0.75rem 1.5rem",
  borderRadius: "var(--r-full)",
  border: "none",
  cursor: "pointer",
};

export function PrintFormButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{ ...pillBtn, background: "var(--amber-400)", color: "var(--bg-deep)" }}
    >
      Print this form
    </button>
  );
}

export function CopyPlainTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        ...pillBtn,
        background: copied ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.05)",
        color: copied ? "var(--emerald-400)" : "var(--text-primary)",
        border: `1px solid ${copied ? "rgba(16, 185, 129, 0.35)" : "var(--border-default)"}`,
      }}
      aria-live="polite"
    >
      {copied ? "Copied to clipboard" : "Copy as plain text"}
    </button>
  );
}
