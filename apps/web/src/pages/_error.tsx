import type { NextPageContext } from "next";

function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#030712",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: 700, margin: 0 }}>
          {statusCode}
        </h1>
        <p style={{ color: "#8494a7", marginTop: "0.5rem" }}>
          {statusCode === 404
            ? "This page doesn\u2019t exist."
            : "Something went wrong."}
        </p>
        <a
          href="/"
          style={{ color: "#f5a623", textDecoration: "none", fontWeight: 600 }}
        >
          Back to MileClear
        </a>
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode: statusCode ?? 500 };
};

export default ErrorPage;
