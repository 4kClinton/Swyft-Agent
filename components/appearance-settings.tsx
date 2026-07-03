"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  // next-themes resolves the active theme only on the client; render a stable
  // placeholder on the server pass to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const active = mounted ? theme ?? "system" : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Swyft looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {options.map(({ value, label, icon: Icon }) => {
            const selected = active === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  selected
                    ? "border-primary ring-2 ring-primary/40 bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
