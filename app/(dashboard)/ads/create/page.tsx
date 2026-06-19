import { redirect } from "next/navigation"

// Ad creation now happens in the "Create ad" dialog on /ads (issue #6).
export default function Page() {
  redirect("/ads")
}
