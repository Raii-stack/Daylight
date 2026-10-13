import type { Metadata } from "next"
import "../src/index.css"

export const metadata: Metadata = {
  title: "Daylight",
  description: "A time management planner",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
