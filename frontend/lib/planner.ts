import type { Task } from "./tasks"

export type ScheduleStatus = {
  fits: boolean
  shortageOrSurplusMinutes: number
  percentageUsed: number
}

export type TimelineTask = Task & {
  startTime: Date
  endTime: Date
}

export function calculateScheduleStatus(
  availableMinutes: number,
  tasks: Task[],
): ScheduleStatus {
  const totalMinutes = tasks.reduce(
    (total, task) => total + task.duration_minutes,
    0,
  )
  const shortageOrSurplusMinutes = availableMinutes - totalMinutes
  return {
    fits: shortageOrSurplusMinutes >= 0,
    shortageOrSurplusMinutes,
    percentageUsed:
      availableMinutes > 0 ? (totalMinutes / availableMinutes) * 100 : 0,
  }
}

export function distributeTime(
  availableMinutes: number,
  taskCount: number,
): number {
  if (!Number.isFinite(availableMinutes) || availableMinutes < 0) {
    throw new Error("Available minutes must be non-negative.")
  }
  if (!Number.isInteger(taskCount) || taskCount <= 0) {
    throw new Error("Task count must be a positive whole number.")
  }
  return availableMinutes / taskCount
}

export function convertToTimeline(tasks: Task[], startTime: Date): TimelineTask[] {
  if (Number.isNaN(startTime.getTime())) throw new Error("Start time is invalid.")

  let cursor = new Date(startTime)
  return tasks.map((task) => {
    const taskStart = new Date(cursor)
    const endTime = new Date(
      taskStart.getTime() + task.duration_minutes * 60_000,
    )
    cursor = endTime
    return { ...task, startTime: taskStart, endTime }
  })
}
