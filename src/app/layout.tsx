import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Online Examination System",
  description: "Online Examination System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
