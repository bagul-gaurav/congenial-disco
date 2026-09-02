import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Studio",
  description: "Design components and export them as Framer code components.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-chrome-bg text-chrome-text antialiased">{children}</body>
    </html>
  )
}
