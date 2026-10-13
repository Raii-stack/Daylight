import { getTasks } from "../actions/tasks"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const tasks = await getTasks()
  return (
    <main>
      <h1>Dashboard</h1>
      <p>{tasks.length} task(s) planned.</p>
    </main>
  )
}
