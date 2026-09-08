import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draftssistant // AI Fantasy Football War Room",
  description: "Real-time AI-assisted live fantasy football snake draft assistant and war room",
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
