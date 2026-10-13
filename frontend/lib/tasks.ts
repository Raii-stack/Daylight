export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export type Task = {
  id: string
  user_id: string
  name: string
  duration_minutes: number
  priority: TaskPriority
  deadline: string
  sort_order?: number
  created_at?: string
}

export type AddTaskInput = {
  name: string
  duration_minutes: number
  priority: TaskPriority
  deadline: string | Date
}
