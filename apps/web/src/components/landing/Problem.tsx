import Reveal from "./Reveal";

export default function Problem() {
  return (
    <section className="section problem">
      <div className="container problem__wrap">
        <Reveal>
          <p className="label">The problem</p>
          <h2 className="heading">Most mileage apps let you down</h2>
        </Reveal>
        <Reveal delay="reveal-d1">
          <p className="problem__body" style={{ marginTop: "1.5rem" }}>
            They promise background tracking, then miss half your trips. Your
            records end up full of gaps, and come tax time you&apos;re guessing
            instead of claiming what you&apos;re actually owed.
          </p>
        </Reveal>
        <Reveal delay="reveal-d2">
          <p className="problem__body">
            <span className="problem__em">
              MileClear was built to fix that.
            </span>{" "}
            Automatic detection, offline-first storage, and every trip accounted for.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
