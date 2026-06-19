"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { User, Mail, Building2, Settings } from "lucide-react"

export default function ProfilePage() {
  const me = useQuery(api.companies.me)
  const { signOut } = useAuth()

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Profile</h1>

      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!me ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">{me.profile?.fullName ?? "—"}</div>
                  <div className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{me.email ?? "—"}</div>
                </div>
                <Badge className="ml-auto capitalize">{me.profile?.role ?? "—"}</Badge>
              </div>
              <div className="flex items-center gap-2 border-t pt-4 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{me.company?.name ?? "—"}</span>
                <Badge variant="outline" className="ml-auto capitalize">{me.company?.plan ?? "free"}</Badge>
              </div>
              <div className="flex gap-2 pt-2">
                <Button asChild variant="outline" size="sm"><Link href="/settings"><Settings className="mr-2 h-4 w-4" />Settings</Link></Button>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => signOut()}>Sign out</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
