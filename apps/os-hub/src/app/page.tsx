export default function Home() {
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? "unknown";

  return (
    <div>
      <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Bitan &amp; Bitan OS Hub
      </h1>
      <p style={{ color: "#666", maxWidth: "480px", lineHeight: 1.6 }}>
        Welcome to the operational hub. Use the sidebar to navigate between
        channels.
      </p>
      <footer style={{ marginTop: "3rem", fontSize: "0.75rem", color: "#999" }}>
        Commit: {commit.slice(0, 7)}
      </footer>
    </div>
  );
}
