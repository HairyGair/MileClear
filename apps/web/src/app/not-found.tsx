export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        color: "#fff",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "3rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        404
      </h1>
      <p style={{ fontSize: "1.125rem", color: "#8494a7", marginBottom: "2rem" }}>
        This page doesn&apos;t exist.
      </p>
      <a
        href="/"
        style={{
          color: "#f5a623",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Back to MileClear
      </a>
    </main>
  );
}
