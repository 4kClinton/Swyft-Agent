// Convex Auth issues its own JWTs; the issuer is this deployment's site URL.
// Without this file, ctx.auth.getUserIdentity() always returns null.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
