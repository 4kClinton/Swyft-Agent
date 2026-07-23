// Shared area list — fetched from the swyft-customer deployment so both apps use
// ONE admin-managed source (managed in the customer app's "Manage areas" screen)
// and never guess. See rules/DATA_FLOW/leads.md. Falls back to the local seed
// constant (lib/areas.ts) if the customer backend is unset or unreachable, so
// the building form always has options.

import { action } from "./_generated/server";
import { NAIROBI_AREAS, type Area } from "../lib/areas";

export const fetchShared = action({
  args: {},
  handler: async (): Promise<Area[]> => {
    const url = process.env.CUSTOMER_BACKEND_URL;
    if (!url) return NAIROBI_AREAS;
    try {
      const resp = await fetch(`${url}/api/areas`);
      if (!resp.ok) return NAIROBI_AREAS;
      const data = (await resp.json()) as unknown;
      if (
        Array.isArray(data) &&
        data.length > 0 &&
        data.every((a) => a && typeof a.key === "string" && typeof a.name === "string")
      ) {
        return data as Area[];
      }
      return NAIROBI_AREAS;
    } catch {
      return NAIROBI_AREAS;
    }
  },
});
