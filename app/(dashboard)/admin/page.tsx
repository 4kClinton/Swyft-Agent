"use client"

import { useState } from "react"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Lock, UserPlus, Trash2, X, Copy } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

type AssignableRole = "manager" | "agent"

const roleLabel: Record<string, string> = {
  landlord: "Landlord",
  owner: "Landlord",
  manager: "Manager",
  agent: "Agent",
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export default function AdminTeamPage() {
  const { user, loading } = useAuth()
  const isPropertyManager = user?.companyKind === "property_manager"

  // Only query when allowed — the backend throws for non-property-managers.
  const team = useQuery(api.admin.team, isPropertyManager ? {} : "skip")
  const updateRole = useMutation(api.admin.updateMemberRole)
  const removeMember = useMutation(api.admin.removeMember)
  const revokeInvite = useMutation(api.admin.revokeInvite)
  const createMember = useAction(api.admin.createMember)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isPropertyManager) {
    return (
      <div className="container mx-auto p-6">
        <Card className="mx-auto mt-10 max-w-lg">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <Lock className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle>Team management is for property managers</CardTitle>
            <CardDescription>
              This section is only available to property-manager accounts. If you manage
              properties on behalf of landlords, switch your company type in Settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild>
              <Link href="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Members</h1>
          <p className="text-sm text-muted-foreground">
            Managers and agents in your property-management company.
          </p>
        </div>
        <AddMemberDialog onCreate={createMember} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {team === undefined ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.members.map((m) => (
                  <TableRow key={m.profileId}>
                    <TableCell>
                      <div className="font-medium">{m.fullName || "—"}</div>
                      {m.isSelf && <span className="text-xs text-muted-foreground">You</span>}
                    </TableCell>
                    <TableCell>
                      {m.isCompanyOwner ? (
                        <Badge>Owner · {roleLabel[m.role] ?? m.role}</Badge>
                      ) : (
                        <Select
                          value={m.role}
                          onValueChange={async (v) => {
                            try {
                              await updateRole({ profileId: m.profileId, role: v as AssignableRole })
                              toast.success("Role updated")
                            } catch (e: any) {
                              toast.error(e?.message ?? "Failed to update role")
                            }
                          }}
                          disabled={m.isSelf}
                        >
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="agent">Agent</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!m.isCompanyOwner && !m.isSelf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove member"
                          onClick={async () => {
                            if (!confirm(`Remove ${m.fullName || "this member"} from the team?`)) return
                            try {
                              await removeMember({ profileId: m.profileId })
                              toast.success("Member removed")
                            } catch (e: any) {
                              toast.error(e?.message ?? "Failed to remove member")
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {team && team.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
            <CardDescription>
              These people have been invited but haven&apos;t signed in yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {team.invites.map((inv) => (
              <div key={inv.inviteId} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{inv.email}</span>
                  <Badge variant="secondary" className="ml-2">{roleLabel[inv.role] ?? inv.role}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Revoke invite"
                  onClick={async () => {
                    try {
                      await revokeInvite({ inviteId: inv.inviteId })
                      toast.success("Invite revoked")
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to revoke invite")
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AddMemberDialog({
  onCreate,
}: {
  onCreate: (args: {
    email: string
    name?: string
    phone?: string
    role: AssignableRole
    tempPassword: string
  }) => Promise<{ email: string }>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    email: "",
    name: "",
    phone: "",
    role: "agent" as AssignableRole,
    tempPassword: randomPassword(),
  })

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.email.trim()) return toast.error("Email is required")
    setSaving(true)
    try {
      await onCreate({
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        role: form.role,
        tempPassword: form.tempPassword,
      })
      toast.success("Member added — share their temporary password so they can sign in")
      setOpen(false)
      setForm({ email: "", name: "", phone: "", role: "agent", tempPassword: randomPassword() })
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add member")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" /> Add member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            Creates an account in your company. Share the temporary password so they can sign in
            and change it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="m-email">Email *</Label>
            <Input id="m-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="agent@example.com" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="m-name">Full name</Label>
              <Input id="m-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-phone">Phone</Label>
              <Input id="m-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="07xx xxx xxx" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager — full property-management access</SelectItem>
                <SelectItem value="agent">Agent — limited access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-pass">Temporary password</Label>
            <div className="flex gap-2">
              <Input id="m-pass" value={form.tempPassword} onChange={(e) => set("tempPassword", e.target.value)} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy password"
                onClick={() => {
                  navigator.clipboard?.writeText(form.tempPassword)
                  toast.success("Password copied")
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" onClick={() => set("tempPassword", randomPassword())}>
                New
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters. They can change it after signing in.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
