import Reveal from "./Reveal";

export default function Problem() {
  return (
    <section className="section problem">
      <div className="container problem__wrap">
        <Reveal>
          <h2 className="heading">
            A tracker that stops in your pocket costs you in January.
          </h2>
        </Reveal>
        <Reveal delay="reveal-d1">
          <p className="problem__body" style={{ marginTop: "1.5rem" }}>
            Missing trips do not announce themselves. They turn up as gaps in the log at tax
            time, when you are guessing instead of claiming.{" "}
            <span className="problem__em">MileClear was built to fix that.</span> It finds your
            trips on its own, writes them to your phone first, and keeps them when the signal
            drops.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
