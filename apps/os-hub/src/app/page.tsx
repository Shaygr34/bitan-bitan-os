export default function Home() {
  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    "unknown";
  const buildTime = process.env.BUILD_TIME ?? "unknown";

  return (
    <div>
      <h1 style={{ fontSize: "var(--font-size-h1)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
        Bitan &amp; Bitan OS Hub
      </h1>
      <p style={{ color: "var(--color-muted)", maxWidth: "480px", lineHeight: 1.6 }}>
        Welcome to the operational hub. Use the sidebar to navigate between
        channels.
      </p>
      <footer
        style={{
          marginTop: "var(--space-2xl)",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-subtle)",
          lineHeight: 1.8,
        }}
      >
        <div>Commit: {commit.slice(0, 7)}</div>
        <div>Built: {buildTime}</div>
      </footer>
    </div>
  );
}
