// Public root — intentionally minimal. Carries NO project data (vault rule §8.9).
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div>
        <div
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#0A9AA7",
            fontWeight: 800,
            fontSize: 18,
            marginBottom: 16,
          }}
        >
          Jom
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>JomChats</h1>
        <p style={{ color: "#8A97AC", marginTop: 8, fontSize: 14 }}>
          never miss another customer
        </p>
      </div>
    </main>
  );
}
