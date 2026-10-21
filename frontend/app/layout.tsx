import type { Metadata } from "next"

import "../src/index.css"

export const metadata: Metadata = {
  title: "Daylight",

  description: "A time management planner",
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

// Provides an early connection hint for the auth and task API host.

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {supabaseUrl && (
          <link rel="preconnect" href={supabaseUrl} crossOrigin="anonymous" />
        )}
      </head>
      <body>{children}</body>
    </html>
  )
}
