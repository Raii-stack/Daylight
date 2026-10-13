"use client"

import dynamic from "next/dynamic"

const DaylightApp = dynamic(() => import("../src/App"), { ssr: false })

export default function ClientApp() {
  return <DaylightApp />
}
