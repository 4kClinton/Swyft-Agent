"use client"

import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"
import { MessageSquare, Phone } from "lucide-react"
import { toast } from "sonner"

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  responded: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-800",
  spam: "bg-red-100 text-red-800",
}

export default function InquiriesPage() {
  const inquiries = useQuery(api.inquiries.list)
  const setStatus = useMutation(api.inquiries.setStatus)

  const update = async (id: string, status: "new" | "responded" | "closed" | "spam") => {
    try {
      await setStatus({ id: id as any, status })
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update")
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inquiries</h1>
        <p className="text-muted-foreground">Leads from your listings on the marketplace</p>
      </div>

      {inquiries === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : inquiries.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No inquiries yet" description="When renters inquire about your listed units, they'll appear here." />
      ) : (
        <div className="space-y-3">
          {inquiries.map((q) => (
            <Card key={q._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{q.fullName}</CardTitle>
                  <Badge className={statusColor[q.status]}>{q.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {q.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3 w-3" />{q.phone}</div>}
                {q.message && <p>{q.message}</p>}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => update(q._id, "responded")}>Mark responded</Button>
                  <Button size="sm" variant="ghost" onClick={() => update(q._id, "closed")}>Close</Button>
                  <Button size="sm" variant="ghost" onClick={() => update(q._id, "spam")}>Spam</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
