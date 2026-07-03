"use node";

import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { generateStructured } from "./lib/gateway";
import { cleanUnitNumber } from "./lib/importSchema";

// ---------------------------------------------------------------------------
// Roster inference (Phase 1). Landlords/PMs name units by a scheme — "A1..A6,
// G1..G6" (block + floor), "101..110" (floor + door), "Hse 1..Hse 20". Imports
// only give us the *occupied* units (one per tenant); to list vacant units by
// their real names we need the FULL roster. This Node action asks Claude (via
// the Vercel AI Gateway) to detect the scheme from the known occupied numbers +
// the building's total/mix and enumerate the complete set. It only PROPOSES —
// the PM confirms in the UI before `units.materialiseVacantRoster` writes.
// ---------------------------------------------------------------------------

const RosterSchema = z.object({
  scheme: z.string().nullish(), // human-readable description, for the UI
  // Prefix/block → unit-type mapping, when the scheme encodes type in the prefix
  // (e.g. A = bedsitter, B = 1br). Empty when the scheme doesn't encode type
  // (e.g. floor+door 101/201), in which case types are assigned mix-proportionally.
  typeMapping: z
    .array(z.object({ prefix: z.string(), unitType: z.string() }))
    .nullish(),
  units: z.array(
    z.object({
      unitNumber: z.string(),
      unitType: z.string().nullish(),
    }),
  ),
});

export const inferRoster = action({
  args: { buildingId: v.id("buildings") },
  handler: async (
    ctx,
    { buildingId },
  ): Promise<{
    scheme: string | null;
    typeMapping: Array<{ prefix: string; unitType: string }>;
    units: Array<{ unitNumber: string; unitType?: string; occupied: boolean }>;
  }> => {
    const ctxData = await ctx.runQuery(internal.units.rosterContext, { buildingId });
    if (!ctxData) throw new Error("Building not found");

    // Guard ownership through the same query the UI uses.
    const me = await ctx.runQuery(api.companies.me, {});
    if (me?.company?._id !== ctxData.companyId) throw new Error("Not your building");

    const occupied = ctxData.units.filter((u) => u.status === "occupied");
    const occupiedNumbers = new Set(
      occupied.map((u) => cleanUnitNumber(u.unitNumber).toLowerCase()),
    );
    const mixTotal = ctxData.unitMix.reduce((s, m) => s + (m.count || 0), 0);
    const target = ctxData.totalUnits ?? (mixTotal || undefined);

    const prompt =
      "You are helping a Kenyan property manager list vacant units.\n" +
      `Building: "${ctxData.name}".\n` +
      (target ? `Total units in this building: ${target}.\n` : "") +
      (ctxData.unitMix.length
        ? `Unit mix (type × count): ${ctxData.unitMix
            .map((m) => `${m.count}× ${m.type}`)
            .join(", ")}.\n`
        : "") +
      `Known OCCUPIED units (number → type where known): ${
        occupied
          .map((u) => (u.unitType ? `${u.unitNumber} (${u.unitType})` : u.unitNumber))
          .join(", ") || "(none provided)"
      }.\n\n` +
      "Detect the unit NAMING SCHEME from these examples (e.g. block+floor like " +
      "'A1..A6, G1..G6', floor+door like '101..110', or 'Hse 1..Hse 20') and " +
      "enumerate the COMPLETE roster of unit numbers for the whole building — " +
      "including the occupied ones and the missing (vacant) ones. Keep the exact " +
      "notation the manager uses.\n\n" +
      "TYPE ASSIGNMENT — follow this precisely:\n" +
      "1. Decide whether the unit-number PREFIX/BLOCK encodes the unit type. Use the " +
      "occupied examples as evidence: if occupied A-units are bedsitters and B-units " +
      "are 1br, generalise A=bedsitter, B=1br across ALL units. Return this as " +
      "`typeMapping` (one entry per prefix) and apply it to every enumerated unit.\n" +
      "2. Only map a prefix→type when the evidence supports it. If the scheme is " +
      "floor+door (e.g. 101, 201) that does NOT encode type, leave `typeMapping` " +
      "empty and instead assign types so the mix is satisfied.\n" +
      "3. Honour the mix EXACTLY: produce exactly the given count for EACH type " +
      "(e.g. 20 bedsitter, 20 1br, 20 2br) — never an arbitrary split of the total, " +
      "and never exceed the total unit count.\n\n" +
      "Also return a short 'scheme' description.";

    const result = await generateStructured(RosterSchema, prompt);

    // De-dup by cleaned number, flag which are already occupied.
    const out: Array<{ unitNumber: string; unitType?: string; occupied: boolean }> = [];
    const seen = new Set<string>();
    for (const u of result.units) {
      const clean = cleanUnitNumber(u.unitNumber);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      out.push({
        unitNumber: clean,
        unitType: u.unitType ?? undefined,
        occupied: occupiedNumbers.has(key),
      });
    }
    // Make sure every real occupied unit is present even if the model missed it.
    for (const u of occupied) {
      const clean = cleanUnitNumber(u.unitNumber);
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ unitNumber: clean, unitType: u.unitType ?? undefined, occupied: true });
    }

    return {
      scheme: result.scheme ?? null,
      typeMapping: (result.typeMapping ?? []).filter((m) => m.prefix && m.unitType),
      units: out,
    };
  },
});
