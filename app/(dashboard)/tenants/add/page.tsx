import { redirect } from "next/navigation"

// The standalone add-tenant page is retired — tenants are added (with their
// unit) from the "Add Tenant" dialog on /tenants (issues #1 + #11).
export default function Page() {
  redirect("/tenants")
}
