"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileSpreadsheet, Brain, Loader2, Database, Eye, AlertCircle } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { toast } from "sonner"

interface AnalysisResult {
  detectedType: string
  confidence: number
  normalizedData: any[]
  suggestions: string[]
  errors: string[]
}

export function SmartUpload() {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((line) => line.trim())
    if (lines.length < 2) return { headers: [], rows: [] }

    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))
    const rows = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""))
      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ""
      })
      if (Object.values(row).some((val) => val !== "")) {
        rows.push(row)
      }
    }

    return { headers, rows }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setAnalysis(null)
      setShowPreview(false)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file || !user || !user.companyId) return

    setUploading(true)
    setProgress(10)
    setError(null)

    try {
      console.log("Starting upload for user:", user.id, "company:", user.companyId)

      // Upload file
      const formData = new FormData()
      formData.append("file", file)
      formData.append("company_id", user.companyId)
      formData.append("user_id", user.id)

      console.log("Sending upload request...")

      const uploadResponse = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      })

      const uploadResult = await uploadResponse.json()
      console.log("Upload response:", uploadResult)

      if (!uploadResponse.ok) {
        throw new Error(uploadResult.error || "Upload failed")
      }

      const { upload } = uploadResult
      setUploadId(upload.id)
      setProgress(30)

      console.log("File uploaded successfully, parsing content...")

      // Parse file content
      const text = await file.text()
      const { headers, rows } = parseCSV(text)

      if (rows.length === 0) {
        throw new Error("No valid data found in file")
      }

      console.log("Parsed data:", { headers, rowCount: rows.length })

      setProgress(50)
      setUploading(false)
      setAnalyzing(true)

      // Analyze with AI
      console.log("Starting AI analysis...")
      const analysisResponse = await fetch("/api/analyze-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: upload.id,
          headers,
          sampleRows: rows.slice(0, 5),
          allRows: rows,
        }),
      })

      const analysisResult = await analysisResponse.json()
      console.log("Analysis response:", analysisResult)

      if (!analysisResponse.ok) {
        throw new Error(analysisResult.error || "Analysis failed")
      }

      const { analysis: result } = analysisResult
      setAnalysis(result)
      setProgress(100)

      toast.success(`Detected: ${result.detectedType} data with ${Math.round(result.confidence * 100)}% confidence`)
    } catch (error) {
      console.error("Upload/Analysis error:", error)
      const errorMessage = error instanceof Error ? error.message : "Upload failed"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  const handleSaveData = async () => {
    if (!analysis || !uploadId || !user) return

    setSaving(true)
    setProgress(0)
    setError(null)

    try {
      const response = await fetch("/api/save-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          dataType: analysis.detectedType,
          normalizedData: analysis.normalizedData,
          companyId: user.companyId,
          userId: user.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Save failed")
      }

      setProgress(100)
      toast.success(`Successfully saved ${result.insertedCount} records to ${analysis.detectedType} table`)

      // Reset form
      setFile(null)
      setAnalysis(null)
      setUploadId(null)
      setShowPreview(false)
    } catch (error) {
      console.error("Save error:", error)
      const errorMessage = error instanceof Error ? error.message : "Save failed"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setSaving(false)
      setProgress(0)
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      tenants: "bg-blue-100 text-blue-800",
      buildings: "bg-green-100 text-green-800",
      expenses: "bg-red-100 text-red-800",
      units: "bg-purple-100 text-purple-800",
      payments: "bg-yellow-100 text-yellow-800",
      unknown: "bg-muted text-foreground",
    }
    return colors[type] || colors.unknown
  }

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <p className="font-medium">Upload Error</p>
            </div>
            <p className="text-red-700 mt-2">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setError(null)} className="mt-3">
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Smart Data Upload
          </CardTitle>
          <CardDescription>
            Upload CSV or Excel files and let AI detect and organize your data automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Selection */}
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{file ? file.name : "Choose a CSV or Excel file to upload"}</p>
              <Button
                variant="outline"
                onClick={() => document.getElementById("file-input")?.click()}
                disabled={uploading || analyzing || saving}
              >
                {file ? "Change File" : "Select File"}
              </Button>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Upload Button */}
          {file && !analysis && (
            <Button onClick={handleUpload} disabled={uploading || analyzing} className="w-full">
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {analyzing && <Brain className="h-4 w-4 mr-2" />}
              {uploading ? "Uploading..." : analyzing ? "Analyzing with AI..." : "Upload & Analyze"}
            </Button>
          )}

          {/* Progress */}
          {(uploading || analyzing || saving) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {uploading
                    ? "Uploading file..."
                    : analyzing
                      ? "AI is analyzing your data..."
                      : "Saving to database..."}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Analysis Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Detection Results */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Detected Type:</span>
                <Badge className={getTypeColor(analysis.detectedType)}>{analysis.detectedType.toUpperCase()}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Confidence:</span>
                <span className="text-sm">{Math.round(analysis.confidence * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Records:</span>
                <span className="text-sm">{analysis.normalizedData.length}</span>
              </div>
            </div>

            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">AI Suggestions:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  {analysis.suggestions.map((suggestion, i) => (
                    <li key={i}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Errors */}
            {analysis.errors.length > 0 && (
              <div className="bg-red-50 p-3 rounded-md">
                <h4 className="text-sm font-medium text-red-800 mb-2">Potential Issues:</h4>
                <ul className="text-sm text-red-700 space-y-1">
                  {analysis.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? "Hide Preview" : "Preview Data"}
              </Button>

              {analysis.detectedType !== "unknown" && (
                <Button onClick={handleSaveData} disabled={saving} className="flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  {saving ? "Saving..." : "Confirm & Save to Database"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview */}
      {showPreview && analysis && analysis.normalizedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
            <CardDescription>
              Normalized data ready for import ({analysis.normalizedData.length} records)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {Object.keys(analysis.normalizedData[0]).map((key) => (
                      <th key={key} className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.normalizedData.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted">
                      {Object.values(row).map((value: any, j) => (
                        <td key={j} className="px-4 py-2 whitespace-nowrap">
                          {value?.toString() || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {analysis.normalizedData.length > 10 && (
                <div className="p-4 text-center text-sm text-muted-foreground bg-muted">
                  Showing first 10 of {analysis.normalizedData.length} records
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
