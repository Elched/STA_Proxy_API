Solution Overview
To address the Thales SafeNet Trusted Access (STA) authorization vulnerability—where any holder of the tenant API key becomes a de-facto tenant administrator with unrestricted access to users, applications, tokens, and access policies—we have implemented a Zero-Trust Granular RBAC API Proxy and Audit Gateway.
The solution shields the upstream Thales STA master key on the proxy server, authenticates callers via OpenID Connect (OIDC) or Service Account API Keys, validates granular endpoint-level permissions, and outputs structured security audit logs for SIEM ingestion.
Key Capabilities
Granular RBAC Authorization Engine
Eliminates all-or-nothing access by mapping every Thales STA REST endpoint (/api/v1/users, /api/v1/users/{id}/unlock, /api/v1/users/{id}/tokens, /api/v1/policies, /api/v1/applications, etc.) to discrete granular permissions (e.g., sta:users:unlock, sta:tokens:assign, sta:policies:delete).
Pre-configured least-privilege roles include:
Helpdesk Tier 1: Search users, unlock accounts, assign MFA tokens. Blocked from deleting users, viewing policy secrets, or touching SSO apps.
HR Onboarding Sync: Provision and update users. Blocked from unlocking accounts or managing tokens.
DevOps App Integrator: Register and update SSO applications. Zero access to user identities or policies.
Security Auditor: Read-only access to audit logs and policies.
Machine-to-Machine (M2M) & OIDC Authentication
Service Accounts: External programs (ServiceNow bots, Workday HR sync, Splunk SIEM, CI/CD runners) connect via X-API-Key or Authorization: Bearer <sa_key>.
OpenID Connect (OIDC): Validates incoming corporate IdP JWT Bearer tokens (Okta, Keycloak, Ping, Microsoft Entra ID), extracts role claims, and enforces policy boundaries.
Structured Security Audit Logging
Logs every inbound request with microsecond precision and correlation trace IDs:
timestamp (ISO-8601 UTC)
userId (service account or OIDC user identity)
action requested (e.g. users.unlock, policies.delete, tokens.assign)
authSuccess & authFailureReason (e.g. missing credentials, invalid signature)
actionStatus & rejectionReason:
Improper Rights: "improper rights: caller role 'helpdesk-operator' lacks required permission 'sta:policies:delete'"
Upstream Identity Provider Failure: "the action has failed on the identity provider side: STA returned HTTP 409 Conflict: User with email already exists"
upstreamStatusCode (e.g., 200, 401, 404, 409, 503)
latencyMs, clientIp, userAgent
Real-time search, filtering, and one-click export to JSON, CSV, and RFC-5424 Syslog (Splunk/Datadog ready).
TLS 1.3 Encryption & Security Hardening
Enforces encrypted data transmission in transit over TLS 1.3.
Master Thales STA API Key is stored exclusively within the proxy environment (or injected from HashiCorp Vault / Cloud Secret Manager), preventing downstream service accounts from ever seeing tenant administrator secrets.
Interactive Web Management Studio
The applet provides a complete, live operational console:
Gateway & Sandbox Tester: Test requests as different service account personas or OIDC users, execute real operations, and inspect the real-time 5-stage policy pipeline trace.
Security Audit Logs Explorer: Searchable, filterable audit log grid with click-to-inspect drawers and CSV/JSON/Syslog download.
RBAC Policy Matrix: Visual endpoint-to-scope catalog, custom role creator, and instant policy verdict simulator.
Service Accounts & OIDC: Issue scoped service account keys, test OIDC token generator, and copy ready-to-run microservice integration snippets (Python, Go, Node.js, cURL).
Upstream Thales STA Connector: Switch between the safe sandbox mock tenant and live Thales STA tenant (https://api.safenetid.com), with failure injection controls (simulate STA 503 maintenance, 429 rate limit, 500 timeout).
Code Export & Deploy: Complete, downloadable standalone production source files for Python (FastAPI + Pydantic + PyJWT + HTTPX) and Go (Go 1.22 compiled single binary), with Dockerfiles, docker-compose.yml, and reverse proxy TLS guides.
