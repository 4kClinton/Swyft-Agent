# Swyft agent ui design

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/teamswyft254-8594s-projects/v0-v52-fork-of-swyft-agent-ui-design)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/4C2xw0v5Gwu)

## Overview

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/teamswyft254-8594s-projects/v0-v52-fork-of-swyft-agent-ui-design](https://vercel.com/teamswyft254-8594s-projects/v0-v52-fork-of-swyft-agent-ui-design)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/4C2xw0v5Gwu](https://v0.app/chat/projects/4C2xw0v5Gwu)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Backend environment variables (Convex)

These are read with `process.env` inside Convex functions. Set them per
deployment with `npx convex env set NAME value` (and `npx convex env list` to
audit). **Never** commit secrets or hardcode a provider's credentials in source —
the payment connectors are intentionally config-only so the Jenga merchant app
can be swapped (e.g. from the Munchez bootstrap to a Taleel-owned app) with **no
code change**.

### Equity Jenga

The Jenga IPN and the Jenga API are two **separate** credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `JENGA_IPN_USER` | Yes (prod) | Basic-Auth username Jenga sends on the `/jenga/ipn` callback. The IPN's *only* protection — endpoint fails closed if unset. |
| `JENGA_IPN_PASS` | Yes (prod) | Basic-Auth password for the IPN callback. Never logged. |
| `JENGA_VERIFYBACK_MIN_KES` | No (default `0`) | Amount floor (KES) above which an observed credit must pass verify-back before auto-reconciling. `0` ⇒ always verify. |
| `JENGA_API_BASE_URL` | For verify-back | Jenga API base URL (e.g. `https://api.finserve.africa`). |
| `JENGA_API_KEY` | For verify-back | Jenga API key (`Api-Key` header) — distinct from the IPN Basic Auth. |
| `JENGA_API_MERCHANT_CODE` | For verify-back | Merchant/account code used in the RSA request signature. |
| `JENGA_API_PRIVATE_KEY` | For verify-back | PEM RSA private key used to sign Jenga API requests. |

If the four `JENGA_API_*` vars are **not all set**, verify-back is treated as
unconfigured and qualifying Jenga credits are parked in `needs_review` instead of
being auto-reconciled — they are never silently trusted.

### Other payment connectors (set the Basic-Auth/secret to enforce auth)

| Variable | Purpose |
| --- | --- |
| `KCB_IPN_USER` / `KCB_IPN_PASS` | Basic Auth for the `/kcb/*` IPN routes (auth enforced only when both set). |
| `COOP_INS_USER` / `COOP_INS_PASS` | Credential for Co-op INS `/coop/ins` (`EndpointCredential` header). |
| `STANBIC_IPN_SECRET` | API key for `/stanbic/ins` (`X-IBM-Client-Id` header or `ApiKey` body field). |
| `SMS_FORWARD_TOKEN` | Shared secret for the `/sms/forward` payment-alert fallback. |
| `LIPANA_WEBHOOK_SECRET` | HMAC secret for the Lipana boost/subscription webhook (never rent). |
| `LIPANA_SECRET_KEY` | Lipana API key for initiating boost/subscription charges. |
| `SYNC_SHARED_SECRET` | HMAC secret for the swyft-customer `/api/sync/callback`. |

### Other services

| Variable | Purpose |
| --- | --- |
| `CONVEX_SITE_URL` / `CUSTOMER_BACKEND_URL` | This deployment's site URL / the swyft-customer backend base URL. |
| `AT_API_KEY` / `AT_USERNAME` / `AT_SENDER_ID` | Africa's Talking SMS credentials (receipts, notices). |
| `RESEND_API_KEY` / `RESEND_FROM` | Resend email credentials. |
| `OPENAI_API_KEY` | LLM features. |