import type { NumberDerivation } from "@mileclear/shared";

/** One "how we worked this out" block, exactly as the server returns it. */
export function Derivation({ title, d }: { title: string; d: NumberDerivation }) {
  return (
    <div className="mc-tax-deriv">
      <h3>{title}</h3>
      <p className="mc-tax-text">{d.summary}</p>
      {d.formula && <p className="mc-tax-deriv__formula">{d.formula}</p>}
      {d.components.length > 0 && (
        <ul className="mc-tax-kv">
          {d.components.map((c, i) => (
            <li key={`${c.label}-${i}`} className={c.highlight ? "is-total" : undefined}>
              <span className="mc-tax-kv__label">{c.label}</span>
              <span className="mc-tax-kv__value">{c.value}</span>
            </li>
          ))}
        </ul>
      )}
      {d.sources && d.sources.length > 0 && (
        <ul>
          {d.sources.map((s, i) => (
            <li key={`${s.kind}-${i}`}>
              {s.description}: {s.count.toLocaleString("en-GB")}
            </li>
          ))}
        </ul>
      )}
      {d.notes && d.notes.length > 0 && (
        <ul>
          {d.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
