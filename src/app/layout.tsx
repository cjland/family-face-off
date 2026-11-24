import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fredoka";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Face-Off",
  description: "A party quiz game about the people in the room.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f2e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
