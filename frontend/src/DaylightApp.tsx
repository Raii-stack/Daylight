import React, { useEffect, useState } from "react"
import { createClient, SupabaseClient, User } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

type Task = {
  id: string
  user_id: string
  name: string
  duration_minutes: number
  priority: string
  deadline: string
  created_at?: string
}

export default function DaylightApp() {
  const [user, setUser] = useState<User | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [newTaskName, setNewTaskName] = useState("")
  const [newTaskMinutes, setNewTaskMinutes] = useState(30)
  const [newTaskPriority, setNewTaskPriority] = useState<"Low" | "Medium" | "High">("Medium")
  const [newTaskDeadline, setNewTaskDeadline] = useState(() => new Date().toISOString().slice(0, 16))

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(data.user ?? null)
      if (data.user) await loadTasks()
      setLoading(false)
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadTasks()
      if (!session?.user) setTasks([])
    })

    return () => {
      mounted = false
      listener?.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadTasks() {
    if (!supabase) return
    const { data, error } = await supabase
      .from<Task>("tasks")
      .select("*")
      .order("deadline", { ascending: true })
    if (error) {
      console.error("Failed to load tasks:", error.message)
      return
    }
    setTasks(data ?? [])
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/dashboard" } })
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) alert(error.message)
    else alert("Check your email for a login link (magic link).")
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setTasks([])
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return alert("Sign in first")
    if (!newTaskName.trim()) return alert("Name required")
    const payload = {
      user_id: user.id,
      name: newTaskName.trim(),
      duration_minutes: Number(newTaskMinutes),
      priority: newTaskPriority,
      deadline: new Date(newTaskDeadline).toISOString(),
    }
    const { data, error } = await supabase.from("tasks").insert(payload).select().single()
    if (error) return alert("Failed to add task: " + error.message)
    setTasks((t) => [...t, data as Task])
    setNewTaskName("")
  }

  async function handleDeleteTask(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id)
    if (error) return alert("Failed to delete: " + error.message)
    setTasks((t) => t.filter((x) => x.id !== id))
  }

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ padding: 20 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <h1>Daylight — Time Management Planner</h1>
        {user ? (
          <>
            <div>Signed in as {user.email}</div>
            <button onClick={signOut}>Sign out</button>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={signInWithGoogle}>Sign in with Google</button>
            <form onSubmit={signInWithEmail} style={{ display: "inline-flex", gap: 8 }}>
              <input
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
              <button type="submit">Send magic link</button>
            </form>
          </div>
        )}
      </header>

      {user && (
        <section style={{ marginTop: 24 }}>
          <h2>Your tasks</h2>
          <ul>
            {tasks.map((task) => (
              <li key={task.id} style={{ marginBottom: 8 }}>
                <strong>{task.name}</strong> — {task.duration_minutes}m — {task.priority} — {new Date(task.deadline).toLocaleString()}
                <button style={{ marginLeft: 8 }} onClick={() => handleDeleteTask(task.id)}>Delete</button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleAddTask} style={{ marginTop: 16, display: "grid", gap: 8, maxWidth: 420 }}>
            <input placeholder="Task name" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} />
            <input type="number" value={newTaskMinutes} onChange={(e) => setNewTaskMinutes(Number(e.target.value))} min={1} />
            <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as any)}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>
            <input type="datetime-local" value={newTaskDeadline} onChange={(e) => setNewTaskDeadline(e.target.value)} />
            <button type="submit">Add task</button>
          </form>
        </section>
      )}

      {!user && (
        <section style={{ marginTop: 24 }}>
          <p>Sign in with Google or request a magic link using your email to test auth flows.</p>
        </section>
      )}
    </div>
  )
}
