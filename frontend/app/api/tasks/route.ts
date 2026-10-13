import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "../../../lib/supabase/server"
import { TASK_PRIORITIES, type AddTaskInput, type Task } from "../../../lib/tasks"

const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("You must be signed in to manage tasks.")
  }

  return { supabase, user }
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to manage tasks." },
    { status: error instanceof Error && error.message.includes("signed in") ? 401 : 400 },
  )
}

function validateTaskInput(input: AddTaskInput) {
  if (!input.name.trim()) throw new Error("Task name is required.")
  if (!Number.isInteger(input.duration_minutes) || input.duration_minutes <= 0) {
    throw new Error("Duration must be a positive whole number.")
  }
  if (!TASK_PRIORITIES.includes(input.priority)) {
    throw new Error("Priority is invalid.")
  }

  const deadline = new Date(input.deadline)
  if (Number.isNaN(deadline.getTime())) throw new Error("Deadline is invalid.")
  return { ...input, name: input.name.trim(), deadline: deadline.toISOString() }
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedClient()
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("deadline", { ascending: true })

    if (error) throw new Error(`Unable to load tasks: ${error.message}`)
    return NextResponse.json((data ?? []) as Task[])
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const input = validateTaskInput((await request.json()) as AddTaskInput)
    const { supabase, user } = await getAuthenticatedClient()
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...input, user_id: user.id, sort_order: Date.now() })
      .select()
      .single()

    if (error) throw new Error(`Unable to add task: ${error.message}`)
    return NextResponse.json(data as Task, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id?: string }
    if (!id || !taskIdPattern.test(id)) throw new Error("Task ID is invalid.")

    const { supabase, user } = await getAuthenticatedClient()
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) throw new Error(`Unable to delete task: ${error.message}`)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const { taskIds } = (await request.json()) as { taskIds?: string[] }
    if (
      !Array.isArray(taskIds) ||
      taskIds.some((taskId) => !taskIdPattern.test(taskId))
    ) {
      throw new Error("Task ID is invalid.")
    }

    const { supabase, user } = await getAuthenticatedClient()
    const { data: ownedTasks, error: loadError } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)

    if (loadError) {
      throw new Error(`Unable to verify task order: ${loadError.message}`)
    }
    const ownedIds = new Set((ownedTasks ?? []).map((task) => task.id))
    if (
      taskIds.length !== ownedIds.size ||
      taskIds.some((id) => !ownedIds.has(id))
    ) {
      throw new Error("Task order contains tasks that do not belong to this account.")
    }

    for (const [index, taskId] of taskIds.entries()) {
      const { error } = await supabase
        .from("tasks")
        .update({ sort_order: index })
        .eq("id", taskId)
        .eq("user_id", user.id)
      if (error) throw new Error(`Unable to save task order: ${error.message}`)
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return errorResponse(error)
  }
}
