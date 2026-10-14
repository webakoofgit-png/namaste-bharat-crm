# Website login integration

This is the CRM-side adapter, not a completed connection to the website. The
website source, URL and authentication API are not available in this checkout.
Existing standalone login remains enabled until integration is configured.

## Enable after testing

Set frontend `VITE_WEBSITE_AUTH_ENABLED=true`, `VITE_FRONTEND_ONLY=false`, and
configure `VITE_API_URL` for a working backend. Set backend
`WEBSITE_AUTH_ENABLED=true`, `WEBSITE_LOGIN_URL`, `WEBSITE_CODE_EXCHANGE_URL`,
`WEBSITE_AUTH_CLIENT_ID` and a separate random `WEBSITE_AUTH_CLIENT_SECRET`.
Both URL settings must use HTTPS in production. Never put the client secret or
database credentials in frontend variables. Apply the additive MySQL migration
with `npm --prefix backend run db:migrate` before enabling.

The integrated login screen offers Super Admin login and a website sign-in
button for Vendors/Customers. Local public registration and Vendor/Customer
password login are rejected by the backend when enabled. Their password
recovery belongs to the website. Admin login and CRM permissions remain local;
website administrators are not automatically CRM administrators.

## Website implementation contract

1. Website's Open CRM button opens the CRM landing page. User chooses
   Continue with website. A future direct-start route may automate this step.
2. CRM browser posts `/api/auth/website-start` with its CRM Origin. Backend
   creates a five-minute HttpOnly state cookie and returns the configured
   website login URL with `state`, `clientId` and `redirectUri` parameters.
3. Website verifies its existing user session (or asks the user to log in).
   It validates the registered client and exact redirect URI, then generates
   an opaque cryptographically random code of at least 32 characters, expiring
   within 60 seconds. Bind it to user, client, state and redirect URI. Do not
   put passwords, JWTs or reusable session tokens in the redirect URL.
4. Website redirects to the registered CRM URI with `website_code` and
   `website_state`. CRM removes those parameters from browser history and posts
   them to `/api/auth/website-exchange`. State must match the browser cookie.
5. CRM backend posts `{code, clientId, state, redirectUri}` to the configured
   website exchange endpoint with `Authorization: Bearer <client secret>`.
   The website must authenticate the client and atomically consume the code,
   rejecting expired, reused or incorrectly bound codes. Return JSON:

```json
{"subject":"stable-website-user-id","role":"VENDOR","active":true}
```

Only `VENDOR` and `CUSTOMER` are accepted. Inactive users and unsupported roles
must be rejected by the website. Subject must be an immutable, case-normalized
identifier (not an email). No automatic email matching or user provisioning
occurs. CRM checks the linked account's role, active status and vendor approval,
then creates its own existing HttpOnly session and returns user plus CSRF token.

## Explicit account mapping

After verifying account ownership against website records, a CRM administrator
posts `/api/admin/users/:id/website-identity` with `{ "subject": "website-user-id" }`.
This needs an authenticated admin session, allowed Origin and CSRF token.
Only existing Vendors/Customers can be linked. Unique constraints reject
duplicate linking/reassignment. No existing customer, purchase or cashback data
is changed. Provision new profiles through existing admin tools until a reviewed
website provisioning API is implemented. In integrated mode, customer/vendor
detail dialogs include a linking form with an ownership verification checkbox.
Migration of real website accounts remains pending.

## Still required before full integration

- Website exchange endpoint and shared login testing on actual domains.
- Account mapping/migration and automatic new-user provisioning.
- Agreement on profile and approval ownership plus synchronization APIs.
  CRM currently remains authoritative for its active status/vendor approval;
  website suspension prevents new handoffs, but does not revoke existing CRM
  sessions. Do not claim automatic synchronization.
- Global logout, website reset/suspension session revocation and shared admin
  permissions are not implemented by this adapter. CRM logout currently revokes
  CRM sessions only. Build authenticated revocation endpoints before claiming
  single logout or immediate website-side suspension enforcement.
- Use same-origin `/api` routing or test cookie behaviour for the actual domains.
  Cross-site Vercel-to-Hostinger cookies do not work with the existing SameSite
  Lax policy. Prefer a CRM subdomain on the website domain with same-origin API
  routing. Do not enable broad credentialed CORS to work around this.
- Online API/MySQL hosting, durable upload storage, deployment and acceptance.
