"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  History,
  FileSpreadsheet,
  Calendar,
  Database,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { formatDistanceToNow } from "date-fns"

interface Upload {
  id: string
  file_name: string
  file_url: string
  file_size: number
  uploaded_at: string
  status: "uploaded" | "analyzing" | "processed" | "failed"
  detected_type: string | null
  processed_rows: number
  total_rows: number
  error_message: string | null
}

export function UploadHistory() {
  const { user } = useAuth()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUploads = async () => {
    if (!user) return

    try {
      const response = await fetch(`/api/uploads?company_id=${user.companyId}`)
      if (response.ok) {
        const { uploads } = await response.json()
        setUploads(uploads)
      }
    } catch (error) {
      console.error("Error fetching uploads:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUploads()
  }, [user])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />
      case "analyzing":
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed":
        return "bg-green-100 text-green-800"
      case "failed":
        return "bg-red-100 text-red-800"
      case "analyzing":
        return "bg-blue-100 text-blue-800"
      default:
        return "bg-yellow-100 text-yellow-800"
    }
  }

  const getTypeColor = (type: string | null) => {
    if (!type) return "bg-muted text-foreground"

    const colors: Record<string, string> = {
      tenants: "bg-blue-100 text-blue-800",
      buildings: "bg-green-100 text-green-800",
      expenses: "bg-red-100 text-red-800",
      units: "bg-purple-100 text-purple-800",
      payments: "bg-yellow-100 text-yellow-800",
    }
    return colors[type] || "bg-muted text-foreground"
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-muted-foreground">Loading upload history...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Upload History
        </CardTitle>
        <CardDescription>View and manage your previous file uploads</CardDescription>
      </CardHeader>
      <CardContent>
        {uploads.length === 0 ? (
          <div className="text-center py-8">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-muted-foreground">No uploads yet</p>
            <p className="text-sm text-muted-foreground">Upload your first file to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {uploads.map((upload) => (
              <div key={upload.id} className="border rounded-lg p-4 hover:bg-muted">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{upload.file_name}</span>
                      <Badge className={getStatusColor(upload.status)}>
                        {getStatusIcon(upload.status)}
                        <span className="ml-1">{upload.status}</span>
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(upload.uploaded_at), { addSuffix: true })}
                      </div>
                      <span>{formatFileSize(upload.file_size)}</span>
                      {upload.total_rows > 0 && (
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          {upload.processed_rows}/{upload.total_rows} rows
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {upload.detected_type && (
                        <Badge className={getTypeColor(upload.detected_type)}>
                          {upload.detected_type.toUpperCase()}
                        </Badge>
                      )}
                      {upload.error_message && (
                        <span className="text-sm text-red-600">Error: {upload.error_message}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(upload.file_url, "_blank")}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
