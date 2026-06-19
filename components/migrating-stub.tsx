"use client"

import Link from "next/link"
import { Construction } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Placeholder for pages whose data layer is being rebuilt on Convex. Shown
 * while the Supabase → Convex migration is in progress so the app builds and
 * runs with zero Supabase dependencies.
 */
export function MigratingStub({ title }: { title: string }) {
  return (
    <div className="container mx-auto p-6">
      <Card className="max-w-lg mx-auto mt-10">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Construction className="h-10 w-10 text-amber-500" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            This screen is being rebuilt on Convex. The backend is ready — the UI is next.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
