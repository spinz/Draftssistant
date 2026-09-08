import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova // Mission Control",
  description: "Homelab & Network Operations Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
