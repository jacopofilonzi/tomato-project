"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Settings, Play, Pause, RotateCcw, X, Sun, Moon, Monitor, Volume2, VolumeX } from "lucide-react"

type ThemeMode = "light" | "dark" | "auto"
type Phase = "study" | "pause"

const STORAGE_KEY = "tomato-timer-settings"

interface Settings {
  studyMinutes: number
  studySeconds: number
  pauseMinutes: number
  pauseSeconds: number
  theme: ThemeMode
  soundEnabled: boolean
}

const DEFAULT_SETTINGS: Settings = {
  studyMinutes: 25,
  studySeconds: 0,
  pauseMinutes: 5,
  pauseSeconds: 0,
  theme: "auto",
  soundEnabled: false,
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = theme === "dark" || (theme === "auto" && prefersDark)
  root.classList.toggle("dark", isDark)
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function studyDurationOf(s: Settings) {
  return Math.max(1, s.studyMinutes * 60 + s.studySeconds)
}
function pauseDurationOf(s: Settings) {
  return Math.max(1, s.pauseMinutes * 60 + s.pauseSeconds)
}

export function TomatoTimer() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [phase, setPhase] = useState<Phase>("study")
  const [secondsLeft, setSecondsLeft] = useState(studyDurationOf(DEFAULT_SETTINGS))
  const [running, setRunning] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [proceedOpen, setProceedOpen] = useState(false)

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const isBreak = phase === "pause"

  // Play a short chime (respects the mute setting)
  const playSound = useCallback(() => {
    if (!settings.soundEnabled) return
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx.state === "suspended") void ctx.resume()
      const now = ctx.currentTime
      // two short beeps
      ;[0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "sine"
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, now + offset)
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + offset)
        osc.stop(now + offset + 0.18)
      })
    } catch {
      // ignore audio errors
    }
  }, [settings.soundEnabled])

  // Load persisted settings
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings
        setSettings(parsed)
        setSecondsLeft(studyDurationOf(parsed))
      }
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [])

  // Apply + persist theme and settings
  useEffect(() => {
    if (!loaded) return
    applyTheme(settings.theme)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // ignore
    }
  }, [settings, loaded])

  // React to system theme changes when in auto mode
  useEffect(() => {
    if (settings.theme !== "auto") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("auto")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [settings.theme])

  // Countdown — only decrements, never mutates phase (keeps it predictable)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  // Phase transition — runs when the countdown reaches zero
  useEffect(() => {
    if (!running || secondsLeft > 0) return
    playSound()
    if (phase === "study") {
      // Focus finished -> automatically start the break
      setPhase("pause")
      setSecondsLeft(pauseDurationOf(settings))
    } else {
      // Break finished -> stop and ask the user to proceed
      setRunning(false)
      setPhase("study")
      setSecondsLeft(studyDurationOf(settings))
      setProceedOpen(true)
    }
  }, [secondsLeft, running, phase, settings, playSound])

  const totalSeconds = useMemo(
    () => (phase === "study" ? studyDurationOf(settings) : pauseDurationOf(settings)),
    [phase, settings],
  )
  const progress = totalSeconds > 0 ? 1 - secondsLeft / totalSeconds : 0

  const revealControls = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setShowControls((v) => (settingsOpen ? v : false))
    }, 2500)
  }, [settingsOpen])

  // Auto-hide on mouse movement
  useEffect(() => {
    const onMove = () => revealControls()
    window.addEventListener("mousemove", onMove)
    window.addEventListener("touchstart", onMove)
    revealControls()
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("touchstart", onMove)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealControls])

  const reset = useCallback(() => {
    setRunning(false)
    setPhase("study")
    setSecondsLeft(studyDurationOf(settings))
  }, [settings])

  // Keep timer in sync ONLY when the duration settings actually change while
  // not running. Pausing must never reset the remaining time.
  const lastDurations = useRef({
    study: studyDurationOf(DEFAULT_SETTINGS),
    pause: pauseDurationOf(DEFAULT_SETTINGS),
  })
  useEffect(() => {
    const study = studyDurationOf(settings)
    const pause = pauseDurationOf(settings)
    const changed = study !== lastDurations.current.study || pause !== lastDurations.current.pause
    lastDurations.current = { study, pause }
    if (!changed || running) return
    setSecondsLeft(phase === "study" ? study : pause)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.studyMinutes, settings.studySeconds, settings.pauseMinutes, settings.pauseSeconds])

  const proceedToFocus = useCallback(() => {
    setProceedOpen(false)
    setPhase("study")
    setSecondsLeft(studyDurationOf(settings))
    setRunning(true)
  }, [settings])

  // Tick geometry — small radial bars around the dial
  const TICK_COUNT = 60
  const INNER_R = 39
  const OUTER_R = 47
  const filledTicks = Math.round(progress * TICK_COUNT)
  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT }, (_, i) => {
        const angle = (i / TICK_COUNT) * 2 * Math.PI
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const round = (n: number) => Math.round(n * 1000) / 1000
        return {
          x1: round(50 + INNER_R * cos),
          y1: round(50 + INNER_R * sin),
          x2: round(50 + OUTER_R * cos),
          y2: round(50 + OUTER_R * sin),
        }
      }),
    [],
  )

  const accentText = isBreak ? "text-success" : "text-primary"
  const accentBg = isBreak ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"

  return (
    <main className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-background px-6 py-8 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-6 sm:gap-8">
        <span className={`text-xs font-medium uppercase tracking-[0.3em] transition-colors ${accentText}`}>
          {isBreak ? "Break" : "Focus"}
        </span>

        {/* Timer dial — constrained by width AND height so it never overflows on tall, narrow phones */}
        <div className="relative aspect-square w-[min(78vw,52vh,22rem)]">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            {ticks.map((t, i) => (
              <line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                strokeWidth="1.5"
                strokeLinecap="round"
                stroke="currentColor"
                className={
                  i < filledTicks
                    ? `${accentText} transition-colors duration-300`
                    : "text-border transition-colors duration-300"
                }
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[clamp(2.5rem,12vw,4.5rem)] font-semibold tabular-nums tracking-tight">
              {formatTime(secondsLeft)}
            </span>
          </div>
        </div>

        {/* Play / pause / reset */}
        <div
          className={`flex items-center gap-4 transition-opacity duration-500 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            aria-label={running ? "Pause timer" : "Start timer"}
            className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${accentBg}`}
          >
            {running ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset timer"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Settings gear (bottom-right, auto-hide) */}
      <button
        type="button"
        onClick={() => {
          setSettingsOpen(true)
          revealControls()
        }}
        aria-label="Open settings"
        className={`fixed bottom-6 right-6 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all duration-500 hover:text-foreground ${
          showControls || settingsOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Settings className="h-5 w-5" />
      </button>

      {settingsOpen && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}

      {proceedOpen && (
        <ProceedDialog
          onProceed={proceedToFocus}
          onDismiss={() => setProceedOpen(false)}
        />
      )}
    </main>
  )
}

function ProceedDialog({ onProceed, onDismiss }: { onProceed: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
        <h2 className="text-lg font-semibold">Break&apos;s over</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your break has finished. Ready to start your next focus session?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={onProceed}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95"
          >
            Start focus
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
}) {
  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Day", icon: <Sun className="h-4 w-4" /> },
    { value: "dark", label: "Night", icon: <Moon className="h-4 w-4" /> },
    { value: "auto", label: "Auto", icon: <Monitor className="h-4 w-4" /> },
  ]

  const clampMin = (n: number) => Math.min(180, Math.max(0, Number.isNaN(n) ? 0 : n))
  const clampSec = (n: number) => Math.min(59, Math.max(0, Number.isNaN(n) ? 0 : n))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <DurationField
            label="Focus time"
            minutes={settings.studyMinutes}
            seconds={settings.studySeconds}
            onChange={(m, s) => onChange({ ...settings, studyMinutes: clampMin(m), studySeconds: clampSec(s) })}
          />
          <DurationField
            label="Break time"
            minutes={settings.pauseMinutes}
            seconds={settings.pauseSeconds}
            onChange={(m, s) => onChange({ ...settings, pauseMinutes: clampMin(m), pauseSeconds: clampSec(s) })}
          />

          {/* Sound toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sound</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.soundEnabled}
              onClick={() => onChange({ ...settings, soundEnabled: !settings.soundEnabled })}
              className={`flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
                settings.soundEnabled
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {settings.soundEnabled ? "On" : "Muted"}
            </button>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Appearance</span>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((opt) => {
                const active = settings.theme === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ ...settings, theme: opt.value })}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DurationField({
  label,
  minutes,
  seconds,
  onChange,
}: {
  label: string
  minutes: number
  seconds: number
  onChange: (minutes: number, seconds: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Stepper
          ariaLabel={`${label} minutes`}
          value={minutes}
          suffix="m"
          onChange={(v) => onChange(v, seconds)}
        />
        <span className="text-muted-foreground">:</span>
        <Stepper
          ariaLabel={`${label} seconds`}
          value={seconds}
          suffix="s"
          onChange={(v) => onChange(minutes, v)}
        />
      </div>
    </div>
  )
}

function Stepper({
  value,
  onChange,
  suffix,
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  ariaLabel: string
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={`Decrease ${ariaLabel}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        -
      </button>
      <div className="flex w-14 items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
          className="w-7 bg-transparent text-center font-mono text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={ariaLabel}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${ariaLabel}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        +
      </button>
    </div>
  )
}
