import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JomChats",
  description: "JomChats",
  robots: { index: false, follow: false }, // §8.9 — no public indexing
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#031D41",
          color: "#F5F8FA",
        }}
      >
        {children}
      </body>
    </html>
  );
}
