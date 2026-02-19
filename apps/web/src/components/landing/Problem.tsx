import Reveal from "./Reveal";

export default function Problem() {
  return (
    <section className="section problem">
      <div className="container problem__wrap">
        <Reveal>
          <p className="label">The problem</p>
          <h2 className="heading">Sick of losing miles?</h2>
        </Reveal>
        <Reveal delay="reveal-d1">
          <p className="problem__body" style={{ marginTop: "1.5rem" }}>
            Other mileage trackers promise to run in the background. Then they
            don&apos;t. Trips vanish. Months of data disappear. You end up
            paying more tax than you should because your records have gaps.
          </p>
        </Reveal>
        <Reveal delay="reveal-d2">
          <p className="problem__body">
            <span className="problem__em">
              MileClear was built to fix that.
            </span>{" "}
            Every mile, every trip, every time.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
