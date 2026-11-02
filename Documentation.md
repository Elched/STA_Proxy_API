# Thales SafeNet Trusted Access (STA) Granular API Proxy
## Comprehensive Technical Architecture, Operations & Maintenance Manual

> **NOTE**: This project has been coded with AI as a proof of concept. Do NOT use in production as is. No security review or formal validation has been performed on the code. Functionality is not guaranteed. Do not expose the application over the internet without enterprise review, hardening, and penetration testing.
> 
> **Document Status**: Engineering Proof-of-Concept & Architectural Blueprint  
> **Target Audience**: Security Architects, DevOps/SRE Engineers, SecOps Analysts, and Enterprise Integration Developers.  
> **Related Documents**: [`README.md`](./README.md) (Quickstart & high-level overview).

---

## Table of Contents
1. [System Architecture & Runtime Internals](#1-system-architecture--runtime-internals)
   - [Problem Statement & Threat Model](#problem-statement--threat-model)
   - [Zero-Trust Reverse-Proxy Pattern](#zero-trust-reverse-proxy-pattern)
   - [Detailed Request Pipeline](#detailed-request-pipeline)
   - [Cryptographic Verification & Timing-Attack Mitigation](#cryptographic-verification--timing-attack-mitigation)
2. [Deployment & Setup Guide](#2-deployment--setup-guide)
   - [Prerequisites & System Requirements](#prerequisites--system-requirements)
   - [Option A: Docker Compose Production Deployment (Recommended)](#option-a-docker-compose-production-deployment-recommended)
   - [Option B: Bare-Metal Node.js 22 LTS with Systemd](#option-b-bare-metal-nodejs-22-lts-with-systemd)
   - [Option C: Standalone Python (FastAPI) Alternative](#option-c-standalone-python-fastapi-alternative)
   - [Option D: High-Performance Go Binary Alternative](#option-d-high-performance-go-binary-alternative)
   - [TLS 1.3 Termination & Reverse-Proxy Hardening](#tls-13-termination--reverse-proxy-hardening)
3. [Configuration & Secrets Management](#3-configuration--secrets-management)
   - [Environment Variables Specification](#environment-variables-specification)
   - [Master Credential Isolation](#master-credential-isolation)
   - [OpenID Connect (OIDC) IdP Integration (Entra ID, Okta, Keycloak)](#openid-connect-oidc-idp-integration)
   - [Enterprise Secret Store Integration (Vault / AWS SM)](#enterprise-secret-store-integration)
4. [Granular RBAC & Policy Modeling](#4-granular-rbac--policy-modeling)
   - [STA Endpoint Catalog & Permission Matrix](#sta-endpoint-catalog--permission-matrix)
   - [Role Definitions & Custom Least-Privilege Archetypes](#role-definitions--custom-least-privilege-archetypes)
   - [Service Account Lifecycle Management](#service-account-lifecycle-management)
   - [Dynamic Role-Filtered OpenAPI / Swagger Generation](#dynamic-role-filtered-openapi--swagger-generation)
5. [Audit Logging & SIEM Real-Time Telemetry](#5-audit-logging--siem-real-time-telemetry)
   - [Structured Audit Schema (Dual-Verdict Model)](#structured-audit-schema-dual-verdict-model)
   - [Failure Reason Taxonomy](#failure-reason-taxonomy)
   - [Syslog RFC-5424 over TLS Dispatcher](#syslog-rfc-5424-over-tls-dispatcher)
   - [Splunk HEC & Datadog Webhook Forwarders](#splunk-hec--datadog-webhook-forwarders)
   - [CEF (Common Event Format) Mapping](#cef-common-event-format-mapping)
6. [Operations, Monitoring & Maintenance Runbook](#6-operations-monitoring--maintenance-runbook)
   - [Healthchecks & Liveness Probes](#healthchecks--liveness-probes)
   - [Sliding Window Rate Limiting & DoS Protection](#sliding-window-rate-limiting--dos-protection)
   - [Emergency Key Revocation Procedure](#emergency-key-revocation-procedure)
   - [Diagnostic Triage Flowcharts](#diagnostic-triage-flowcharts)
7. [Upgrade Procedures & Compatibility Roadmap](#7-upgrade-procedures--compatibility-roadmap)
   - [Zero-Downtime Rolling Update Procedure](#zero-downtime-rolling-update-procedure)
   - [Upstream Thales STA API Schema Evolution](#upstream-thales-sta-api-schema-evolution)
   - [Node.js & Dependency Maintenance Cadence](#nodejs--dependency-maintenance-cadence)
   - [Emergency Rollback Runbook](#emergency-rollback-runbook)
8. [Enterprise Integration Examples & Good Practice Documentation](#8-enterprise-integration-examples--good-practice-documentation)
   - [Pattern 1: ServiceNow Helpdesk Self-Service User Unlock Bot](#pattern-1-servicenow-helpdesk-self-service-user-unlock-bot)
   - [Pattern 2: Workday HR SCIM Employee Sync](#pattern-2-workday-hr-scim-employee-sync)
   - [Pattern 3: Splunk SIEM Detection Rule (Privilege Escalation Attempt)](#pattern-3-splunk-siem-detection-rule)
   - [Production Readiness Checklist](#production-readiness-checklist)

---

## 1. System Architecture & Runtime Internals

### Problem Statement & Threat Model
The native Thales SafeNet Trusted Access (STA) Management API issues high-privilege administrative API keys. A client (whether an automated CI/CD pipeline, ticketing integration, or monitoring sensor) provided with native credentials can execute destructive operations (e.g., dropping directory synchronization policies, modifying application access rules, de-enrolling MFA tokens, or exfiltrating user identities).

```
[ UNSECURE DIRECT ACCESS ]
Third-Party App ------(Root Master API Key)------> Thales STA Management API
                       * Blast radius: 100% (Full Admin rights to all tenants/policies)

[ SECURE GRANULAR PROXY PATTERN ]
Third-Party App ---(Scoped Proxy Bearer Token)---> [ STA API Proxy ] ---(Master Key)---> Thales STA API
                                                     |  1. SHA-256 Auth Check
                                                     |  2. Granular RBAC Filter
                                                     |  3. Sliding Rate Limiter
                                                     |  4. SIEM Audit Stream (TLS)
```

### Zero-Trust Reverse-Proxy Pattern
The **Thales STA Granular API Proxy** operates as an inline policy enforcement point (PEP) that:
1. **Quarantines the Master STA Credentials**: The upstream Thales API credentials (`API-Key` / `Authorization`) exist solely within the proxy's isolated memory space and are never exposed to consumers.
2. **Issues Scoped Tokens**: Clients authenticate using unique Service Account tokens (`sta_sa_...`) or OpenID Connect (OIDC) identity tokens tied to predefined granular roles.
3. **Enforces Path + Method Evaluation**: Every inbound request is matched against an explicit permission catalog before traffic is relayed upstream.
4. **Guarantees Dual-Verdict Non-Repudiation**: Every attempt produces an audit record documenting both the *Authentication Verdict* and the *Authorization Verdict*, alongside upstream execution outcomes.

### Detailed Request Pipeline

```
Inbound HTTP/2 or HTTP/1.1 Request (TLS 1.3)
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Security Headers & TLS Inspection                            │
│    - Strips 'X-Powered-By'                                      │
│    - Enforces HSTS, nosniff, frame-ancestors 'none'             │
│    - Drops unencrypted traffic (in production reverse-proxy)    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Sliding Window Rate Limiting                                 │
│    - Evaluates IP and Client ID against rate thresholds         │
│    - Headers: RateLimit-Limit, Remaining, Reset (IETF draft)   │
│    - 429 Too Many Requests on threshold exhaustion             │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Authentication Verification                                  │
│    - Service Account: Timing-safe SHA-256 secret verification   │
│    - OIDC / JWT: Signature check via Remote JWKS, aud/iss val   │
│    - IP Whitelist verification (CIDR / Single IP match)         │
│    - Revocation status & expiration date check                  │
│    - [FAILURE]: Audit event emitted (AUTH_FAILED) -> 401 HTTP   │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Granular RBAC Evaluation                                     │
│    - Endpoint Resolver: Path + HTTP Method normalization        │
│    - Permission Catalog Lookup (e.g., users:write, tokens:read) │
│    - Service Account Role & Explicit Deny Verification          │
│    - [FAILURE]: Audit event emitted (IMPROPER_RIGHTS) -> 403    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Upstream Injection & Header Sanitization                     │
│    - Removes client's Bearer token from headers                 │
│    - Injects Master Thales STA API Key: Authorization: Bearer X │
│    - Target URI rewritten to: https://{region}.safenetid.com/api│
│    - Upstream timeout set to 15,000ms with circuit guard        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Response Relay & Telemetry Dispatch                          │
│    - Strips internal upstream headers                           │
│    - Structured Audit Log entry committed to buffer            │
│    - Background async SIEM dispatch (Syslog TLS / HEC / Webhook)│
│    - Relays HTTP status & payload to caller                     │
└─────────────────────────────────────────────────────────────────┘
```

### Cryptographic Verification & Timing-Attack Mitigation
To eliminate side-channel timing attacks when verifying high-entropy service account tokens, the proxy avoids standard string comparison (`===`). 

Strings of unequal length immediately return in different clock cycles under standard JavaScript or C comparisons. The proxy executes a two-stage length-independent hashing strategy:
```typescript
function timingSafeMatch(a: string, b: string): boolean {
  // Pre-hash both inputs to 256-bit fixed-length buffers using SHA-256
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  
  // Constant-time buffer comparison guaranteed by OpenSSL crypto engine
  return crypto.timingSafeEqual(hashA, hashB);
}
```
This guarantees identical CPU cycles regardless of match length, prefix match, or string size.

---

## 2. Deployment & Setup Guide

### Prerequisites & System Requirements
- **Hardware Minimum**: 1 vCPU, 1 GB RAM, 10 GB SSD.
- **Hardware Recommended**: 2 vCPU, 4 GB RAM, 25 GB SSD (for high-volume SIEM buffers).
- **Operating System**: Linux (Alpine 3.20+, Ubuntu 22.04 LTS+, RHEL 9+, Debian 12+).
- **Runtimes**:
  - Node.js 22.x LTS (`node -v` >= 22.0.0) & npm 10+.
  - Docker Engine 26.0+ & Docker Compose v2.27+.
  - (Optional for exports): Python 3.12+ / Go 1.22+.

---

### Option A: Docker Compose Production Deployment (Recommended)

The Docker setup encapsulates the proxy runtime alongside an Nginx edge proxy enforcing TLS 1.3 and security headers.

#### 1. Repository Structure
```
deploy/
├── docker/
│   ├── Dockerfile              # Multi-stage hardened alpine build (unprivileged user)
│   ├── docker-compose.yml      # Compose Spec v2 definition
│   └── nginx.conf              # Production TLS 1.3 and HTTP/2 proxy configuration
├── certs/
│   ├── proxy.crt               # Public certificate (or Let's Encrypt / Enterprise PKI)
│   └── proxy.key               # Private key (mode 0600)
└── .env                        # Environment variables file
```

#### 2. Create the Production Environment File (`.env`)
```bash
# Core Proxy Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Master Thales STA Upstream Credentials
STA_BASE_URL=https://api.us.safenetid.com/api/v1
STA_API_KEY=sta_prod_sec_994a3bc7602e1a90c4d8fe2219803
STA_TENANT_ID=tenant_enterprise_production_01

# Operational Security
PROXY_RATE_LIMIT=300
PROXY_RATE_WINDOW_MS=60000

# SIEM Forwarder Configuration
SIEM_ENABLED=true
SIEM_TYPE=syslog
SIEM_HOST=siem.corp.internal
SIEM_PORT=6514
SIEM_PROTOCOL=tls
SIEM_FACILITY=local0
SIEM_TLS_VERIFY=true
```

#### 3. Compose Specification (`docker-compose.yml`)
```yaml
services:
  sta-proxy:
    build:
      context: ../../
      dockerfile: deploy/docker/Dockerfile
    container_name: thales-sta-proxy
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    environment:
      - NODE_ENV=production
      - PORT=3000
      - STA_BASE_URL=${STA_BASE_URL}
      - STA_API_KEY=${STA_API_KEY}
      - STA_TENANT_ID=${STA_TENANT_ID}
      - SIEM_ENABLED=${SIEM_ENABLED}
      - SIEM_TYPE=${SIEM_TYPE}
      - SIEM_HOST=${SIEM_HOST}
      - SIEM_PORT=${SIEM_PORT}
      - SIEM_PROTOCOL=${SIEM_PROTOCOL}
      - SIEM_TLS_VERIFY=${SIEM_TLS_VERIFY}
    expose:
      - "3000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 5s
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  nginx:
    image: nginx:1.27-alpine
    container_name: thales-sta-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ../certs:/etc/nginx/certs:ro
    depends_on:
      sta-proxy:
        condition: service_healthy
```

#### 4. Launching the Stack
```bash
# Navigate to compose directory
cd deploy/docker

# Validate syntax
docker compose config

# Pull, build and run in detached mode
docker compose up -d --build

# Verify running health state
docker compose ps
```

---

### Option B: Bare-Metal Node.js 22 LTS with Systemd

For enterprise environments running directly on RHEL, Rocky Linux, or Ubuntu Server.

#### 1. System Account Provisioning
```bash
sudo useradd -r -s /bin/false -d /opt/sta-proxy -m sta-proxy
```

#### 2. Application Installation
```bash
sudo mkdir -p /opt/sta-proxy
sudo cp -r . /opt/sta-proxy/
cd /opt/sta-proxy
sudo npm ci --omit=dev
sudo chown -R sta-proxy:sta-proxy /opt/sta-proxy
```

#### 3. Systemd Service Unit (`/etc/systemd/system/sta-proxy.service`)
```ini
[Unit]
Description=Thales STA Granular API Proxy
After=network.target remote-fs.target
Documentation=https://thalesdocs.com/sta/api/

[Service]
Type=simple
User=sta-proxy
Group=sta-proxy
WorkingDirectory=/opt/sta-proxy
EnvironmentFile=/etc/sta-proxy/proxy.env
ExecStart=/usr/bin/node server.ts
Restart=always
RestartSec=5s

# Security Hardening Directives
ProtectSystem=strict
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictRealtime=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

#### 4. Activation
```bash
sudo mkdir -p /etc/sta-proxy
sudo cp .env.example /etc/sta-proxy/proxy.env
sudo chmod 0600 /etc/sta-proxy/proxy.env
sudo systemctl daemon-reload
sudo systemctl enable --now sta-proxy
sudo systemctl status sta-proxy
```

---

### Option C: Standalone Python (FastAPI) Alternative

If organizational policy mandates Python runtimes, generate the self-contained FastAPI package via the UI or export endpoint:

1. In the Web UI, open the **Code Generator** tab and select **Python (FastAPI)**, or issue:
   ```bash
   curl -s http://localhost:3000/api/export/python -o sta-proxy-python.tar.gz
   tar -xzf sta-proxy-python.tar.gz
   cd sta-proxy-python
   ```
2. Create and activate a clean Python 3.12 virtual environment:
   ```bash
   python3.12 -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
3. Run using high-performance Uvicorn:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers
   ```

---

### Option D: High-Performance Go Binary Alternative

For microsecond-level latency and zero external dependency runtimes:

1. Export the Go project:
   ```bash
   curl -s http://localhost:3000/api/export/go -o sta-proxy-go.tar.gz
   tar -xzf sta-proxy-go.tar.gz
   cd sta-proxy-go
   ```
2. Compile a statically linked binary:
   ```bash
   CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /usr/local/bin/sta-proxy main.go
   ```
3. Run the single binary:
   ```bash
   export STA_API_KEY="master_sta_key_here"
   export STA_BASE_URL="https://api.us.safenetid.com/api/v1"
   /usr/local/bin/sta-proxy
   ```

---

### TLS 1.3 Termination & Reverse-Proxy Hardening

Production deployments must never expose HTTP directly. Place the proxy behind Nginx configured with modern 2026 TLS 1.3 ciphers:

```nginx
# /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name sta-proxy.corp.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name sta-proxy.corp.internal;

    ssl_certificate /etc/nginx/certs/proxy.crt;
    ssl_certificate_key /etc/nginx/certs/proxy.key;

    # TLS 1.3 & 1.2 Strict Cryptography
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Proxy to Node/Express Backend
    location / {
        proxy_pass http://sta-proxy:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
}
```

---

## 3. Configuration & Secrets Management

### Environment Variables Specification

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | integer | `3000` | Port on which the proxy and API listen |
| `HOST` | string | `0.0.0.0` | Bind interface address |
| `STA_BASE_URL` | string | `https://api.us.safenetid.com/api/v1` | Upstream Thales STA regional API base URL |
| `STA_API_KEY` | string | *none* (secret) | Master Thales STA administrative key |
| `STA_TENANT_ID` | string | *optional* | Thales STA Tenant code |
| `OIDC_ISSUER_URL` | string | *optional* | OIDC Identity Provider Issuer (e.g., Entra ID / Okta) |
| `OIDC_CLIENT_ID` | string | *optional* | Expected Audience (`aud`) in OIDC Bearer tokens |
| `PROXY_RATE_LIMIT`| integer | `120` | Max requests allowed per client window |
| `PROXY_RATE_WINDOW_MS`| integer | `60000` | Sliding window duration in milliseconds |
| `SIEM_ENABLED` | boolean | `false` | Enables real-time event forwarding |
| `SIEM_TYPE` | string | `syslog` | Forwarder type: `syslog`, `splunk_hec`, `datadog` |
| `SIEM_HOST` | string | *none* | Hostname or IP of the collector / SIEM ingestion point |
| `SIEM_PORT` | integer | `514` (6514 for TLS)| Port of the SIEM collector |
| `SIEM_PROTOCOL` | string | `udp` | Protocol: `udp`, `tcp`, `tls` |
| `SIEM_TLS_VERIFY` | boolean | `true` | Enforces certificate chain validation on TLS connections |
| `SIEM_AUTH_TOKEN`| string | *none* (secret) | Token for Splunk HEC or Datadog API |

---

### Master Credential Isolation
The master key is stored strictly in server-side memory (`process.env.STA_API_KEY`).
- **Never Logged**: The master token is omitted from all structured audit events, console messages, and error stacks.
- **Header Scrubbing**: Inbound `Authorization` headers are stripped and replaced immediately prior to dispatching upstream requests.
- **Client Blindness**: Even if an attacker gains full service account access through the proxy, they cannot query or retrieve the root credential.

---

### OpenID Connect (OIDC) IdP Integration

In addition to static Service Account tokens, the proxy supports dynamic OpenID Connect JWT authentication for interactive operators and federated enterprise systems.

```
┌──────────────┐     1. Authenticate     ┌────────────────┐
│  Client/User │ ──────────────────────> │ Enterprise IdP │ (Entra ID / Okta)
└──────┬───────┘                         └───────┬────────┘
       │                                         │ 2. Return Id Token
       │ 3. Inbound request                      ▼
       │    Authorization: Bearer <id_token>
       ▼
┌────────────────────────────────────────────────────────┐
│ Thales STA API Proxy                                   │
│  - Reads 'iss' (Issuer) -> Downloads JWKS public keys  │
│  - Verifies signature, expiration ('exp'), & 'aud'     │
│  - Extracts roles from claim: 'roles' / 'groups'       │
│  - Matches claims against RBAC Permissions Catalog     │
└────────────────────────────────────────────────────────┘
```

#### Sample Configuration for Microsoft Entra ID:
```bash
OIDC_ISSUER_URL="https://login.microsoftonline.com/your-tenant-uuid/v2.0"
OIDC_CLIENT_ID="api://thales-sta-proxy"
```
The proxy verifies JWT signatures using the provider's standard `.well-known/openid-configuration` and `jwks_uri` endpoints.

---

### Enterprise Secret Store Integration

In production, avoid static `.env` files. Retrieve secrets dynamically during container initialization:

#### HashiCorp Vault Pattern:
```bash
export STA_API_KEY=$(vault kv get -field=api_key secret/thales/sta)
export SIEM_AUTH_TOKEN=$(vault kv get -field=hec_token secret/siem/splunk)
exec node server.ts
```

#### AWS Secrets Manager Pattern:
```bash
SECRETS=$(aws secretsmanager get-secret-value --secret-id prod/sta-proxy --query SecretString --output text)
export STA_API_KEY=$(echo $SECRETS | jq -r .STA_API_KEY)
exec node server.ts
```

---

## 4. Granular RBAC & Policy Modeling

### STA Endpoint Catalog & Permission Matrix

The proxy classifies all native Thales SafeNet Trusted Access endpoints into discrete, granular scopes:

| Permission Scope | HTTP Methods | Target Resource Path | Typical Use Case |
| :--- | :--- | :--- | :--- |
| `users:read` | `GET` | `/users`, `/users/{id}` | User lookup, identity auditing |
| `users:write` | `POST`, `PUT`, `PATCH` | `/users`, `/users/{id}` | Onboarding, name/email updates |
| `users:delete` | `DELETE` | `/users/{id}` | Offboarding, GDPR deletion |
| `accounts:read` | `GET` | `/accounts`, `/accounts/{id}` | Tenant inventory, license metrics |
| `applications:read` | `GET` | `/applications`, `/applications/{id}` | App catalog inspection |
| `applications:write`| `POST`, `PUT` | `/applications`, `/applications/{id}` | SSO app configuration |
| `policies:read` | `GET` | `/policies`, `/policies/{id}` | Security policy auditing |
| `policies:write` | `POST`, `PUT`, `DELETE`| `/policies`, `/policies/{id}` | Conditional access rule change |
| `tokens:read` | `GET` | `/tokens`, `/tokens/{id}` | Hardware/software token search |
| `tokens:manage` | `POST`, `PUT`, `DELETE`| `/tokens/{id}/assign`, `/revoke` | MFA token provisioning/reset |
| `audit:read` | `GET` | `/audit/logs`, `/events` | Compliance log ingestion |

---

### Role Definitions & Custom Least-Privilege Archetypes

Preconfigured built-in roles provide immediate separation of duties:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             ROLE HIERARCHY                                  │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ Read-Only Auditor    │ users:read, accounts:read, applications:read,        │
│                      │ policies:read, tokens:read, audit:read               │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ Helpdesk Operator    │ users:read, tokens:read, tokens:manage               │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ User Provisioner     │ users:read, users:write, groups:manage               │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ Application Manager  │ applications:read, applications:write, policies:read │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ Security Admin       │ policies:read, policies:write, audit:read            │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ Super Admin          │ * (All scopes permitted)                             │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

#### Custom Role Modeling Example:
To create a restricted role for an automated ServiceNow ticketing bot that only resets tokens:
```json
{
  "id": "role_servicenow_mfa_reset",
  "name": "ServiceNow MFA Automation",
  "permissions": [
    "users:read",
    "tokens:read",
    "tokens:manage"
  ],
  "description": "Permits user search and MFA token assignment/revocation only."
}
```

---

### Service Account Lifecycle Management

Each client application must be assigned a dedicated Service Account:

```
1. Creation -> Assign unique Client ID, Granular Role, IP Whitelist, Expiry
2. Issuance -> Generate high-entropy Bearer Secret (sta_sa_...)
3. Invocation -> Client includes: Authorization: Bearer sta_sa_...
4. Audit Trace -> Every call tagged with Service Account ID and Owner
5. Expiration / Revocation -> Immediate cut-off without impacting other integrations
```

**Security Constraints on Service Accounts:**
- **Secret Generation**: Minimum 32-byte cryptographically secure pseudorandom token (`crypto.randomBytes(32).toString('hex')`).
- **IP Binding**: Optional CIDR or static IP enforcement (`allowedIps: ["10.200.4.12/32"]`).
- **Lifetime**: Configurable expiration timestamp.

---

### Dynamic Role-Filtered OpenAPI / Swagger Generation

To ensure external teams integrate safely, the proxy includes an on-the-fly OpenAPI 3.0 generator:
- **Endpoint**: `/api/openapi/spec?roleId={role_id}` or via client token inspection.
- **Behavior**: Inspects the role's allowed permissions and strips any endpoint definitions that the caller is unauthorized to execute.
- **Benefit**: Third-party developers never see documentation for administrative routes they cannot access, eliminating trial-and-error privilege testing.

---

## 5. Audit Logging & SIEM Real-Time Telemetry

### Structured Audit Schema (Dual-Verdict Model)

Every inbound request processed by the proxy triggers a comprehensive, non-repudiable audit event formatted in JSON.

```json
{
  "id": "evt_7f1c90a2b8e4",
  "timestamp": "2026-03-31T09:41:22.104Z",
  "clientIp": "192.168.10.45",
  "userId": "sa_servicenow_bot",
  "serviceAccountId": "sa_servicenow_bot",
  "action": "STA_PROXY_REQUEST",
  "endpoint": "/api/v1/policies",
  "method": "DELETE",
  "permission": "policies:write",
  "authStatus": "SUCCESS",
  "actionStatus": "FAIL",
  "failureReason": "IMPROPER_RIGHTS",
  "httpStatus": 403,
  "executionDurationMs": 1.4,
  "userAgent": "ServiceNow-MIDServer/2026.1",
  "tenantId": "tenant_enterprise_production_01"
}
```

### Failure Reason Taxonomy

The proxy isolates exactly why an operation failed, distinguishing between identity, permission, and upstream provider failures:

| Failure Reason Code | HTTP Status | Root Cause | Operator Action |
| :--- | :--- | :--- | :--- |
| `AUTHENTICATION_FAILED` | `401` | Invalid Bearer token, expired token, or unregistered service account | Verify service account key validity or rotation status |
| `IMPROPER_RIGHTS` | `403` | Token valid, but assigned role lacks the required scope for this endpoint | Review service account role assignment in RBAC tab |
| `IP_NOT_ALLOWED` | `403` | Inbound request IP does not match the service account whitelist | Check source NAT / egress gateway IP |
| `ACCOUNT_EXPIRED` | `401` | Service account expiration timestamp has passed | Extend service account validity in Admin console |
| `UPSTREAM_IDP_ERROR` | `502` / `504`| Thales STA returned a 4xx/5xx error or connection timed out | Inspect Thales STA status page and upstream tenant credentials |
| `RATE_LIMIT_EXCEEDED` | `429` | Client exceeded allotted sliding window threshold | Scale rate limits or optimize caller polling frequency |

---

### Syslog RFC-5424 over TLS Dispatcher

For enterprise SIEMs (QRadar, ArcSight, LogRhythm, Wazuh), the proxy formats logs per RFC-5424 with custom structured data parameters:

```
<134>1 2026-03-31T09:41:22.104Z sta-proxy-01.corp sta-proxy 4102 ID44 [staAudit@44917 clientIp="192.168.10.45" user="sa_servicenow_bot" auth="SUCCESS" action="FAIL" reason="IMPROPER_RIGHTS" perm="policies:write" path="/policies" method="DELETE"] Authorization Denied: Service Account sa_servicenow_bot lacks policies:write
```

#### TLS Socket Configuration:
- Uses TLS 1.3 encryption.
- Enforces mutual or server-side CA certificate validation (`tlsVerify: true`).
- Employs a 5,000ms socket abort timeout to prevent proxy blocking.

---

### Splunk HEC & Datadog Webhook Forwarders

- **Splunk HEC**: Formatted directly to Splunk's JSON Event format (`{"time": 1774948882.104, "sourcetype": "thales:sta:proxy", "event": {...}}`) dispatched over HTTPS POST to `:8088/services/collector`.
- **Datadog**: Formatted as Datadog Log API events dispatched via HTTPS POST to `https://http-intake.logs.datadoghq.com/api/v2/logs`.

---

### CEF (Common Event Format) Mapping

For legacy ArcSight and Sentinel connectors:
```
CEF:0|Thales|STA-Granular-Proxy|2.0|AUTH_DENIED|Authorization Denied|8|src=192.168.10.45 suser=sa_servicenow_bot act=DELETE request=/api/v1/policies outcome=failure reason=IMPROPER_RIGHTS
```

---

## 6. Operations, Monitoring & Maintenance Runbook

### Healthchecks & Liveness Probes

The proxy provides lightweight health and metrics endpoints for container orchestrators (Kubernetes, ECS, Nomad):

- `GET /health`:
  - Returns `{"status": "ok", "uptime": 14201, "timestamp": 1774948882}`.
  - Used for container liveness and readiness probes.
- `GET /api/sta/health`:
  - Actively validates upstream connectivity to Thales STA without executing state-changing operations.
  - Returns `{"upstream": "healthy", "latencyMs": 42}` or `{"upstream": "unhealthy", "error": "timeout"}`.

#### Kubernetes Probe Example:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

### Sliding Window Rate Limiting & DoS Protection

The proxy enforces a sliding window rate-limiter calculated per client identifier:
- **Tracking Key**: `ServiceAccountId` (if authenticated) or `RemoteIP` (if anonymous).
- **Default Baseline**: 120 requests per 60-second window.
- **Response Headers**:
  - `RateLimit-Limit`: Maximum requests per window.
  - `RateLimit-Remaining`: Requests remaining in active window.
  - `RateLimit-Reset`: Seconds remaining until window reset.

---

### Emergency Key Revocation Procedure

If a service account token is leaked or compromised, execute the following revocation protocol:

```bash
# Step 1: Identify the compromised account
# Query audit logs for unusual source IPs or abnormal 403 spikes
curl -s -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3000/api/audit/logs?serviceAccountId=sa_compromised_id

# Step 2: Disable or Revoke the Service Account
# Using curl or the Web Admin UI:
curl -X DELETE -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3000/api/service-accounts/sa_compromised_id

# Step 3: Verify Immediate Invalidation
# Subsequent calls with the compromised key must return HTTP 401
curl -i -H "Authorization: Bearer sta_sa_compromised_secret" \
  http://localhost:3000/sta/users
# Expected: HTTP/1.1 401 Unauthorized (AUTHENTICATION_FAILED)
```

---

### Diagnostic Triage Flowcharts

#### Issue 1: Client receives `403 Forbidden` (`IMPROPER_RIGHTS`)
```
[Client gets 403] 
       │
       ▼
Check Audit Logs in UI or SIEM for `failureReason: "IMPROPER_RIGHTS"`
       │
       ▼
Note the `permission` field required (e.g., `tokens:manage`)
       │
       ▼
Check the Service Account's assigned Role
       │
       ├──> If intended: Edit the Role in RBAC tab to grant `tokens:manage`
       └──> If unintended: Reject request; client is attempting unauthorized action
```

#### Issue 2: Client receives `502 Bad Gateway` (`UPSTREAM_IDP_ERROR`)
```
[Client gets 502/504]
       │
       ▼
Proxy was able to authenticate & authorize the request, but Thales STA failed
       │
       ▼
Verify Proxy outbound internet access:
curl -Iv https://api.us.safenetid.com/api/v1
       │
       ├──> DNS / TLS Handshake failure? -> Check network firewall & proxy egress rules
       └──> HTTP 401 from Thales? -> Master `STA_API_KEY` has expired or was revoked in STA
```

---

## 7. Upgrade Procedures & Compatibility Roadmap

### Zero-Downtime Rolling Update Procedure

When upgrading the proxy image or host runtime:

1. **Deploy New Instance**: Launch updated container alongside existing instances:
   ```bash
   docker compose pull
   docker compose up -d --no-deps --build sta-proxy
   ```
2. **Health Check Verification**: Ensure `/health` returns status `200` on the new container.
3. **Traffic Shift**: If using a load balancer (AWS ALB, F5, HAProxy), slowly bleed connections from old instances to new instances.
4. **Decommission Old Instances**: Remove previous containers after active HTTP connections complete.

---

### Upstream Thales STA API Schema Evolution

When Thales introduces new endpoints or versions (e.g., `/api/v2/...`):

1. **Catalog Update**: Open `server/routes/rbac.ts` and declare the new endpoint mapping in `STA_ENDPOINT_PERMISSIONS`:
   ```typescript
   {
     path: '/v2/passkeys',
     method: 'POST',
     permission: 'tokens:manage',
     description: 'FIDO2 Passkey Enrollment'
   }
   ```
2. **Re-compile and Test**:
   ```bash
   npm run lint
   npm run build
   ```
3. **Verify via Dynamic Swagger**: Open the Swagger UI tab and verify the new route appears under roles containing `tokens:manage`.

---

### Node.js & Dependency Maintenance Cadence

To maintain zero-vulnerability compliance:
- **Audit Schedule**: Monthly execution of `npm audit`.
- **LTS Tracking**:
  - 2026 Baseline: Node.js 22 LTS ("Jod").
  - 2027 Planned Migration: Node.js 24 LTS.
- **Engine Lock**: `package.json` contains strictly defined engine boundaries:
  ```json
  "engines": {
    "node": ">=22.0.0"
  }
  ```

---

### Emergency Rollback Runbook

If a newly deployed proxy version encounters unexpected upstream incompatibilities:

1. **Revert Docker Image**:
   ```bash
   docker compose down
   docker tag thales-sta-proxy:previous thales-sta-proxy:latest
   docker compose up -d
   ```
2. **Configuration Reversion**: Revert environment files from version control (`git checkout HEAD~1 deploy/`).
3. **Post-Rollback Audit**: Inspect the Audit Log buffer to confirm normal traffic resumption.

---

## 8. Enterprise Integration Examples & Good Practice Documentation

### Pattern 1: ServiceNow Helpdesk Self-Service User Unlock Bot

#### Architecture
The ServiceNow integration uses a dedicated Service Account assigned the `Helpdesk Operator` role. It can query users and reset tokens, but is cryptographically prevented from altering global policies or creating administrator accounts.

#### ServiceNow REST Message Configuration:
- **Endpoint**: `https://sta-proxy.corp.internal/sta/tokens/{token_id}/assign`
- **HTTP Headers**:
  - `Authorization`: `Bearer sta_sa_helpdesk_bot_secret`
  - `Content-Type`: `application/json`

#### ServiceNow Script Include Implementation:
```javascript
var ThalesSTARestClient = Class.create();
ThalesSTARestClient.prototype = {
    initialize: function() {
        this.proxyUrl = gs.getProperty('thales.sta.proxy.url');
        this.token = gs.getProperty('thales.sta.proxy.token');
    },

    unlockUserToken: function(userId, tokenId) {
        var sm = new sn_ws.RESTMessageV2();
        sm.setEndpoint(this.proxyUrl + '/sta/tokens/' + tokenId + '/unlock');
        sm.setHttpMethod('POST');
        sm.setRequestHeader('Authorization', 'Bearer ' + this.token);
        sm.setRequestHeader('Content-Type', 'application/json');
        
        var response = sm.execute();
        var statusCode = response.getStatusCode();
        
        if (statusCode === 200) {
            gs.info("Successfully unlocked token for user: " + userId);
            return true;
        } else if (statusCode === 403) {
            gs.error("STA Proxy denied permission: Bot lacks tokens:manage scope.");
            return false;
        } else {
            gs.error("STA Proxy returned error: " + response.getBody());
            return false;
        }
    }
};
```

---

### Pattern 2: Workday HR SCIM Employee Sync

#### Scenario
An automated nightly synchronization worker reads active employee rosters from Workday and provisions user identities into Thales STA.

#### Role Definition: `User Provisioner`
- **Permissions**: `users:read`, `users:write`
- **Explicit Denials**: `policies:*`, `applications:*`, `accounts:*`

#### Python Sync Script (`sync_users.py`):
```python
import os
import requests

PROXY_URL = os.getenv("STA_PROXY_URL", "https://sta-proxy.corp.internal")
PROXY_TOKEN = os.getenv("STA_PROXY_TOKEN")

headers = {
    "Authorization": f"Bearer {PROXY_TOKEN}",
    "Content-Type": "application/json"
}

def provision_user(user_data: dict):
    """Provisions a new user through the Granular Proxy."""
    url = f"{PROXY_URL}/sta/users"
    resp = requests.post(url, json=user_data, headers=headers, timeout=10)
    
    if resp.status_code == 201:
        print(f"User {user_data['username']} created successfully.")
    elif resp.status_code == 403:
        print(f"SECURITY ALERT: Proxy rejected request - improper rights.")
    else:
        print(f"Provisioning failed: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    new_hire = {
        "username": "alex.morgan@company.com",
        "email": "alex.morgan@company.com",
        "firstName": "Alex",
        "lastName": "Morgan"
    }
    provision_user(new_hire)
```

---

### Pattern 3: Splunk SIEM Detection Rule

#### Detection Logic: Unauthorized STA Administrative Attempt
This alert triggers whenever a caller attempts to modify access policies or account structures without proper permissions.

#### Splunk Search Processing Language (SPL):
```spl
index=security sourcetype="thales:sta:proxy" failureReason="IMPROPER_RIGHTS"
| stats count by clientIp, serviceAccountId, endpoint, method, permission
| where count >= 3
| eval alert_severity="HIGH", description="Repeated unauthorized privilege escalation attempts against Thales STA Proxy."
```

#### Alert Trigger:
- **Condition**: Number of events > 3 within a 5-minute sliding window.
- **Action**: Emit a PagerDuty incident to the Security Operations Center (SOC) and automatically quarantine the `serviceAccountId` in the proxy.

---

### Production Readiness Checklist

Before transitioning the proxy to production, ensure all gates pass:

- [ ] **Upstream Isolation**: Verify that the master Thales STA key (`STA_API_KEY`) is stored securely and NOT accessible to end-users or application developers.
- [ ] **TLS Hardened**: External communication terminates at TLS 1.3 or 1.2 with HSTS enabled.
- [ ] **Service Accounts Scoped**: Every integrating system has a distinct service account with the minimal necessary role (no `Super Admin` assigned to integrations).
- [ ] **IP Whitelists Bound**: Service accounts used by static infrastructure (CI/CD, ServiceNow MID Servers) have IP whitelists configured.
- [ ] **Real-time SIEM Connected**: Syslog TLS, Splunk HEC, or Datadog forwarder is active and verified by sending a test event.
- [ ] **Container Hardening**: Docker container runs as non-root unprivileged user with read-only root filesystem and dropped Linux capabilities (`cap_drop: ALL`).
- [ ] **Liveness Probe Wired**: Orchestrator probes verify `/health` every 10 seconds.

---

*Manual maintained by Enterprise Identity Architecture & Cloud Security Operations.*  
*Last updated: 2026 Production Baseline.*
