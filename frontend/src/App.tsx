import { lazy, Suspense } from "react"

const Planner = lazy(() => import("./pages/Planner"))

// Mounts the active application page and keeps the heavy planner out of the shell chunk.
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f8f9fc] text-sm text-[#817c91]">
          Loading your planner...
        </div>
      }
    >
      <Planner />
    </Suspense>
  )
}
