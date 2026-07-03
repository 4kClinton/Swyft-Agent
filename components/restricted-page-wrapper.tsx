"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, AlertCircle } from "lucide-react"

interface RestrictedPageWrapperProps {
  children: React.ReactNode
  pageName: string
}

export function RestrictedPageWrapper({ children, pageName }: RestrictedPageWrapperProps) {
  const { user } = useAuth()
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true) // Default to true to avoid unnecessary blur
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [accessCode, setAccessCode] = useState("")
  const [error, setError] = useState("")
  const [attempts, setAttempts] = useState(0)

  // Simplified authorization check
  useEffect(() => {
    // For demo purposes, we'll just show the dialog without blurring first
    if (user && user.role !== "admin") {
      setShowAuthDialog(true)
    }
  }, [user])

  // Handle access code verification
  const verifyAccessCode = () => {
    // Simplified verification
    const validCode = "admin123"

    if (accessCode === validCode) {
      setIsAuthorized(true)
      setShowAuthDialog(false)
      setError("")
    } else {
      setError("Invalid access code. Please try again.")
      setAttempts(attempts + 1)
    }
  }

  return (
    <>
      {/* No blur for better performance */}
      <div className="h-full">{children}</div>

      <Dialog open={showAuthDialog} onOpenChange={(open) => setShowAuthDialog(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Restricted Access - {pageName}
            </DialogTitle>
            <DialogDescription>
              This page contains sensitive information and requires special access. Please enter your access code to
              continue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="access-code">Access Code</Label>
              <Input
                id="access-code"
                type="password"
                placeholder="Enter your access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Cancel
            </Button>
            <Button onClick={verifyAccessCode} disabled={!accessCode}>
              Verify Access
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
