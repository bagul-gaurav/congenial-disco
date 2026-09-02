"use client"

/** Small shared form controls for the panels. Chrome only — never canvas content. */

import * as React from "react"

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 py-1 text-xs">
      <span className="w-20 shrink-0 text-chrome-muted">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-w-0 flex-1 rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text outline-none focus:border-chrome-accent ${props.className ?? ""}`}
    />
  )
}

export function NumberInput({
  value,
  onCommit,
  ...props
}: {
  value: number
  onCommit: (value: number) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <TextInput
      {...props}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onCommit(next)
      }}
    />
  )
}

export function Select({
  value,
  options,
  onCommit,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onCommit: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onCommit(event.target.value)}
      className="min-w-0 flex-1 rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text outline-none focus:border-chrome-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function ColorInput({
  value,
  onCommit,
  testId,
}: {
  value: string
  onCommit: (value: string) => void
  testId?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(event) => onCommit(event.target.value)}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-chrome-border bg-transparent"
      />
      <TextInput
        value={value}
        data-testid={testId}
        onChange={(event) => onCommit(event.target.value)}
      />
    </div>
  )
}

export function Button({
  children,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "accent" }) {
  const tone =
    variant === "accent"
      ? "bg-chrome-accent text-white hover:opacity-90"
      : "border border-chrome-border text-chrome-text hover:bg-white/5"

  return (
    <button
      type="button"
      {...props}
      className={`rounded px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${props.className ?? ""}`}
    >
      {children}
    </button>
  )
}
