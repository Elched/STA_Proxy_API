# Thales SafeNet Trusted Access (STA) Granular API Proxy

> **Zero-Trust Granular RBAC and Security Audit Gateway for Thales SafeNet Trusted Access (STA) REST APIs**

---

## 1. Executive Summary & Problem Solved

### The Vulnerability in Standard Thales STA API Access
In **Thales SafeNet Trusted Access (STA)**, API keys generated under the management console (*Setup > API Keys*) inherently possess **tenant-wide administrator privileges**. SafeNet Trusted Access does not provide built-in granular authorization scopes for its REST APIs:

- A ServiceNow ticketing bot needing to unlock a single user account is given an API key that can delete access policies, tamper with SAML/OIDC SSO applications, or purge all users.
- An HR onboarding sync (e.g. Workday/BambooHR) needing only to provision users possesses the capability to alter privileged multi-factor authentication rules.
- A compromise of any client API key compromises the entire identity provider tenant.

### The Solution: Granular RBAC API Proxy
This project provides a standalone, production-ready **Zero-Trust API Gateway and Reverse Proxy** that acts as a secure intermediary between external callers and the Thales STA API:

1. **Protects the Master STA API Key**: The master Thales key is kept strictly isolated on the proxy server (or injected via HashiCorp Vault / Secret Manager). Downstream callers never receive or see it.
2. **Granular Role-Based Access Control (RBAC)**: Enforces fine-grained permissions per endpoint (e.g. `sta:users:unlock`, `sta:tokens:assign`, `sta:policies:delete`), restricting service accounts and users to their exact operational scope.
3. **Dual Authentication**:
   - **Service Account API Keys**: Unique, revokable tokens (`X-API-Key`) for background applications and bots.
   - **OpenID Connect (OIDC)**: Validates signed JWT Bearer tokens from your enterprise IdP (Okta, Keycloak, Ping, Microsoft Entra ID).
4. **Structured Security Audit Logs**: Captures every inbound request with ISO timestamps, correlation trace IDs, caller identities, requested actions, authentication outcomes, and detailed failure rationale (e.g. `"improper rights: caller lacks required permission"` or `"the action has failed on the identity provider side: STA returned HTTP 409 Conflict"`). Exportable to JSON, CSV, and RFC-5424 Syslog.
5. **Dynamic OpenAPI / Swagger Specification**: Live OpenAPI 3.0.3 spec that dynamically updates based on your active RBAC configuration, filterable by role.

---

## 2. Architecture Overview

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │           Thales STA Granular API Proxy                │
┌───────────────────────────┐     │                                                        │     ┌────────────────────────┐
│ External Callers & Bots   │     │  1. Inbound Authentication                             │     │ Upstream Thales STA    │
│                           │     │     • Validate X-API-Key (Service Account)             │     │ (api.safenetid.com)    │
│ • ServiceNow ITSM Bot     ├────►│     • Or Verify OIDC JWT Bearer Signature              │     │                        │
│ • Workday HR Sync         │TLS  │                                                        │     │ • Tenant Admin Master  │
│ • Splunk SIEM Ingestion   │1.3  │  2. Granular RBAC Enforcement                          │TLS  │   API Key Injected     │
│ • DevOps CI/CD App Deploy │     │     • Evaluate Method + Path against Rule Catalog      │1.3  │ • Strips Caller Token  │
│ • Human Helpdesk Analysts │     │     • If unauthorized: return 403 "IMPROPER_RIGHTS"    ├────►│                        │
└───────────────────────────┘     │                                                        │     │ • Users & Tokens       │
                                  │  3. Upstream Dispatch & Execution                      │     │ • SSO Applications     │
                                  │     • Forward over TLS with Master STA Key             │     │ • Conditional Policies │
                                  │                                                        │     └───────────┬────────────┘
                                  │  4. Structured Security Audit Trail                    │                 │
                                  │     • Log timestamp, userID, action, auth & result     │◄────────────────┘
                                  │     • Export to SIEM (JSON, CSV, RFC-5424 Syslog)      │   Upstream Response
                                  └────────────────────────────────────────────────────────┘
```

---

## 3. Installation & Deployment Options

This application is delivered with **two primary installation options**:
- **Option 1: Dockerized Container (Recommended for Production)**
- **Option 2: Native Bare-Metal (Node.js & TypeScript)**

*(Additionally, standalone Python FastAPI and Go packages are available via the built-in Code Export view).*

---

### Option 1: Dockerized Installation (Alternative Containerized Version)

The repository includes a production-grade, multi-stage `Dockerfile` (using Node 22 Alpine, unprivileged non-root user `node`, built-in container healthcheck) and a `docker-compose.yml` file.

#### Step 1: Clone and Configure Environment
```bash
git clone <repository_url> sta-api-proxy
cd sta-api-proxy

# Copy and review configuration
cp .env.example .env
```

Edit `.env` (or set directly in `docker-compose.yml`):
```env
PORT=3000
NODE_ENV=production

# Upstream Thales SafeNet Trusted Access configuration
STA_BASE_URL=https://api.safenetid.com
STA_TENANT_ID=YOUR_STA_TENANT_CODE
STA_MASTER_API_KEY=YOUR_STA_MASTER_SECRET_KEY

# OpenID Connect Configuration
OIDC_ISSUER=https://auth.yourcompany.com/oauth2/v1
OIDC_AUDIENCE=https://api-proxy.yourcompany.com/sta
```

#### Step 2: Build and Run with Docker Compose
```bash
# Build container image and start in background
docker compose up --build -d

# Check running status and healthcheck
docker compose ps

# View real-time container logs
docker compose logs -f
```

The proxy gateway and web control studio will be running at **`http://localhost:3000`** (or your mapped host port).

#### Step 3: Run as a Standalone Docker Container (Without Compose)
```bash
# Build the Docker image
docker build -t thales-sta-proxy:latest .

# Run the container
docker run -d \
  --name thales-sta-proxy \
  -p 3000:3000 \
  -e STA_BASE_URL="https://api.safenetid.com" \
  -e STA_TENANT_ID="STA-ENTERPRISE-TENANT-EU" \
  -e STA_MASTER_API_KEY="your_sta_master_secret" \
  --restart unless-stopped \
  thales-sta-proxy:latest
```

#### Optional: Run with Nginx TLS 1.3 Termination in Docker Compose
To terminate TLS with SSL certificates and enforce HTTPS on port 443/8443:
1. Place your `fullchain.pem` and `privkey.pem` in `./certs/`.
2. Uncomment the `nginx-tls-proxy` service in `docker-compose.yml`.
3. Copy `nginx.conf.example` to `nginx.conf`:
   ```bash
   cp nginx.conf.example nginx.conf
   docker compose up -d
   ```

---

### Option 2: Native Bare-Metal Installation (Node.js & TypeScript)

If running directly on a Linux/macOS/Windows virtual machine or host without Docker:

#### Prerequisites
- **Node.js**: Version 20.x or 22.x LTS
- **npm**: Version 9.x or later

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Build the Application
```bash
npm run build
```

#### Step 3: Start the Production Server
```bash
npm start
```

For local development with live reloading:
```bash
npm run dev
```

The gateway listens by default on `http://0.0.0.0:3000`.

---

## 4. Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Local HTTP/HTTPS port for the proxy gateway |
| `NODE_ENV` | `production` | Environment mode (`production` or `development`) |
| `STA_BASE_URL` | `https://api.safenetid.com` | Upstream Thales SafeNet Trusted Access REST API URL |
| `STA_TENANT_ID` | `STA-DEMO-TENANT-EU` | SafeNet Trusted Access tenant identifier |
| `STA_MASTER_API_KEY` | *(sensitive secret)* | Master Thales STA key injected into authorized upstream calls |
| `OIDC_ISSUER` | `https://auth.enterprise-corp.com` | Expected OIDC token issuer (`iss` claim) |
| `OIDC_AUDIENCE` | `https://api-proxy.enterprise-corp.com` | Expected OIDC token audience (`aud` claim) |
| `OIDC_ROLE_CLAIM` | `roles` | JWT claim path for roles (`roles`, `groups`, or `realm_access.roles`) |

---

## 5. Granular RBAC Permissions Catalog

The proxy evaluates every inbound HTTP request against this granular catalog. Unmapped or unauthorized requests are rejected at the proxy boundary before reaching Thales STA:

| HTTP Method | Thales STA Endpoint | Granular Permission Scope | Permitted Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | `sta:users:read` | Helpdesk, HR Sync, Auditor, Super Admin |
| `GET` | `/api/v1/users/:userId` | `sta:users:read` | Helpdesk, HR Sync, Auditor, Super Admin |
| `POST` | `/api/v1/users` | `sta:users:create` | HR Sync, Super Admin |
| `PUT` | `/api/v1/users/:userId` | `sta:users:update` | HR Sync, Super Admin |
| `DELETE` | `/api/v1/users/:userId` | `sta:users:delete` | Super Admin only |
| `POST` | `/api/v1/users/:userId/unlock` | `sta:users:unlock` | Helpdesk Tier 1, Super Admin |
| `POST` | `/api/v1/users/:userId/reset-password` | `sta:users:reset-password` | Helpdesk Tier 1, User Self-Service |
| `GET` | `/api/v1/users/:userId/tokens` | `sta:tokens:read` | Helpdesk Tier 1, Super Admin |
| `POST` | `/api/v1/users/:userId/tokens` | `sta:tokens:assign` | Helpdesk Tier 1, Super Admin |
| `DELETE` | `/api/v1/users/:userId/tokens/:id` | `sta:tokens:revoke` | Helpdesk Tier 1, Super Admin |
| `GET` | `/api/v1/applications` | `sta:applications:read` | App Integrator, Auditor, Super Admin |
| `POST` | `/api/v1/applications` | `sta:applications:create` | App Integrator, Super Admin |
| `DELETE` | `/api/v1/applications/:appId` | `sta:applications:delete` | App Integrator, Super Admin |
| `GET` | `/api/v1/policies` | `sta:policies:read` | Auditor, Super Admin |
| `POST` | `/api/v1/policies` | `sta:policies:create` | Super Admin only |
| `DELETE` | `/api/v1/policies/:policyId` | `sta:policies:delete` | Super Admin only |
| `GET` | `/api/v1/logs` | `sta:audit:read` | Security Auditor, Super Admin |

---

## 6. How Service Accounts Call the Proxy (M2M Integration)

External programs contact the proxy on `/proxy/api/v1/*` passing their assigned Service Account Key in the `X-API-Key` or `Authorization: Bearer` header.

### cURL Example: Helpdesk Bot Unlocking an Account
```bash
curl -X POST "http://localhost:3000/proxy/api/v1/users/usr_4821/unlock" \
  -H "X-API-Key: sta_proxy_sk_helpdesk_7a9c2b81" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: itsm-ticket-inc-99410" \
  -d '{"reason": "Identity verified via telephone challenge"}'
```

**Response (HTTP 200 OK):**
```json
{
  "status": "SUCCESS",
  "message": "User account 'marcus.vance' (usr_4821) has been unlocked. Lockout counters cleared.",
  "user": {
    "id": "usr_4821",
    "username": "marcus.vance",
    "status": "ACTIVE"
  }
}
```

---

### Demonstrating Granular RBAC Protection: Blocked Policy Deletion
If the Helpdesk Bot attempts to delete a sensitive MFA policy:
```bash
curl -X DELETE "http://localhost:3000/proxy/api/v1/policies/pol_mfa_all_cloud" \
  -H "X-API-Key: sta_proxy_sk_helpdesk_7a9c2b81"
```

**Response (HTTP 403 Forbidden - Denied before touching Thales STA):**
```json
{
  "error": "Forbidden",
  "code": "IMPROPER_RIGHTS",
  "correlationId": "req_448097e2-d7d3-483e",
  "message": "Access denied: caller does not possess the granular permissions required for this SafeNet Trusted Access endpoint.",
  "details": {
    "callerId": "sa_servicenow_helpdesk",
    "callerRoles": ["helpdesk-operator"],
    "requiredPermission": "sta:policies:delete",
    "reason": "improper rights: caller has role(s) [helpdesk-operator] which lacks required permission 'sta:policies:delete' for Delete Policy"
  }
}
```

---

### Python Service Account Example (`httpx`)
```python
import httpx

PROXY_URL = "http://localhost:3000/proxy/api/v1/users/usr_4821/unlock"
API_KEY = "sta_proxy_sk_helpdesk_7a9c2b81"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
    "X-Correlation-ID": "incident-req-4820"
}

payload = {"reason": "Automated ticket resolution"}

with httpx.Client(verify=True) as client:
    response = client.post(PROXY_URL, headers=headers, json=payload)
    print(f"Status: {response.status_code}")
    print(response.json())
```

---

## 7. Structured Security Audit Logs

Every single inbound API call generates a structured audit log entry adhering to the following schema:

```json
{
  "id": "e3269471-823d-4872-9440-d16afdecef79",
  "timestamp": "2026-10-31T09:31:10.800Z",
  "correlationId": "req_0297c51e-1eb9-42bc-88b3-4b0da8cd4727",
  "userId": "sa_workday_hr",
  "clientName": "Workday HR Lifecycle Sync",
  "authType": "SERVICE_ACCOUNT",
  "authSuccess": true,
  "authFailureReason": null,
  "action": "create.user",
  "actionCategory": "Users",
  "httpMethod": "POST",
  "endpoint": "/api/v1/users",
  "actionStatus": "UPSTREAM_FAILED",
  "rejectionReason": "the action has failed on the identity provider side: STA returned HTTP 409 (STA-409-USER-EXISTS): User with email 'marcus.vance@enterprise.corp' already exists in SafeNet Trusted Access.",
  "upstreamStatusCode": 409,
  "latencyMs": 59,
  "clientIp": "192.168.10.12",
  "userAgent": "Workday-Integration/3.0",
  "requestPayloadSummary": "{\"email\":\"marcus.vance@enterprise.corp\",\"firstName\":\"Marcus\"}",
  "responseSummary": "{\"error\":\"Conflict\",\"errorCode\":\"STA-409-USER-EXISTS\"}"
}
```

### Log Export Endpoints
- **JSON**: `GET /api/audit-logs/export?format=json`
- **CSV**: `GET /api/audit-logs/export?format=csv`
- **RFC-5424 Syslog**: `GET /api/audit-logs/export?format=syslog` (SIEM/Splunk forwarder ready)

---

## 8. Dynamic OpenAPI / Swagger Specification

Fetch or integrate the live OpenAPI documentation directly:
- **OpenAPI JSON**: `GET /api/openapi.json`
- **OpenAPI YAML**: `GET /api/openapi.yaml`
- **Role-Filtered Spec**: `GET /api/openapi.json?role=helpdesk-operator`

---

## 9. Security Hardening Checklist for Production

1. **Enforce TLS 1.3**: Always terminate TLS at an edge reverse proxy (e.g., Nginx, Traefik, AWS ALB) or pass SSL certificates directly into the container.
2. **Key Isolation**: Never hardcode `STA_MASTER_API_KEY`. In Kubernetes or Docker Swarm, mount it via Secrets or retrieve it dynamically at container startup from HashiCorp Vault.
3. **Mutual TLS (mTLS)**: For high-security machine-to-machine integrations (e.g., banking/defense), configure Nginx with `ssl_verify_client on;` to validate client certificates.
4. **Log Forwarding**: Point your SIEM agent (Splunk Universal Forwarder, Datadog Agent, FluentBit) to `/api/audit-logs/export?format=syslog` or capture stdout docker logs with `json-file` driver.

---

## 10. License & Support

- **License**: Apache 2.0
- **Documentation**: [Thales SafeNet Trusted Access API Documentation](https://thalesdocs.com/sta/api/)
