"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Adding members now lives on the Team Members page (the "Add member" dialog).
export default function AddAgentRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin")
  }, [router])
  return null
}
