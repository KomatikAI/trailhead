// Placeholder home page — Lane D replaces this with the marketing landing page.
// Kept deliberately minimal so the skeleton stays unopinionated.
export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Trailhead Cloud</h1>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        Placeholder home page. Marketing, pricing, and the post-checkout key claim
        flow land here (Lane D). The billing API and the Cloud API are already
        mounted under <code>/api/billing/*</code> and <code>/api/cloud/*</code>.
      </p>
    </main>
  );
}
