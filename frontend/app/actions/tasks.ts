"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "../../lib/supabase/server"
import {
  TASK_PRIORITIES,
  type AddTaskInput,
  type Task,
} from "../../lib/tasks"

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

export async function addTask(input: AddTaskInput): Promise<Task> {
  const validated = validateTaskInput(input)
  const { supabase, user } = await getAuthenticatedClient()
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...validated, user_id: user.id, sort_order: Date.now() })
    .select()
    .single()

  if (error) throw new Error(`Unable to add task: ${error.message}`)
  revalidatePath("/dashboard")
  return data as Task
}

export async function getTasks(): Promise<Task[]> {
  const { supabase, user } = await getAuthenticatedClient()
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("deadline", { ascending: true })

  if (error) throw new Error(`Unable to load tasks: ${error.message}`)
  return (data ?? []) as Task[]
}

export async function deleteTask(taskId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new Error("Task ID is invalid.")
  }

  const { supabase, user } = await getAuthenticatedClient()
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", user.id)

  if (error) throw new Error(`Unable to delete task: ${error.message}`)
  revalidatePath("/dashboard")
}

export async function reorderTasks(taskIds: string[]): Promise<void> {
  if (
    taskIds.some(
      (taskId) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          taskId,
        ),
    )
  ) {
    throw new Error("Task ID is invalid.")
  }

  const { supabase, user } = await getAuthenticatedClient()
  const { data: ownedTasks, error: loadError } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", user.id)

  if (loadError) throw new Error(`Unable to verify task order: ${loadError.message}`)
  const ownedIds = new Set((ownedTasks ?? []).map((task) => task.id))
  if (taskIds.length !== ownedIds.size || taskIds.some((id) => !ownedIds.has(id))) {
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

  revalidatePath("/dashboard")
}
