/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as boosts from "../boosts.js";
import type * as buildings from "../buildings.js";
import type * as companies from "../companies.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as invoices from "../invoices.js";
import type * as leases from "../leases.js";
import type * as ledger from "../ledger.js";
import type * as lib_comms from "../lib/comms.js";
import type * as lib_logoData from "../lib/logoData.js";
import type * as lib_pdf from "../lib/pdf.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_rbac from "../lib/rbac.js";
import type * as lib_smsParse from "../lib/smsParse.js";
import type * as marketplace from "../marketplace.js";
import type * as migrations from "../migrations.js";
import type * as notices from "../notices.js";
import type * as paymentSources from "../paymentSources.js";
import type * as payments from "../payments.js";
import type * as receipts from "../receipts.js";
import type * as reconcile from "../reconcile.js";
import type * as smartImport from "../smartImport.js";
import type * as sms from "../sms.js";
import type * as statementImport from "../statementImport.js";
import type * as statements from "../statements.js";
import type * as tenants from "../tenants.js";
import type * as units from "../units.js";
import type * as waitlist from "../waitlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  auth: typeof auth;
  boosts: typeof boosts;
  buildings: typeof buildings;
  companies: typeof companies;
  crons: typeof crons;
  documents: typeof documents;
  http: typeof http;
  inquiries: typeof inquiries;
  invoices: typeof invoices;
  leases: typeof leases;
  ledger: typeof ledger;
  "lib/comms": typeof lib_comms;
  "lib/logoData": typeof lib_logoData;
  "lib/pdf": typeof lib_pdf;
  "lib/phone": typeof lib_phone;
  "lib/rbac": typeof lib_rbac;
  "lib/smsParse": typeof lib_smsParse;
  marketplace: typeof marketplace;
  migrations: typeof migrations;
  notices: typeof notices;
  paymentSources: typeof paymentSources;
  payments: typeof payments;
  receipts: typeof receipts;
  reconcile: typeof reconcile;
  smartImport: typeof smartImport;
  sms: typeof sms;
  statementImport: typeof statementImport;
  statements: typeof statements;
  tenants: typeof tenants;
  units: typeof units;
  waitlist: typeof waitlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
