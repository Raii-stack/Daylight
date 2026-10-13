"use client"

import dynamic from "next/dynamic"

const DaylightApp = dynamic(() => import("../src/DaylightApp"), { ssr: false })

export default function ClientApp() {
  return <DaylightApp />
}
