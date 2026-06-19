import { redirect } from "next/navigation"

// Individual unit upload is retired (issue #11). Units are named when a tenant
// is created; vacancy is derived from each building's total units. Advertise a
// vacant unit from /ads.
export default function Page() {
  redirect("/vacant-units")
}
