import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { Task as DatabaseTask } from "../../lib/tasks"
import {
  mdiArrowRight,
  mdiCalendarMonthOutline,
  mdiChartBoxOutline,
  mdiCheck,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClockOutline,
  mdiDeleteOutline,
  mdiLogout,
  mdiPlus,
  mdiViewDashboardOutline,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from "@mdi/js"

type Task = {
  id: string | number
  name: string
  minutes: number
  priority: string
  deadline: string
  emoji: string
  done: boolean
  actualMinutes?: number
}
type CompletionModal = {
  kind: "task" | "all" | "all-late"
  taskName: string
  emoji: string
}
type DayRecord = {
  tasks: Task[]
  availableMinutes: number
  startTime: string
}
type ToastMessage = {
  id: string
  message: string
  reminder: boolean
}
type IconProps = {
  name: string
  className?: string
}
// Renders one of the app's shared Material Design icons.
function Icon({ name, className = "" }: IconProps) {
  const paths: Record<string, string> = {
    grid: mdiViewDashboardOutline,
    clock: mdiClockOutline,
    chart: mdiChartBoxOutline,
    calendar: mdiCalendarMonthOutline,
    arrow: mdiArrowRight,
    plus: mdiPlus,
    check: mdiCheck,
    trash: mdiDeleteOutline,
    chevron: mdiChevronRight,
    chevronLeft: mdiChevronLeft,
    logout: mdiLogout,
    sun: mdiWhiteBalanceSunny,
    moon: mdiWeatherNight,
  }
  return (
    <svg
      aria-hidden="true"
      className={`size-5 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d={paths[name] || paths.clock} />
    </svg>
  )
}
// Formats minutes for compact labels such as "1h 30m".
const duration = (n: number) =>
  `${Math.floor(n / 60) ? `${Math.floor(n / 60)}h ` : ""}${
    n % 60 ? `${n % 60}m` : n === 0 ? "0m" : ""
  }`.trim()
// Formats elapsed seconds as an HH:MM:SS countdown.
const formatCountdown = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainder = totalSeconds % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(remainder).padStart(2, "0")}`
}
// Converts a HH:MM clock value into minutes after midnight.
const toMinutes = (value: string) => {
  const [hours = "0", minutes = "0"] = value.split(":")
  return Number(hours) * 60 + Number(minutes)
}
// Converts minutes after midnight into a value accepted by time inputs.
const toClockValue = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`
}
// Uses actual completion time when available, otherwise planned time.
const effectiveMinutes = (task: Task) =>
  task.done && task.actualMinutes !== undefined
    ? task.actualMinutes
    : task.minutes
// Suggests an emoji and priority from the task name.
const suggestTaskDetails = (name: string) => {
  const value = name.toLowerCase()
  let emoji = "📚"
  let priority = "Medium"

  if (/(assignment|essay|write|report)/.test(value)) emoji = "📝"
  if (/(math|study|homework|exam|test|class|school)/.test(value)) emoji = "📚"
  if (/(read|chapter|book)/.test(value)) emoji = "📖"
  if (/(workout|exercise|run|gym|sport)/.test(value)) emoji = "🏃"
  if (/(guitar|music|piano|instrument)/.test(value)) emoji = "🎸"
  if (/(code|coding|program|computer|software)/.test(value)) emoji = "💻"
  if (/(game|gaming|video game|esports)/.test(value)) emoji = "🎮"
  if (/(art|draw|paint|design)/.test(value)) emoji = "🎨"
  if (/(break|tea|coffee|lunch|snack|rest)/.test(value)) emoji = "🍵"
  if (/(meditate|meditation|yoga|mindful)/.test(value)) emoji = "🧘"

  if (
    /(urgent|important|exam|test|deadline|assignment|project|homework|submit)/.test(
      value,
    )
  ) {
    priority = "High"
  } else if (
    /(break|rest|relax|free time|hobby|tea|coffee|lunch|snack)/.test(value)
  ) {
    priority = "Low"
  }

  return { emoji, priority }
}
// Creates the local-storage key used for a calendar day.
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
// Loads saved daily plans without allowing malformed storage to break the app.
const loadHistory = (): Record<string, DayRecord> => {
  try {
    return JSON.parse(localStorage.getItem("daylight-history") || "{}")
  } catch {
    return {}
  }
}
const panel =
  "rounded-2xl bg-white p-6 shadow-[0_2px_12px_#24243f04] ring-1 ring-[#ececf2]"
const input =
  "w-full rounded-lg border border-[#dedee8] bg-white px-3 py-2.5 text-base sm:text-sm placeholder:text-[#a0a0b1]"
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
const MAGIC_LINK_COOLDOWN_MS = 5 * 60 * 1000
const PLAN_START = "00:00"
const TIMER_STORAGE_KEY = "daylight-plan-timer"

// Loads the persisted plan timer state.
function loadTimerState() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(TIMER_STORAGE_KEY) || "null",
    ) as {
      running?: boolean
      startedAt?: number | null
      elapsedSeconds?: number
    } | null
    return {
      running: saved?.running === true,
      startedAt: typeof saved?.startedAt === "number" ? saved.startedAt : null,
      elapsedSeconds:
        typeof saved?.elapsedSeconds === "number"
          ? Math.max(0, saved.elapsedSeconds)
          : 0,
    }
  } catch {
    return { running: false, startedAt: null, elapsedSeconds: 0 }
  }
}

// Sends a typed request to the task API and normalizes API errors.
async function requestTasks<T>(
  method: "GET" | "POST" | "DELETE" | "PATCH",
  body?: unknown,
) {
  const response = await fetch("/api/tasks", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(result?.error || "Unable to manage tasks.")
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// Owns planner state, synchronization, user actions, and the page layout.
export default function Planner() {
  // Planner state.
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const today = dateKey(new Date())
      const todayRecord = loadHistory()[today]
      if (todayRecord) return todayRecord.tasks
      const activeDate = localStorage.getItem("daylight-active-date")
      if (activeDate && activeDate !== today) return []
      return JSON.parse(localStorage.getItem("daylight-tasks") || "[]")
    } catch {
      return []
    }
  })
  const [hours, setHours] = useState(
    () => localStorage.getItem("daylight-hours") || "6",
  )
  const [draftHours, setDraftHours] = useState(
    () => localStorage.getItem("daylight-hours") || "6",
  )
  const [page, setPage] = useState("My planner")
  const [auth, setAuth] = useState<"login" | "signup" | null>("login")
  const [user, setUser] = useState(
    () => localStorage.getItem("daylight-user-name") || "Alex",
  )
  const [email, setEmail] = useState(
    () => localStorage.getItem("daylight-user-email") || "alex@example.com",
  )
  const [notice, setNotice] = useState("")
  const [magicLinkCooldownUntil, setMagicLinkCooldownUntil] = useState(() => {
    const saved = Number(localStorage.getItem("daylight-magic-link-cooldown"))
    return Number.isFinite(saved) && saved > Date.now() ? saved : 0
  })
  const [googleLoginLoading, setGoogleLoginLoading] = useState(false)
  const [name, setName] = useState("")
  const [mins, setMins] = useState("0")
  const [taskHours, setTaskHours] = useState("0")
  const [priority, setPriority] = useState("Medium")
  const [taskDate, setTaskDate] = useState(() => dateKey(new Date()))
  const [emoji, setEmoji] = useState("📚")
  const [activityIsAutomatic, setActivityIsAutomatic] = useState(true)
  const [priorityIsAutomatic, setPriorityIsAutomatic] = useState(true)
  const [error, setError] = useState("")
  const [distributionMode, setDistributionMode] =
    useState<"even" | "priority" | null>(null)
  const [completionModal, setCompletionModal] =
    useState<CompletionModal | null>(null)
  const [isModalClosing, setIsModalClosing] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [exitingToastIds, setExitingToastIds] = useState<string[]>([])
  const [draggedTaskId, setDraggedTaskId] = useState<Task["id"] | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [timerRunning, setTimerRunning] = useState(
    () => loadTimerState().running,
  )
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(
    () => loadTimerState().startedAt,
  )
  const [timerElapsedSeconds, setTimerElapsedSeconds] = useState(
    () => loadTimerState().elapsedSeconds,
  )
  const [showFloatingClock, setShowFloatingClock] = useState(false)
  const [history, setHistory] = useState<Record<string, DayRecord>>(loadHistory)
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  )
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("daylight-theme")
    if (saved === "light" || saved === "dark") return saved
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  })
  // Initializes authentication and loads cloud tasks when a session exists.
  useEffect(() => {
    const cooldownTimer = window.setInterval(() => {
      setMagicLinkCooldownUntil((current) =>
        current > Date.now() ? current : 0,
      )
    }, 1000)

    const authError = new URLSearchParams(window.location.search).get(
      "auth_error",
    )
    if (authError) {
      setNotice(
        authError.includes("flow_state_already_used")
          ? "This login link has already been used or expired. Start a new sign-in attempt."
          : authError,
      )
      window.history.replaceState({}, "", window.location.pathname)
    }

    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setSupabaseUser(data.user ?? null)
      setAuth(data.user ? null : "login")
      setAuthLoading(false)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSupabaseUser(session?.user ?? null)
        setAuth(session?.user ? null : "login")
        setAuthLoading(false)
        if (session?.user) {
          void requestTasks<DatabaseTask[]>("GET")
            .then((databaseTasks) => {
              setTasks(
                databaseTasks.map((task, index) => {
                  const taskStart = databaseTasks
                    .slice(0, index)
                    .reduce((sum, item) => sum + item.duration_minutes, 0)
                  return {
                    id: task.id,
                    name: task.name,
                    minutes: task.duration_minutes,
                    priority: task.priority,
                    deadline: toClockValue(taskStart + task.duration_minutes),
                    emoji: "📚",
                    done: false,
                  }
                }),
              )
            })
            .catch((loadError) =>
              showToast(
                loadError instanceof Error
                  ? loadError.message
                  : "Unable to load tasks.",
              ),
            )
        }
      },
    )
    return () => {
      window.clearInterval(cooldownTimer)
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])
  // Mirrors authenticated profile details into the planner header.
  useEffect(() => {
    if (!supabaseUser) return
    setUser(
      supabaseUser.user_metadata?.name ||
        supabaseUser.email?.split("@")[0] ||
        "Planner",
    )
    setEmail(supabaseUser.email || "")
  }, [supabaseUser])
  // Persists the current task list for offline/local use.
  useEffect(() => {
    localStorage.setItem("daylight-tasks", JSON.stringify(tasks))
  }, [tasks])
  // Runs the one-time migration for completed task durations.
  useEffect(() => {
    const migrationKey = "daylight-actual-time-v2"
    if (localStorage.getItem(migrationKey)) return
    setTasks((current) =>
      current.map((task) =>
        task.done && task.actualMinutes === task.minutes
          ? { ...task, actualMinutes: 0 }
          : task,
      ),
    )
    localStorage.setItem(migrationKey, "complete")
  }, [])
  // Persists the user's available hours.
  useEffect(() => {
    localStorage.setItem("daylight-hours", hours)
  }, [hours])
  // Persists the local profile fallback values.
  useEffect(() => {
    localStorage.setItem("daylight-user-name", user)
    localStorage.setItem("daylight-user-email", email)
  }, [user, email])
  // Applies and persists the selected color theme.
  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", theme === "dark")
    document.documentElement.style.colorScheme = theme
    localStorage.setItem("daylight-theme", theme)
  }, [theme])
  // Closes completion modals from Escape or after a short delay.
  useEffect(() => {
    if (!completionModal) return
    if (isModalClosing) {
      const finishClosing = window.setTimeout(() => {
        setCompletionModal(null)
        setIsModalClosing(false)
      }, 220)
      return () => window.clearTimeout(finishClosing)
    }
    // Lets keyboard users close the celebration modal with Escape.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalClosing(true)
    }
    const autoClose = window.setTimeout(() => setIsModalClosing(true), 10000)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.clearTimeout(autoClose)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [completionModal, isModalClosing])
  // Keeps the displayed clock current.
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(clock)
  }, [])
  // Persists timer progress so a refresh does not lose it.
  useEffect(() => {
    localStorage.setItem(
      TIMER_STORAGE_KEY,
      JSON.stringify({
        running: timerRunning,
        startedAt: timerStartedAt,
        elapsedSeconds: timerElapsedSeconds,
      }),
    )
  }, [timerElapsedSeconds, timerRunning, timerStartedAt])
  // Shows the floating timer after the user scrolls past the header.
  useEffect(() => {
    // Keeps the floating timer visible only after the header scrolls away.
    const updateFloatingClock = () => setShowFloatingClock(window.scrollY > 150)
    updateFloatingClock()
    window.addEventListener("scroll", updateFloatingClock, { passive: true })
    return () => window.removeEventListener("scroll", updateFloatingClock)
  }, [])
  const available = Math.max(
    0,
    Math.min(1440, Math.round((Number(hours) || 0) * 60)),
  )
  // Advances the active timer and stops it at the day's available limit.
  useEffect(() => {
    if (!timerRunning || timerStartedAt === null) return
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000)
      const limit = available * 60
      setTimerElapsedSeconds(Math.min(elapsed, limit))
      if (elapsed >= limit) setTimerRunning(false)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [available, timerRunning, timerStartedAt])
  const used = tasks.reduce((sum, task) => sum + effectiveMinutes(task), 0)
  const savedMinutes = tasks.reduce(
    (sum, task) =>
      sum +
      (task.done && task.actualMinutes !== undefined
        ? Math.max(0, task.minutes - task.actualMinutes)
        : 0),
    0,
  )
  const remaining = available - used
  const scheduleStart = 0
  const scheduleEnd = scheduleStart + used
  const countdownSeconds = Math.max(0, available * 60 - timerElapsedSeconds)
  const countdownLabel = formatCountdown(countdownSeconds)
  const largestDeadlineOverrun = tasks.reduce((largest, task, index) => {
    const taskEnd =
      scheduleStart +
      tasks
        .slice(0, index + 1)
        .reduce((sum, item) => sum + effectiveMinutes(item), 0)
    return Math.max(largest, taskEnd - toMinutes(task.deadline))
  }, 0)
  const scheduleFits = remaining >= 0 && largestDeadlineOverrun === 0
  const hasNoFreeTime = remaining === 0 && largestDeadlineOverrun === 0
  const percent = available
    ? Math.round((used / available) * 100)
    : used
      ? 100
      : 0
  const totalPriorityWeight = tasks.reduce(
    (sum, task) =>
      sum + (task.priority === "High" ? 3 : task.priority === "Medium" ? 2 : 1),
    0,
  )
  const completed = tasks.filter((t) => t.done).length
  const allTasksFinished = tasks.length > 0 && completed === tasks.length
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  const shortDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
  const currentTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
  const userInitial = user.trim().charAt(0).toUpperCase() || "S"
  const todayKey = dateKey(now)
  const currentRecord: DayRecord = {
    tasks,
    availableMinutes: available,
    startTime: PLAN_START,
  }
  const historyWithToday = { ...history, [todayKey]: currentRecord }
  // Checks whether a saved day contains at least one completed task and no unfinished tasks.
  const isCompleteDay = (record?: DayRecord) =>
    Boolean(record?.tasks.length && record.tasks.every((task) => task.done))
  let streak = 0
  const streakCursor = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
  if (!isCompleteDay(historyWithToday[todayKey])) {
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  while (isCompleteDay(historyWithToday[dateKey(streakCursor)])) {
    streak += 1
    streakCursor.setDate(streakCursor.getDate() - 1)
  }
  const historyRecords = Object.values(historyWithToday)
  const totalPlannedTasks = historyRecords.reduce(
    (sum, record) => sum + record.tasks.length,
    0,
  )
  const totalFinishedTasks = historyRecords.reduce(
    (sum, record) => sum + record.tasks.filter((task) => task.done).length,
    0,
  )
  const completedDays = historyRecords.filter(isCompleteDay).length
  const calendarStart = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  )
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay())
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart)
    day.setDate(calendarStart.getDate() + index)
    return day
  })
  const selectedRecord = historyWithToday[selectedDate]
  // Saves today's current plan into the history calendar.
  useEffect(() => {
    const nextRecord: DayRecord = {
      tasks,
      availableMinutes: available,
      startTime: PLAN_START,
    }
    setHistory((current) => {
      const next = { ...current, [todayKey]: nextRecord }
      localStorage.setItem("daylight-history", JSON.stringify(next))
      return next
    })
    localStorage.setItem("daylight-active-date", todayKey)
  }, [tasks, available, todayKey])
  // Prevents creating tasks in a past date.
  useEffect(() => {
    if (taskDate < todayKey) setTaskDate(todayKey)
  }, [taskDate, todayKey])
  // Adds a temporary notification to the toast stack.
  function showToast(message: string) {
    const id = `notice-${Date.now()}`
    setToasts((current) => [...current, { id, message, reminder: false }])
    window.setTimeout(() => {
      dismissToast({ id, message, reminder: false })
    }, 4000)
  }
  // Animates a toast out before removing it from state.
  function dismissToast(toast: ToastMessage) {
    setExitingToastIds((current) =>
      current.includes(toast.id) ? current : [...current, toast.id],
    )
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id))
      setExitingToastIds((current) => current.filter((id) => id !== toast.id))
    }, 260)
  }
  // Validates and adds a task to today or the selected future date.
  function addTask(e: React.FormEvent) {
    e.preventDefault()
    const minutes = Number(taskHours) * 60 + Number(mins)
    if (!name.trim()) {
      setError("Enter a task name before adding it to your plan.")
      return
    }
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Enter a duration of at least 1 minute.")
      return
    }
    const targetRecord = history[taskDate]
    const targetTasks =
      taskDate === todayKey ? tasks : targetRecord?.tasks || []
    const targetStartTime = PLAN_START
    const automaticFinish =
      toMinutes(targetStartTime) +
      targetTasks.reduce((sum, task) => sum + effectiveMinutes(task), 0) +
      minutes
    const newTask: Task = {
      id: Date.now(),
      name: name.trim(),
      minutes,
      priority,
      deadline: toClockValue(automaticFinish),
      emoji,
      done: false,
    }
    if (taskDate === todayKey) {
      setTasks([...tasks, newTask])
      if (supabaseUser) {
        void requestTasks("POST", {
          name: newTask.name,
          duration_minutes: newTask.minutes,
          priority: newTask.priority as "Low" | "Medium" | "High",
          deadline: new Date(
            Date.UTC(2000, 0, 1, 0, toMinutes(newTask.deadline)),
          ).toISOString(),
        }).catch((databaseError) =>
          showToast(
            databaseError instanceof Error
              ? databaseError.message
              : "Unable to save task.",
          ),
        )
      }
    } else {
      setHistory((current) => {
        const existing = current[taskDate] || {
          tasks: [],
          availableMinutes: available,
          startTime: PLAN_START,
        }
        const next = {
          ...current,
          [taskDate]: {
            ...existing,
            tasks: [...existing.tasks, newTask],
          },
        }
        localStorage.setItem("daylight-history", JSON.stringify(next))
        return next
      })
    }
    setName("")
    setTaskHours("0")
    setMins("0")
    setEmoji("📚")
    setPriority("Medium")
    setActivityIsAutomatic(true)
    setPriorityIsAutomatic(true)
    setError("")
    showToast(
      taskDate === todayKey
        ? "Task added to today’s schedule."
        : `Task planned for ${new Date(
            `${taskDate}T12:00:00`,
          ).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}.`,
    )
  }
  // Validates and applies the available-hours setting.
  function applyAvailableTime() {
    const nextHours = Number(draftHours)
    if (!Number.isFinite(nextHours) || nextHours < 0 || nextHours > 24) {
      showToast("Available time must be between 0 and 24 hours.")
      return
    }
    setHours(String(nextHours))
    setDraftHours(String(nextHours))
    setNotice("")
    showToast(
      `Available time updated to ${duration(Math.round(nextHours * 60))}.`,
    )
  }
  // Redistributes available minutes evenly or according to priority.
  function distributeTime(weighted: boolean) {
    if (!tasks.length || available <= 0) {
      showToast("Add at least one task and set your available time first.")
      return
    }
    const weights = tasks.map((task) =>
      weighted
        ? task.priority === "High"
          ? 3
          : task.priority === "Medium"
            ? 2
            : 1
        : 1,
    )
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    let assigned = 0
    const distributed = tasks.map((task, index) => {
      const minutes =
        index === tasks.length - 1
          ? available - assigned
          : Math.floor((available * weights[index]) / totalWeight)
      assigned += minutes
      return { ...task, minutes }
    })
    setTasks(distributed)
    setDistributionMode(weighted ? "priority" : "even")
    showToast(
      weighted
        ? "Available time distributed by priority: high-priority tasks received the most time."
        : "Available time divided evenly across all tasks.",
    )
  }
  // Marks a task complete or incomplete and opens the matching celebration.
  function toggleTask(task: Task) {
    const isFinishing = !task.done
    const taskIndex = tasks.findIndex((item) => item.id === task.id)
    const taskStart =
      scheduleStart +
      tasks
        .slice(0, taskIndex)
        .reduce((sum, item) => sum + effectiveMinutes(item), 0)
    const current = new Date()
    const currentMinute = current.getHours() * 60 + current.getMinutes()
    const actualMinutes =
      currentMinute >= taskStart
        ? Math.min(task.minutes, currentMinute - taskStart)
        : 0
    const nextTasks = tasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            done: isFinishing,
            actualMinutes: isFinishing ? actualMinutes : undefined,
          }
        : item,
    )
    setTasks(nextTasks)
    if (!isFinishing) return

    const allFinished = nextTasks.every((item) => item.done)
    const nextUsed = nextTasks.reduce(
      (sum, item) => sum + effectiveMinutes(item),
      0,
    )
    const nextDeadlineOverrun = nextTasks.reduce((largest, item, index) => {
      const end =
        scheduleStart +
        nextTasks
          .slice(0, index + 1)
          .reduce((sum, nextItem) => sum + effectiveMinutes(nextItem), 0)
      return Math.max(largest, end - toMinutes(item.deadline))
    }, 0)
    const adjustedScheduleFits =
      available - nextUsed >= 0 && nextDeadlineOverrun === 0
    setIsModalClosing(false)
    setCompletionModal({
      kind: allFinished ? (adjustedScheduleFits ? "all" : "all-late") : "task",
      taskName: task.name,
      emoji: task.emoji,
    })
  }
  // Starts the Google OAuth sign-in flow.
  async function signInWithGoogle() {
    if (googleLoginLoading) return
    setGoogleLoginLoading(true)
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })
    if (signInError) {
      setNotice(signInError.message)
      setGoogleLoginLoading(false)
    }
  }
  // Sends a magic-link sign-in email while enforcing the cooldown.
  async function signInWithEmail(submittedEmail: string) {
    const remainingMs = magicLinkCooldownUntil - Date.now()
    if (remainingMs > 0) {
      setNotice(
        `A login link was already sent. Try again in ${Math.ceil(
          remainingMs / 60_000,
        )} minute${Math.ceil(remainingMs / 60_000) === 1 ? "" : "s"}.`,
      )
      return
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })
    if (signInError) {
      setNotice(signInError.message)
      return
    }

    const cooldownUntil = Date.now() + MAGIC_LINK_COOLDOWN_MS
    localStorage.setItem("daylight-magic-link-cooldown", String(cooldownUntil))
    setMagicLinkCooldownUntil(cooldownUntil)
    setNotice("The link has been sent to your email. Check your inbox.")
  }
  // Ends the current session and returns to the login screen.
  async function signOut() {
    await supabase.auth.signOut()
    setSupabaseUser(null)
    setTasks([])
    setAuth("login")
  }
  // Removes a task locally and deletes persisted cloud tasks when needed.
  async function removeTask(task: Task) {
    setTasks((current) => current.filter((item) => item.id !== task.id))
    if (typeof task.id === "string") {
      try {
        await requestTasks("DELETE", { id: task.id })
      } catch (databaseError) {
        showToast(
          databaseError instanceof Error
            ? databaseError.message
            : "Unable to delete task.",
        )
      }
    }
  }
  // Reorders tasks by drag-and-drop and syncs cloud order when applicable.
  function moveTask(draggedId: Task["id"], targetId: Task["id"]) {
    if (draggedId === targetId) return
    const fromIndex = tasks.findIndex((task) => task.id === draggedId)
    const toIndex = tasks.findIndex((task) => task.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return

    const nextTasks = [...tasks]
    const [draggedTask] = nextTasks.splice(fromIndex, 1)
    nextTasks.splice(toIndex, 0, draggedTask)
    setTasks(nextTasks)

    if (
      supabaseUser &&
      nextTasks.every((task) => typeof task.id === "string")
    ) {
      void requestTasks("PATCH", {
        taskIds: nextTasks.map((task) => String(task.id)),
      }).catch((databaseError) =>
        showToast(
          databaseError instanceof Error
            ? databaseError.message
            : "Unable to save task order.",
        ),
      )
    }
  }
  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fc] text-sm text-[#817c91]">
        Loading your planner...
      </div>
    )
  if (auth)
    return (
      <div className="grid min-h-screen bg-white lg:grid-cols-2">
        <ThemeToggle theme={theme} setTheme={setTheme} floating />
        <div className="relative hidden flex-col justify-between bg-[#eeebff] p-14 lg:flex">
          <Brand />
          <div>
            <span className="text-7xl">🌱</span>
            <h1 className="mt-8 max-w-lg text-5xl font-semibold leading-tight tracking-tight">
              Small plans.
              <br />
              Big possibilities.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#69647c]">
              Make room for learning, doing, and being you. A little math is all
              it takes.
            </p>
          </div>
          <p className="text-sm text-[#726c87]">
            Your time. Your pace. Your Daylight.
          </p>
        </div>
        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-4xl">👋</div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {auth === "login" ? "Welcome back" : "Find your daily rhythm"}
            </h2>
            <p className="mt-3 mb-8 text-[#818094]">
              {auth === "login"
                ? "A little planning goes a long way."
                : "Create an account to start making time."}
            </p>
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault()
                const data = new FormData(e.currentTarget)
                const submittedEmail = String(data.get("email"))
                void signInWithEmail(submittedEmail)
              }}
            >
              {auth === "signup" && (
                <label className="block text-sm font-medium">
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    className={`${input} mt-2`}
                    placeholder="Alex Taylor"
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`${input} mt-2`}
                  placeholder="you@example.com"
                />
              </label>
              <button
                disabled={magicLinkCooldownUntil > Date.now()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7960d8] py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {magicLinkCooldownUntil > Date.now()
                  ? `Resend in ${Math.ceil(
                      (magicLinkCooldownUntil - Date.now()) / 60_000,
                    )} minute${
                      Math.ceil(
                        (magicLinkCooldownUntil - Date.now()) / 60_000,
                      ) === 1
                        ? ""
                        : "s"
                    }`
                  : "Send magic link"}
                <Icon name="arrow" className="size-4" />
              </button>
            </form>
            <div className="my-6 flex items-center gap-4 text-xs text-[#92909f]">
              <div className="h-px flex-1 bg-[#ecebf1]" />
              or
              <div className="h-px flex-1 bg-[#ecebf1]" />
            </div>
            <button
              disabled={googleLoginLoading}
              className="w-full rounded-lg border border-[#dedee8] py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void signInWithGoogle()}
            >
              <span className="mr-3 font-bold text-blue-600">G</span>
              {googleLoginLoading
                ? "Opening Google..."
                : "Continue with Google"}
            </button>
            <p role="status" className="mt-4 text-sm text-[#706987]">
              {notice}
            </p>
            <p className="mt-7 text-center text-sm text-[#818094]">
              {auth === "login"
                ? "New to Daylight?"
                : "Already have an account?"}{" "}
              <button
                className="font-semibold text-[#7960d8]"
                onClick={() => {
                  setAuth(auth === "login" ? "signup" : "login")
                  setNotice("")
                }}
              >
                {auth === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
            <p className="mt-8 text-center text-xs text-[#92909f]">
              Authentication is handled securely by Supabase.
            </p>
          </div>
        </div>
      </div>
    )
  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#323247]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[224px] flex-col border-r border-[#e9e9f1] bg-white px-5 py-8 xl:flex">
        <Brand />
        <div className="mt-12 px-3 text-[10px] font-semibold tracking-[.15em] text-[#9695a7]">
          YOUR WORKSPACE
        </div>
        <nav className="mt-4 space-y-2">
          {[
            ["My planner", "grid"],
            ["My schedule", "calendar"],
            ["My progress", "chart"],
          ].map(([label, icon]) => (
            <button
              key={label}
              onClick={() => setPage(label)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${
                page === label
                  ? "bg-[#f0ecfc] text-[#7d61d6]"
                  : "text-[#858396] hover:bg-[#f8f7fc]"
              }`}
            >
              <Icon name={icon} />
              {label}
              {label === "My planner" && (
                <span className="ml-auto size-1.5 rounded-full bg-[#8e76da]" />
              )}
            </button>
          ))}
        </nav>
        <div className="mt-10 px-3 text-[10px] font-semibold tracking-[.15em] text-[#9695a7]">
          A LITTLE MOTIVATION
        </div>
        <div className="mx-2 mt-4 rounded-xl bg-[#faf8ef] px-4 py-5">
          <span className="text-2xl">✨</span>
          <p className="mt-3 text-sm font-medium leading-relaxed">
            You don’t need more time.
            <br />
            Just a little plan.
          </p>
          <p className="mt-3 text-xs text-[#9a917a]">
            One task at a time. You’ve got this.
          </p>
        </div>
        <div className="mt-auto">
          <div className="mx-2 mb-6 flex gap-3 rounded-xl bg-[#f6f4fc] p-3">
            <span className="text-2xl">🌱</span>
            <div>
              <p className="text-xs font-semibold">Growing planner</p>
              <p className="mt-1 text-[11px] text-[#878298]">
                {streak
                  ? `${streak} day streak · ${completed * 25} XP today`
                  : `${completed * 25} XP earned today`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setPage("My profile")
              setNotice("")
            }}
            className="flex w-full min-w-0 items-center gap-3 border-t border-[#ecebf2] px-2 pt-5 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#8063cc] text-sm font-semibold text-white">
              {userInitial}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">
                {user}’s space
              </span>
              <span className="mt-1 block truncate text-xs text-[#9692a3]">
                Student account
              </span>
            </span>
            <Icon name="chevron" className="size-4 shrink-0 text-[#9692a3]" />
          </button>
        </div>
      </aside>
      <div className="xl:ml-[224px]">
        <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-[#e9e9f1] bg-white px-6 lg:px-10">
          <div className="xl:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-sm xl:flex">
            <span className="text-[#9290a2]">Workspace</span>
            <Icon name="chevron" className="size-3 text-[#aaa7b7]" />
            <span className="font-medium">{page}</span>
          </div>
          <div className="flex items-center gap-5">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <span className="hidden rounded-full bg-[#fff7e8] px-3 py-1.5 text-xs font-medium text-[#a57425] sm:block">
              🔥 &nbsp; {streak ? `${streak} day streak` : "Start your streak"}
            </span>
            <button
              onClick={() => {
                setPage("My profile")
                setNotice("")
              }}
              className="flex items-center gap-2 text-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[#8063cc] text-xs font-semibold text-white">
                {userInitial}
              </span>
              <span className="hidden sm:block">{user}</span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">
          <nav className="mb-6 flex gap-2 xl:hidden">
            {["My planner", "My schedule", "My progress"].map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`rounded-lg px-3 py-2 text-xs ${
                  page === p ? "bg-[#ebe5fc] text-[#775bd0]" : "text-[#858396]"
                }`}
              >
                {p}
              </button>
            ))}
          </nav>
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">
                {page === "My planner"
                  ? `Make today a good day, ${user}`
                  : page === "My schedule"
                    ? "Your month, at a glance"
                    : page === "My profile"
                      ? "Your student profile"
                      : "Little steps, real progress"}{" "}
                <span className="ml-1 text-2xl">
                  {page === "My progress"
                    ? "🌱"
                    : page === "My profile"
                      ? ""
                      : "☀️"}
                </span>
              </h1>
              <p className="mt-2 text-sm text-[#8b899e]">
                A little planning. A little math. A lot more possibility.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#e5e4ec] bg-white px-3 py-2 text-[#79758b]">
              <Icon name="calendar" className="size-4" />
              <div>
                <p className="whitespace-nowrap text-[10px] leading-none text-[#9992a6]">
                  <span className="sm:hidden">{shortDate}</span>
                  <span className="hidden sm:inline">{date}</span>
                </p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-[#625b70]">
                  {currentTime}
                </p>
              </div>
            </div>
          </div>
          {page === "My planner" && (
            <section className="relative mb-7 overflow-hidden rounded-2xl bg-[#efebfa] px-7 py-7 sm:px-8">
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-5 lg:pr-36">
                <div>
                  <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[#8a6bc2]">
                    ✦ &nbsp; START WITH YOUR TIME
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight">
                    What does your day have room for?
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-[#827392]">
                    Set your free hours. We’ll help you make the most of them.
                    <br className="hidden sm:block" /> Don’t forget to leave a
                    little room for you.
                  </p>
                </div>
                <div className="w-full rounded-xl bg-white/80 px-4 py-4 sm:w-auto sm:px-5">
                  <label
                    htmlFor="hours"
                    className="mb-2 block text-xs font-medium text-[#716080]"
                  >
                    My available time today
                  </label>
                  <div className="grid grid-cols-[auto_minmax(0,5rem)_auto_auto] items-center gap-2 sm:flex sm:gap-3">
                    <Icon name="clock" className="text-[#8e73cf]" />
                    <input
                      id="hours"
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={draftHours}
                      onChange={(e) => setDraftHours(e.target.value)}
                      className="w-full min-w-0 rounded-md border border-[#e4dcef] bg-white px-2 py-1 text-center text-xl font-semibold tabular-nums text-[#7559bb] sm:w-20 sm:text-2xl"
                    />
                    <span className="text-sm text-[#8a7c9b]">hours</span>
                    <button
                      type="button"
                      aria-label="Update available time"
                      title="Update available time"
                      onClick={applyAvailableTime}
                      className="flex size-8 items-center justify-center rounded-full bg-[#8063cc] p-0 text-white hover:bg-[#7051b9]"
                    >
                      <Icon name="check" className="size-3.5" />
                    </button>
                  </div>
                  {draftHours !== hours && (
                    <p className="mt-2 text-[10px] text-[#8a7c9b]">
                      Press the check button to apply this change.
                    </p>
                  )}
                </div>
              </div>
              <div
                aria-hidden="true"
                className="absolute -right-7 -bottom-12 size-60 rounded-full border-[30px] border-[#e8e0f6] opacity-70"
              />
              <div
                aria-hidden="true"
                className="absolute right-9 top-10 hidden text-[76px] lg:block"
              >
                ⏳
              </div>
            </section>
          )}
          <div
            className={`grid items-start gap-7 ${
              page === "My profile"
                ? "lg:grid-cols-1"
                : "lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]"
            }`}
          >
            <div
              className={`min-w-0 space-y-6 ${
                page === "My profile" ? "mx-auto w-full max-w-4xl" : ""
              }`}
            >
              {page === "My planner" && (
                <section className={panel}>
                  <SectionHeading
                    icon="✏️"
                    title="Make a little plan"
                    subtitle="Big goals start with small tasks."
                  />
                  <form onSubmit={addTask} className="mt-5">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <label className="block w-full text-xs font-medium text-[#747183] sm:w-auto">
                        Activity
                        {activityIsAutomatic && (
                          <span className="ml-1 text-[9px] font-normal text-[#9478c5]">
                            Auto
                          </span>
                        )}
                        <div className="relative mt-2 w-full sm:w-[180px]">
                          <select
                            aria-label="Activity emoji"
                            value={emoji}
                            onChange={(e) => {
                              setEmoji(e.target.value)
                              setActivityIsAutomatic(false)
                            }}
                            className="block h-12 w-full appearance-none rounded-lg border border-[#dedee8] bg-white py-2.5 pr-11 pl-3 text-base sm:h-[43px] sm:text-sm"
                          >
                            {[
                              ["📚", "Study"],
                              ["📖", "Reading"],
                              ["🏃", "Exercise"],
                              ["🎸", "Music"],
                              ["💻", "Coding"],
                              ["🎮", "Gaming"],
                              ["🎨", "Creative"],
                              ["🍵", "Break"],
                              ["🧘", "Wellness"],
                              ["📝", "Assignment"],
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {value} {label}
                              </option>
                            ))}
                          </select>
                          <Icon
                            name="chevron"
                            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#8b8198]"
                          />
                        </div>
                      </label>
                      <label className="block w-full flex-1 text-xs font-medium text-[#747183]">
                        Task name
                        <input
                          required
                          value={name}
                          onChange={(e) => {
                            const nextName = e.target.value
                            const suggestion = suggestTaskDetails(nextName)
                            setName(nextName)
                            if (activityIsAutomatic) {
                              setEmoji(suggestion.emoji)
                            }
                            if (priorityIsAutomatic) {
                              setPriority(suggestion.priority)
                            }
                          }}
                          className={`${input} mt-2`}
                          placeholder="What would you like to do?"
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <fieldset>
                        <legend className="text-xs font-medium text-[#747183]">
                          Duration
                        </legend>
                        <div className="mt-2 flex items-center gap-1.5">
                          <label className="relative flex-1">
                            <span className="sr-only">Hours</span>
                            <input
                              type="number"
                              min="0"
                              max="24"
                              value={taskHours}
                              onChange={(e) => setTaskHours(e.target.value)}
                              className={`${input} pr-7`}
                            />
                            <span className="pointer-events-none absolute right-3 top-3 text-xs text-[#aaa6b5]">
                              h
                            </span>
                          </label>
                          <label className="relative flex-1">
                            <span className="sr-only">Minutes</span>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              value={mins}
                              onChange={(e) => setMins(e.target.value)}
                              className={`${input} pr-7`}
                            />
                            <span className="pointer-events-none absolute right-2 top-3 text-xs text-[#aaa6b5]">
                              m
                            </span>
                          </label>
                        </div>
                      </fieldset>
                      <label className="text-xs font-medium text-[#747183]">
                        Priority
                        {priorityIsAutomatic && (
                          <span className="ml-1 text-[9px] font-normal text-[#9478c5]">
                            Auto
                          </span>
                        )}
                        <select
                          value={priority}
                          onChange={(e) => {
                            setPriority(e.target.value)
                            setPriorityIsAutomatic(false)
                          }}
                          className={`${input} mt-2`}
                        >
                          <option>High</option>
                          <option>Medium</option>
                          <option>Low</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-[#747183]">
                        Plan for
                        <input
                          required
                          type="date"
                          min={todayKey}
                          value={taskDate}
                          onChange={(e) => setTaskDate(e.target.value)}
                          className={`${input} mt-2`}
                        />
                      </label>
                    </div>
                    {error && (
                      <p role="alert" className="mt-3 text-sm text-red-700">
                        {error}
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-[#a09aaa]">
                        ☁️ &nbsp; Make time for what matters.
                      </span>
                      <button className="flex items-center gap-2 rounded-lg bg-[#8164d7] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7051c9]">
                        <Icon name="plus" className="size-4" />
                        Add task
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {page === "My planner" && (
                <section className={panel}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <SectionHeading
                      icon="🗓️"
                      title="Your daily schedule"
                      subtitle="One thing at a time. You’re doing great."
                    />
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!timerRunning) {
                            setTimerStartedAt(
                              Date.now() - timerElapsedSeconds * 1000,
                            )
                            setTimerRunning(true)
                          } else {
                            setTimerRunning(false)
                          }
                        }}
                        disabled={available <= 0 || countdownSeconds === 0}
                        className="rounded-md bg-[#8164d7] px-3 py-1.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {timerRunning ? "Pause timer" : "Start timer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTimerRunning(false)
                          setTimerStartedAt(null)
                          setTimerElapsedSeconds(0)
                        }}
                        className="rounded-md border border-[#dedee8] px-3 py-1.5 text-[10px] font-medium text-[#8b819b]"
                      >
                        Reset
                      </button>
                      <span className="mb-0.5 rounded-md bg-[#f5f3fa] px-2 py-1.5 text-[10px] text-[#8b819b]">
                        {tasks.filter((task) => !task.done).length} remaining
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-[10px] font-medium text-[#9992a6]">
                    <span className="size-1.5 rounded-full bg-[#ad9acb]" />
                    TIMER{" "}
                    <span className="ml-auto font-semibold tabular-nums text-[#8063cc]">
                      {countdownLabel} remaining
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {tasks.length === 0 && (
                      <div className="rounded-xl bg-[#faf8fd] p-6 text-center">
                        <span className="text-3xl">🌱</span>
                        <p className="mt-3 font-medium">
                          A fresh start for your day
                        </p>
                        <p className="mt-2 text-sm text-[#8a8396]">
                          Add your first task to build your schedule.
                        </p>
                        <button
                          onClick={() => setPage("My planner")}
                          className="mt-4 inline-flex items-center gap-1 text-sm text-[#7d60cf]"
                        >
                          Start planning
                          <Icon name="arrow" className="size-4" />
                        </button>
                      </div>
                    )}
                    {tasks.map((task, i) => {
                      const start =
                        scheduleStart +
                        tasks
                          .slice(0, i)
                          .reduce((s, t) => s + effectiveMinutes(t), 0)
                      const taskTime = effectiveMinutes(task)
                      const end = start + taskTime
                      const availableBeforeTimerEnd = available - end
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggedTaskId !== null) {
                              moveTask(draggedTaskId, task.id)
                            }
                            setDraggedTaskId(null)
                          }}
                          onDragEnd={() => setDraggedTaskId(null)}
                          className={`group flex items-center gap-3 rounded-xl px-3 py-3.5 sm:gap-4 ${
                            draggedTaskId === task.id
                              ? "cursor-grabbing opacity-50"
                              : "cursor-grab"
                          } ${
                            task.done
                              ? "bg-[#f2f8f3]"
                              : [
                                  "bg-[#f5f1fc]",
                                  "bg-[#f1f5fc]",
                                  "bg-[#fff6eb]",
                                  "bg-[#fcf1f5]",
                                ][i % 4]
                          }`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Mark ${task.name} complete`}
                            checked={task.done}
                            onChange={() => toggleTask(task)}
                            className="size-4 shrink-0 cursor-pointer accent-[#8468ce]"
                          />
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-xl">
                            {task.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`break-words text-sm font-semibold ${
                                task.done ? "text-[#829282] line-through" : ""
                              }`}
                            >
                              {task.name}
                            </p>
                            <p className="mt-1 text-[11px] tabular-nums text-[#8d849b]">
                              {duration(start)} – {duration(end)}
                              <span className="mx-2">·</span>
                              {duration(taskTime)}
                            </p>
                            {task.done &&
                              task.actualMinutes !== undefined &&
                              task.actualMinutes < task.minutes && (
                                <p className="mt-1 text-[10px] font-medium text-[#609071]">
                                  Finished{" "}
                                  {duration(task.minutes - task.actualMinutes)}{" "}
                                  early
                                </p>
                              )}
                            <p
                              className={`mt-1 text-[10px] ${
                                availableBeforeTimerEnd >= 0
                                  ? "text-[#71927b]"
                                  : "text-[#ac574d]"
                              }`}
                            >
                              {availableBeforeTimerEnd >= 0
                                ? `${duration(availableBeforeTimerEnd)} available before the timer ends`
                                : `${duration(Math.abs(availableBeforeTimerEnd))} past the timer end`}
                            </p>
                          </div>
                          <span
                            className={`hidden rounded-md px-2 py-1 text-[9px] font-medium sm:block ${
                              task.priority === "High"
                                ? "bg-[#fce6e5] text-[#b76c6b]"
                                : task.priority === "Medium"
                                  ? "bg-[#fbf0d9] text-[#a48a4c]"
                                  : "bg-[#e7f2e8] text-[#6a9679]"
                            }`}
                          >
                            {task.priority}
                          </span>
                          <button
                            aria-label={`Delete ${task.name}`}
                            onClick={() => void removeTask(task)}
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#aaa1b5] hover:bg-white hover:text-red-600"
                          >
                            <Icon name="trash" className="size-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {remaining > 0 && (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-[#d9e7dc] bg-[#f7fbf8] px-4 py-3">
                      <span className="text-xl">🍵</span>
                      <div>
                        <p className="text-xs font-medium text-[#6f9079]">
                          A little time for yourself
                        </p>
                        <p className="mt-1 text-[11px] text-[#93a599]">
                          {duration(remaining)} of unplanned time. Breathe,
                          rest, or explore.
                        </p>
                      </div>
                      <span className="ml-auto text-[#9eb6a5]">♡</span>
                    </div>
                  )}
                  <div className="mt-5 flex items-center gap-2 text-[10px] text-[#a39bad]">
                    <Icon name="clock" className="size-3" />
                    Schedule runs from the start of the timer to{" "}
                    {duration(scheduleEnd)} · Deadlines follow elapsed plan time
                  </div>
                </section>
              )}
              {page === "My schedule" && (
                <section className={panel}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <SectionHeading
                      icon="📅"
                      title="Your planning history"
                      subtitle="Look back on your tasks and keep your momentum going."
                    />
                    <div className="rounded-xl bg-[#fff7e8] px-4 py-2.5 text-center text-[#9a7028]">
                      <p className="text-lg font-semibold">🔥 {streak}</p>
                      <p className="text-[9px] font-medium tracking-wide">
                        DAY STREAK
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-[#ece8f2] bg-[#fcfbfe] p-3 sm:p-5">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        aria-label="Previous month"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                        className="flex size-9 items-center justify-center rounded-lg bg-white text-[#766985] ring-1 ring-[#e7e2ed] hover:bg-[#f6f2fc]"
                      >
                        <Icon name="chevronLeft" className="size-5" />
                      </button>
                      <div className="text-center">
                        <h2 className="text-base font-semibold text-[#4e4758]">
                          {calendarMonth.toLocaleDateString("en-US", {
                            month: "long",
                            year: "numeric",
                          })}
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date()
                            setCalendarMonth(
                              new Date(
                                today.getFullYear(),
                                today.getMonth(),
                                1,
                              ),
                            )
                            setSelectedDate(dateKey(today))
                          }}
                          className="mt-1 text-[10px] font-medium text-[#8063cc]"
                        >
                          Back to today
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="Next month"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                        className="flex size-9 items-center justify-center rounded-lg bg-white text-[#766985] ring-1 ring-[#e7e2ed] hover:bg-[#f6f2fc]"
                      >
                        <Icon name="chevron" className="size-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-[9px] font-semibold tracking-wide text-[#9c94a6]">
                      {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(
                        (day) => (
                          <span key={day} className="pb-2">
                            {day}
                          </span>
                        ),
                      )}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                      {calendarDays.map((day) => {
                        const key = dateKey(day)
                        const record = historyWithToday[key]
                        const isToday = key === todayKey
                        const isSelected = key === selectedDate
                        const isCurrentMonth =
                          day.getMonth() === calendarMonth.getMonth()
                        const dayComplete = isCompleteDay(record)
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => setSelectedDate(key)}
                            className={`relative flex min-h-12 flex-col items-center justify-center rounded-lg text-xs sm:min-h-16 ${
                              isSelected
                                ? "bg-[#8063cc] text-white shadow-[0_6px_16px_#8063cc30]"
                                : isToday
                                  ? "bg-[#eee9fb] text-[#765ac0] ring-1 ring-[#d8cdf1]"
                                  : "bg-white text-[#625b6d] hover:bg-[#f4f0fb]"
                            } ${isCurrentMonth ? "" : "opacity-35"}`}
                          >
                            <span className="font-semibold">
                              {day.getDate()}
                            </span>
                            {record?.tasks.length ? (
                              <span
                                className={`mt-1 flex items-center gap-1 text-[8px] ${
                                  isSelected
                                    ? "text-white/80"
                                    : dayComplete
                                      ? "text-[#5d9a70]"
                                      : "text-[#9478c5]"
                                }`}
                              >
                                <span
                                  className={`size-1.5 rounded-full ${
                                    isSelected
                                      ? "bg-white"
                                      : dayComplete
                                        ? "bg-[#70ad83]"
                                        : "bg-[#a88bde]"
                                  }`}
                                />
                                <span className="hidden sm:inline">
                                  {record.tasks.length}
                                </span>
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[#ece8f2] pt-3 text-[9px] text-[#938a9e]">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-[#70ad83]" />
                        All tasks complete
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-[#a88bde]" />
                        Tasks planned
                      </span>
                    </div>
                  </div>
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold tracking-wider text-[#998da5]">
                          DAY PREVIEW
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-[#4c4655]">
                          {new Date(
                            `${selectedDate}T12:00:00`,
                          ).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </h2>
                      </div>
                      {selectedRecord?.tasks.length ? (
                        <span
                          className={`rounded-full px-3 py-1.5 text-[10px] font-medium ${
                            isCompleteDay(selectedRecord)
                              ? "bg-[#eaf5ec] text-[#609071]"
                              : "bg-[#f0ebfa] text-[#8063cc]"
                          }`}
                        >
                          {isCompleteDay(selectedRecord)
                            ? "Day complete"
                            : `${selectedRecord.tasks.filter((task) => task.done).length}/${selectedRecord.tasks.length} finished`}
                        </span>
                      ) : null}
                    </div>
                    {selectedRecord?.tasks.length ? (
                      <div className="mt-4 space-y-2">
                        {selectedRecord.tasks.map((task, index) => {
                          const start =
                            toMinutes(selectedRecord.startTime) +
                            selectedRecord.tasks
                              .slice(0, index)
                              .reduce(
                                (sum, item) => sum + effectiveMinutes(item),
                                0,
                              )
                          const taskTime = effectiveMinutes(task)
                          return (
                            <div
                              key={task.id}
                              className="flex items-center gap-3 rounded-xl bg-[#f8f6fb] px-3 py-3"
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-lg">
                                {task.emoji}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    task.done
                                      ? "text-[#839084] line-through"
                                      : "text-[#554e5e]"
                                  }`}
                                >
                                  {task.name}
                                </p>
                                <p className="mt-1 text-[10px] text-[#968c9f]">
                                  {duration(start)} –{" "}
                                  {duration(start + taskTime)} ·{" "}
                                  {duration(taskTime)}
                                </p>
                              </div>
                              <span
                                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                                  task.done
                                    ? "bg-[#dceee0] text-[#59906a]"
                                    : "bg-[#ece7f6] text-[#9785b2]"
                                }`}
                              >
                                {task.done ? (
                                  <Icon name="check" className="size-3" />
                                ) : (
                                  "·"
                                )}
                              </span>
                            </div>
                          )
                        })}
                        <div className="flex flex-wrap justify-between gap-2 pt-2 text-[10px] text-[#968c9f]">
                          <span>
                            Available:{" "}
                            {duration(selectedRecord.availableMinutes)}
                          </span>
                          <span>
                            Planned:{" "}
                            {duration(
                              selectedRecord.tasks.reduce(
                                (sum, task) => sum + effectiveMinutes(task),
                                0,
                              ),
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-[#ddd5e7] bg-[#faf9fc] px-5 py-8 text-center">
                        <span className="text-3xl">🗓️</span>
                        <p className="mt-3 text-sm font-medium text-[#665e70]">
                          No tasks were planned for this day
                        </p>
                        <p className="mt-1 text-xs text-[#9a91a4]">
                          Days with tasks will appear here automatically.
                        </p>
                      </div>
                    )}
                    {selectedDate >= todayKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setTaskDate(selectedDate)
                          setPage("My planner")
                          setNotice(
                            `Planning for ${new Date(
                              `${selectedDate}T12:00:00`,
                            ).toLocaleDateString("en-US", {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            })}.`,
                          )
                        }}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#eee8fa] px-4 py-3 text-sm font-semibold text-[#765ac0] hover:bg-[#e5dcf7]"
                      >
                        <Icon name="plus" className="size-4" />
                        Plan a task for this day
                      </button>
                    )}
                  </div>
                </section>
              )}
              {page === "My profile" && (
                <section className={`${panel} overflow-hidden p-0`}>
                  <div className="bg-[linear-gradient(135deg,#eee8ff,#f8f5ff_55%,#fff8ea)] px-6 py-8 sm:px-8">
                    <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
                      <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[#8063cc] text-3xl font-semibold text-white shadow-[0_10px_30px_#8063cc35] ring-4 ring-white">
                        {userInitial}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold tracking-[.16em] text-[#8f7aae]">
                          STUDENT ACCOUNT
                        </p>
                        <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-[#443d50]">
                          {user}
                        </h2>
                        <p className="mt-1 truncate text-sm text-[#81778d]">
                          {email}
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[10px] font-medium text-[#6f8f78]">
                          <span className="size-1.5 rounded-full bg-[#70ad83]" />
                          Supabase account
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-7 sm:px-8">
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {[
                        {
                          label: "Tasks finished",
                          value: totalFinishedTasks,
                        },
                        { label: "Completed days", value: completedDays },
                        { label: "Current streak", value: `${streak}d` },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-xl bg-[#f8f6fb] px-2 py-4 text-center"
                        >
                          <p className="text-xl font-semibold text-[#765ac0] sm:text-2xl">
                            {stat.value}
                          </p>
                          <p className="mt-1 text-[9px] text-[#92899d] sm:text-[10px]">
                            {stat.label}
                          </p>
                        </div>
                      ))}
                    </div>
                    <form
                      className="mt-8"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        const nextName = String(data.get("profile-name")).trim()
                        const nextEmail = String(
                          data.get("profile-email"),
                        ).trim()
                        if (!nextName || !nextEmail) return
                        setUser(nextName)
                        setEmail(nextEmail)
                        showToast("Profile changes saved.")
                      }}
                    >
                      <div className="mb-5">
                        <h2 className="text-sm font-semibold text-[#504858]">
                          Profile details
                        </h2>
                        <p className="mt-1 text-xs text-[#978e9f]">
                          These details are stored locally on this device.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-xs font-medium text-[#747183]">
                          First name
                          <input
                            key={`name-${user}`}
                            name="profile-name"
                            required
                            defaultValue={user}
                            autoComplete="given-name"
                            className={`${input} mt-2`}
                          />
                        </label>
                        <label className="text-xs font-medium text-[#747183]">
                          Email address
                          <input
                            key={`email-${email}`}
                            name="profile-email"
                            required
                            type="email"
                            defaultValue={email}
                            autoComplete="email"
                            className={`${input} mt-2`}
                          />
                        </label>
                      </div>
                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#ece8f1] pt-5">
                        <button
                          type="submit"
                          className="rounded-lg bg-[#8063cc] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7051b9]"
                        >
                          Save profile
                        </button>
                        <button
                          type="button"
                          onClick={() => void signOut()}
                          className="rounded-lg border border-[#f0d4d4] px-5 py-2.5 text-xs font-semibold text-[#b75b52] hover:bg-[#fff4f3]"
                        >
                          Log out
                        </button>
                      </div>
                    </form>
                    <p className="mt-6 text-center text-[10px] text-[#a099aa]">
                      {totalPlannedTasks} tasks planned across your Daylight
                      history
                    </p>
                  </div>
                </section>
              )}
              {page === "My progress" && (
                <section className={panel}>
                  <SectionHeading
                    icon="🏆"
                    title="Every little win counts"
                    subtitle="Complete tasks to grow your daily progress."
                  />
                  <div className="my-8 text-center">
                    <span className="text-6xl">
                      {completed === tasks.length && tasks.length ? "🌳" : "🌱"}
                    </span>
                    <p className="mt-6 text-4xl font-semibold text-[#8063cc]">
                      {completed * 25} <span className="text-lg">XP</span>
                    </p>
                    <p className="mt-2 text-sm text-[#8a8396]">
                      {completed} of {tasks.length} tasks completed
                    </p>
                  </div>
                  <div>
                    <div className="mb-2.5 flex items-center justify-between text-[10px] font-medium">
                      <span className="text-[#8b819b]">Daily progress</span>
                      <span className="rounded-full bg-[#eee8fa] px-2 py-1 tabular-nums text-[#765ac0]">
                        {Math.round((completed / (tasks.length || 1)) * 100)}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Tasks completed"
                      aria-valuenow={completed}
                      aria-valuemin={0}
                      aria-valuemax={tasks.length || 1}
                      className="h-3 overflow-hidden rounded-full bg-[#ece7f6] p-0.5"
                    >
                      <div
                        className="h-full rounded-full bg-[#8063cc] shadow-[0_0_10px_#8063cc55] transition-[width] duration-500 ease-out"
                        style={{
                          width: `${(completed / (tasks.length || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-4 text-center text-sm text-[#8a8396]">
                    Earn 25 XP for each completed task. Your next little win is
                    waiting.
                  </p>
                  <button
                    onClick={() => setPage("My schedule")}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#ede7fa] py-3 text-sm text-[#765ac0]"
                  >
                    Keep making progress
                    <Icon name="arrow" className="size-4" />
                  </button>
                </section>
              )}
            </div>
            <div
              className={`min-w-0 space-y-5 ${
                page === "My profile" ? "hidden" : ""
              }`}
            >
              <section className={panel}>
                <SectionHeading
                  icon="🧮"
                  title="Your time, by the numbers"
                  subtitle="Simple math. A clearer day."
                />
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    {
                      label: "Available",
                      val: available,
                      icon: "clock",
                      color: "text-[#8b6dc7]",
                      bg: "bg-[#f5f0fc]",
                    },
                    {
                      label: "Planned",
                      val: used,
                      icon: "calendar",
                      color: "text-[#6e92c1]",
                      bg: "bg-[#eef4fc]",
                    },
                    {
                      label: remaining < 0 ? "Over budget" : "Remaining",
                      val: Math.abs(remaining),
                      icon: "sun",
                      color: remaining < 0 ? "text-red-600" : "text-[#71a18a]",
                      bg: remaining < 0 ? "bg-red-50" : "bg-[#eef7f0]",
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className={`${c.bg} ${c.color} rounded-xl px-2 py-4 text-center`}
                    >
                      <Icon name={c.icon} className="mx-auto size-4" />
                      <p className="mt-2 text-lg font-semibold tabular-nums sm:text-xl">
                        {duration(c.val)}
                      </p>
                      <p className="mt-1 text-[10px]">{c.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-between text-xs">
                  <span className="font-medium text-[#777084]">
                    Your time balance
                  </span>
                  <span className="text-[#977cc7]">{percent}% planned</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Available time planned"
                  aria-valuenow={Math.min(percent, 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e6f1e8]"
                >
                  <div
                    className={`h-full rounded-full ${
                      remaining < 0 ? "bg-[#db7979]" : "bg-[#a88bde]"
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <div className="mt-2.5 flex justify-between text-[10px] text-[#9a92a7]">
                  <span>
                    ● <span className="text-[#9680b7]">Planned time</span>
                  </span>
                  <span className="text-[#88a994]">● Free time</span>
                </div>
                <div className="mt-6 rounded-xl bg-[#f8f7fb] px-4 py-4">
                  <p className="text-[10px] font-semibold tracking-wider text-[#92829d]">
                    LET’S DO THE MATH
                  </p>
                  <p className="mt-3 break-words text-xs leading-relaxed text-[#9a90a6]">
                    {tasks.length
                      ? tasks
                          .map((task) => duration(effectiveMinutes(task)))
                          .join(" + ")
                      : "0m"}{" "}
                    <span className="font-medium text-[#746086]">
                      = {duration(used)}
                    </span>
                  </p>
                  <div className="mt-3 border-t border-dashed border-[#e1dce9] pt-3 text-center text-base font-semibold tabular-nums">
                    <span className="text-[#9676c8]">
                      {duration(available)}
                    </span>
                    <span className="mx-2 text-[#b3aaba]">−</span>
                    <span className="text-[#7694bd]">{duration(used)}</span>
                    <span className="mx-2 text-[#b3aaba]">=</span>
                    <span
                      className={
                        remaining < 0 ? "text-red-600" : "text-[#76a58a]"
                      }
                    >
                      {remaining < 0 ? "−" : ""}
                      {duration(Math.abs(remaining))}
                    </span>
                  </div>
                  <p className="mt-2 text-center text-[9px] text-[#aaa0b4]">
                    Available − planned = remaining
                  </p>
                </div>
              </section>
              <section className="rounded-xl bg-[#f3effc] p-5 ring-1 ring-[#e5dcf5]">
                <div className="flex items-center gap-2">
                  <span>⚖️</span>
                  <h2 className="text-sm font-semibold text-[#68558e]">
                    Automatic time distribution
                  </h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#817492]">
                  Fill your available time evenly, or give more minutes to
                  higher-priority tasks.
                </p>
                <div className="mt-4 rounded-lg bg-white/70 px-3 py-3 text-center text-xs text-[#827397]">
                  {tasks.length ? (
                    distributionMode === "priority" ? (
                      <>
                        <span className="font-semibold text-[#765ac0]">
                          {duration(available)}
                        </span>{" "}
                        ÷ {totalPriorityWeight} priority points ={" "}
                        <span className="font-semibold text-[#765ac0]">
                          about{" "}
                          {duration(
                            Math.floor(available / totalPriorityWeight),
                          )}{" "}
                          per point
                        </span>
                        <span className="mt-1 block text-[10px] text-[#9486a4]">
                          High = 3 points · Medium = 2 · Low = 1
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-[#765ac0]">
                          {duration(available)}
                        </span>{" "}
                        ÷ {tasks.length} {tasks.length === 1 ? "task" : "tasks"}{" "}
                        ={" "}
                        <span className="font-semibold text-[#765ac0]">
                          about {duration(Math.floor(available / tasks.length))}{" "}
                          each
                        </span>
                      </>
                    )
                  ) : (
                    "Add tasks to divide your available time."
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!tasks.length || available <= 0}
                    onClick={() => distributeTime(false)}
                    aria-pressed={distributionMode === "even"}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                      distributionMode === "even"
                        ? "bg-[#8063cc] text-white ring-[#8063cc]"
                        : "bg-white text-[#765ac0] ring-[#dfd5f2] hover:bg-[#faf8ff]"
                    }`}
                  >
                    Divide evenly
                  </button>
                  <button
                    type="button"
                    disabled={!tasks.length || available <= 0}
                    onClick={() => distributeTime(true)}
                    aria-pressed={distributionMode === "priority"}
                    className={`rounded-lg px-3 py-2.5 text-xs font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                      distributionMode === "priority"
                        ? "bg-[#8063cc] text-white ring-[#8063cc]"
                        : "bg-white text-[#765ac0] ring-[#dfd5f2] hover:bg-[#faf8ff]"
                    }`}
                  >
                    Use priorities
                  </button>
                </div>
                {tasks.length > 0 && (
                  <div className="mt-4 rounded-lg bg-white/70 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold tracking-wider text-[#78658f]">
                        CURRENT DISTRIBUTION
                      </p>
                      <span className="rounded-full bg-[#eee8fa] px-2 py-1 text-[9px] font-medium text-[#765ac0]">
                        {distributionMode === "priority"
                          ? "By priority"
                          : distributionMode === "even"
                            ? "Even"
                            : "Custom"}
                      </span>
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="shrink-0">{task.emoji}</span>
                          <span className="min-w-0 flex-1 truncate text-[#665d70]">
                            {task.name}
                          </span>
                          <span className="text-[10px] text-[#9a8ea7]">
                            {task.priority}
                          </span>
                          <span className="w-14 text-right font-semibold tabular-nums text-[#765ac0]">
                            {duration(task.minutes)}
                          </span>
                          <span className="w-8 text-right text-[10px] tabular-nums text-[#9a8ea7]">
                            {available
                              ? Math.round((task.minutes / available) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <section
                aria-live="polite"
                className={`rounded-xl p-5 ring-1 ${
                  allTasksFinished
                    ? "bg-[#eff8f0] ring-[#dcebdd]"
                    : hasNoFreeTime
                      ? "bg-[#fff9ec] ring-[#eee0bd]"
                      : scheduleFits
                        ? "bg-[#eff8f0] ring-[#dcebdd]"
                        : "bg-[#fff0ef] ring-[#f2d7d4]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      allTasksFinished
                        ? "bg-[#d7eddb] text-[#56946b]"
                        : hasNoFreeTime
                          ? "bg-[#f5e6bd] text-[#98762d]"
                          : scheduleFits
                            ? "bg-[#d7eddb] text-[#56946b]"
                            : "bg-[#f8d9d5] text-[#b75b52]"
                    }`}
                  >
                    {allTasksFinished ? (
                      <Icon name="check" className="size-4" />
                    ) : hasNoFreeTime ? (
                      <Icon name="clock" className="size-4" />
                    ) : scheduleFits ? (
                      <Icon name="check" className="size-4" />
                    ) : (
                      "!"
                    )}
                  </span>
                  <div>
                    <h2
                      className={`text-sm font-semibold ${
                        allTasksFinished
                          ? "text-[#507c5c]"
                          : hasNoFreeTime
                            ? "text-[#876921]"
                            : scheduleFits
                              ? "text-[#507c5c]"
                              : "text-[#a44e48]"
                      }`}
                    >
                      {allTasksFinished
                        ? "All tasks finished!"
                        : hasNoFreeTime
                          ? "Your schedule is completely full."
                          : scheduleFits
                            ? "Perfect! Your schedule fits."
                            : remaining < 0
                              ? "You don’t have enough time!"
                              : "A task misses its deadline!"}
                    </h2>
                    <p
                      className={`mt-2 text-xs leading-relaxed ${
                        allTasksFinished
                          ? "text-[#799582]"
                          : hasNoFreeTime
                            ? "text-[#9b8148]"
                            : scheduleFits
                              ? "text-[#799582]"
                              : "text-[#b8756f]"
                      }`}
                    >
                      {allTasksFinished
                        ? savedMinutes > 0
                          ? `You completed every task and saved ${duration(savedMinutes)}. You have ${duration(Math.max(0, remaining))} left in your day.`
                          : "You completed everything you planned for today. Your day is officially wrapped up."
                        : hasNoFreeTime
                          ? "You have 0 minutes of free time. Every available minute is planned."
                          : scheduleFits
                            ? savedMinutes > 0
                              ? `Finishing early added ${duration(savedMinutes)} back to your day. You now have ${duration(remaining)} of free time.`
                              : `You still have ${duration(remaining)} of free time.`
                            : remaining < 0
                              ? `You’re short by ${duration(Math.abs(remaining))}. Shorten a task or increase your available time.`
                              : `Your schedule runs ${duration(largestDeadlineOverrun)} past at least one deadline. Start earlier, reorder tasks, or shorten a task.`}
                    </p>
                    {allTasksFinished ? (
                      <p className="mt-3 text-[11px] text-[#8aa392]">
                        Great work showing up for your plan.
                      </p>
                    ) : scheduleFits && !hasNoFreeTime ? (
                      <p className="mt-3 text-[11px] text-[#8aa392]">
                        A balanced day looks good on you. 🌿
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
              <section className="rounded-xl bg-[#fff9ec] p-5">
                <div className="flex items-center gap-2">
                  <span>💡</span>
                  <h2 className="text-xs font-semibold text-[#938058]">
                    A little planning wisdom
                  </h2>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#a39376]">
                  Try the <span className="font-semibold">50/10 rule</span>:
                  focus for 50 minutes, then take a 10-minute break. Your brain
                  will thank you.
                </p>
                <div className="mt-4 flex items-center gap-2 text-[10px] text-[#b6a17e]">
                  <span className="h-px w-5 bg-[#e1d3b8]" />
                  SMALL HABITS, BIG DIFFERENCE
                </div>
              </section>
            </div>
          </div>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e9e7f0] pt-5 text-[10px] text-[#aaa4b6]">
            <span>Made for your pace. Not the race. 🌱</span>
            <span>A little math makes room for more.</span>
          </footer>
        </main>
      </div>
      {showFloatingClock && (
        <div className="daylight-toast fixed top-4 right-4 z-30 flex items-center gap-2 rounded-lg border border-[#e5e4ec] bg-white/95 px-3 py-2 text-[#79758b] shadow-[0_10px_30px_#30284220] backdrop-blur-md sm:right-6">
          <Icon name="clock" className="size-4" />
          <div>
            <p className="whitespace-nowrap text-[10px] leading-none text-[#9992a6]">
              PLAN TIMER
            </p>
            <p className="mt-1 text-xs font-semibold tabular-nums text-[#625b70]">
              {countdownLabel} remaining
            </p>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 overflow-visible sm:right-6 sm:bottom-6">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={`daylight-toast flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                exitingToastIds.includes(toast.id)
                  ? "daylight-toast-exiting"
                  : ""
              } ${
                toast.reminder
                  ? "border-[#dfd5f2] bg-[#f0ebfa] text-[#5f4b87]"
                  : "border-[#e5e4ec] bg-white text-[#4c4655]"
              }`}
            >
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                  toast.reminder
                    ? "bg-[#8063cc] text-white"
                    : "bg-[#70a981] text-white"
                }`}
              >
                <Icon
                  name={toast.reminder ? "clock" : "check"}
                  className="size-3.5"
                />
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                {toast.reminder && (
                  <span className="mb-0.5 block text-[9px] font-semibold tracking-[.14em] text-[#8063cc]">
                    SCHEDULE REMINDER
                  </span>
                )}
                {toast.message}
              </span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast)}
                className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[#8b8198] hover:bg-[#e5dcf7] hover:text-[#5f4b87]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {completionModal && (
        <div
          className={`completion-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#29233f]/45 p-5 backdrop-blur-sm ${
            isModalClosing ? "completion-backdrop-closing" : ""
          }`}
          onMouseDown={() => setIsModalClosing(true)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-title"
            onMouseDown={(event) => event.stopPropagation()}
            className={`completion-modal relative w-full max-w-sm overflow-hidden rounded-3xl bg-white px-7 py-8 text-center shadow-[0_24px_80px_#33285755] ring-1 ring-white/70 ${
              isModalClosing ? "completion-modal-closing" : ""
            }`}
          >
            {completionModal.kind === "all" && (
              <div aria-hidden="true" className="absolute inset-0">
                {[
                  "#8063cc",
                  "#f1b84b",
                  "#70ad83",
                  "#e77d9d",
                  "#72a5d8",
                  "#a98be1",
                  "#f1b84b",
                  "#70ad83",
                  "#e77d9d",
                  "#8063cc",
                  "#72a5d8",
                  "#a98be1",
                ].map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="completion-confetti"
                    style={
                      {
                        "--confetti-color": color,
                        "--confetti-left": `${7 + ((index * 17) % 88)}%`,
                        "--confetti-delay": `${(index % 5) * 0.12}s`,
                        "--confetti-rotate": `${index * 37}deg`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label="Close celebration"
              onClick={() => setIsModalClosing(true)}
              className="absolute top-4 right-4 z-10 flex size-8 items-center justify-center rounded-full bg-[#f5f2fa] text-[#8b8198] hover:bg-[#ece6f5]"
            >
              ×
            </button>
            <div
              className={`completion-badge relative mx-auto flex size-20 items-center justify-center rounded-3xl text-4xl ${
                completionModal.kind === "all"
                  ? "bg-[#eee8ff]"
                  : completionModal.kind === "all-late"
                    ? "bg-[#fff3db]"
                    : "bg-[#edf8ef]"
              }`}
            >
              {completionModal.kind === "all"
                ? "🏆"
                : completionModal.kind === "all-late"
                  ? "🌤️"
                  : completionModal.emoji}
            </div>
            <p className="relative mt-5 text-[10px] font-semibold tracking-[.18em] text-[#9988b0]">
              {completionModal.kind === "all"
                ? "ALL TASKS COMPLETE"
                : completionModal.kind === "all-late"
                  ? "DAY COMPLETE"
                  : "TASK COMPLETE"}
            </p>
            <h2
              id="completion-title"
              className="relative mt-2 text-2xl font-semibold tracking-tight text-[#3f394d]"
            >
              {completionModal.kind === "all"
                ? `You did it, ${user}!`
                : completionModal.kind === "all-late"
                  ? "Everything is finished!"
                  : "One more win for today!"}
            </h2>
            <p className="relative mt-3 text-sm leading-relaxed text-[#7e758c]">
              {completionModal.kind === "all"
                ? "Every task was finished within your available time and deadlines. That’s thoughtful planning in action."
                : completionModal.kind === "all-late"
                  ? "All your tasks are done. Your plan ran a little over, but finishing is still progress worth recognizing."
                  : `${completionModal.taskName} is finished. Keep that momentum going—you’re making space for what matters.`}
            </p>
            {completionModal.kind === "all" && (
              <div className="relative mt-5 rounded-2xl bg-[#f5f1ff] px-4 py-3 text-sm font-semibold text-[#765ac0]">
                +{tasks.length * 25} XP · On-time finish
              </div>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => setIsModalClosing(true)}
              className="relative mt-6 w-full rounded-xl bg-[#8063cc] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_#8063cc33] hover:bg-[#7051b9]"
            >
              {completionModal.kind === "all"
                ? "Celebrate the win"
                : "Keep going"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Renders the Daylight wordmark used on authentication screens.
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#886cd7] text-white">
        <Icon name="sun" className="size-6" />
      </span>
      <span className="text-[23px] font-semibold tracking-[-1px] text-[#414052]">
        daylight<span className="text-[#9b80da]">.</span>
      </span>
    </div>
  )
}
// Renders a consistent heading for planner sections.
function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: string
  title: string
  subtitle: string
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="text-lg">{icon}</span>
        {title}
      </h2>
      <p className="mt-1.5 text-xs text-[#9b93a6]">{subtitle}</p>
    </div>
  )
}

// Toggles the persisted light/dark theme.
function ThemeToggle({
  theme,
  setTheme,
  floating = false,
}: {
  theme: "light" | "dark"
  setTheme: React.Dispatch<React.SetStateAction<"light" | "dark">>
  floating?: boolean
}) {
  const isDark = theme === "dark"
  return (
    <button
      type="button"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`theme-toggle flex size-9 shrink-0 items-center justify-center rounded-full border border-[#e5e4ec] bg-white text-[#766985] shadow-sm hover:bg-[#f6f2fc] ${
        floating ? "fixed top-5 right-5 z-40" : ""
      }`}
    >
      <Icon name={isDark ? "sun" : "moon"} className="size-4" />
    </button>
  )
}
