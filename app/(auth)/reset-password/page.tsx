"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SwyftLogo } from "@/components/swyft-logo"

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <SwyftLogo className="h-11 w-auto" priority />
          </div>
          <CardTitle className="text-2xl text-center">Set a new password</CardTitle>
          <CardDescription className="text-center">
            Email-based password reset is being set up. Please contact support for help
            changing your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm">
          <Link href="/login" className="text-green-600 hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
