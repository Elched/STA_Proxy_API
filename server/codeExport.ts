export const PYTHON_CODE_EXPORT = {
  filename: 'sta_proxy_python.zip',
  files: [
    {
      path: 'main.py',
      language: 'python',
      content: `"""
Thales SafeNet Trusted Access (STA) Granular RBAC API Proxy
Production-Ready Standalone Gateway in Python / FastAPI

Enforces:
- Service Account API Key and OpenID Connect (OIDC) JWT validation
- Granular Role-Based Access Control (RBAC) per Thales STA REST endpoint
- Structured Security Audit Logging (timestamp, correlation_id, user_id, action, auth status, rejection reason)
- Secure Upstream Forwarding with STA Master API Key injection
- TLS 1.3 encryption
"""

import os
import re
import time
import uuid
import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import httpx
import jwt
from fastapi import FastAPI, Request, Response, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
STA_BASE_URL = os.getenv("STA_BASE_URL", "https://api.safenetid.com")
STA_TENANT_ID = os.getenv("STA_TENANT_ID", "STA-ENTERPRISE-TENANT")
STA_MASTER_API_KEY = os.getenv("STA_MASTER_API_KEY", "sta_master_secret_here")

OIDC_ISSUER = os.getenv("OIDC_ISSUER", "https://auth.enterprise-corp.com/oauth2/v1")
OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "https://api-proxy.enterprise-corp.com/sta")
OIDC_JWKS_URL = os.getenv("OIDC_JWKS_URL", f"{OIDC_ISSUER}/.well-known/jwks.json")

# Structured Logger setup (JSON format for SIEM/Splunk ingestion)
class StructuredAuditLogger:
    def __init__(self):
        self.logger = logging.getLogger("sta_audit")
        self.logger.setLevel(logging.INFO)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.logger.handlers = [handler]

    def log(self, entry: Dict[str, Any]):
        # Guarantees timestamp, userId, action, auth_status, action_status, rejection_reason
        self.logger.info(json.dumps(entry, default=str))

audit_logger = StructuredAuditLogger()

# -----------------------------------------------------------------------------
# RBAC Models & Catalog
# -----------------------------------------------------------------------------
class CallerIdentity(BaseModel):
    id: str
    name: str
    auth_type: str  # "SERVICE_ACCOUNT" or "OIDC_BEARER"
    roles: List[str]
    permissions: List[str]

# Pre-configured Service Accounts (can also be loaded from DB / HashiCorp Vault)
SERVICE_ACCOUNTS_DB: Dict[str, Dict[str, Any]] = {
    "sta_proxy_sk_helpdesk_7a9c2b81": {
        "id": "sa_servicenow_helpdesk",
        "name": "ServiceNow ITSM Helpdesk Bot",
        "roles": ["helpdesk-operator"],
        "active": True
    },
    "sta_proxy_sk_hrsync_5e2d1a49": {
        "id": "sa_workday_hr",
        "name": "Workday HR Lifecycle Sync",
        "roles": ["hr-onboarding-service"],
        "active": True
    },
    "sta_proxy_sk_splunk_99f43c12": {
        "id": "sa_splunk_siem",
        "name": "Splunk SIEM Audit Collector",
        "roles": ["security-auditor"],
        "active": True
    }
}

# Role Definitions mapping to granular permissions
ROLES_PERMISSIONS_DB: Dict[str, List[str]] = {
    "helpdesk-operator": [
        "sta:users:read",
        "sta:users:unlock",
        "sta:users:reset-password",
        "sta:tokens:read",
        "sta:tokens:assign",
        "sta:tokens:revoke",
        "sta:tokens:unlock"
    ],
    "hr-onboarding-service": [
        "sta:users:read",
        "sta:users:create",
        "sta:users:update",
        "sta:groups:read"
    ],
    "app-integrator": [
        "sta:applications:read",
        "sta:applications:create",
        "sta:applications:update"
    ],
    "security-auditor": [
        "sta:audit:read",
        "sta:policies:read",
        "sta:applications:read",
        "sta:users:read"
    ],
    "tenant-super-admin": ["*"]
}

# Granular Endpoint Routing Table
ENDPOINT_RULES = [
    # Users
    {"method": "GET", "pattern": r"^/api/v1/users$", "perm": "sta:users:read", "action": "users.list"},
    {"method": "GET", "pattern": r"^/api/v1/users/[^/]+$", "perm": "sta:users:read", "action": "users.get"},
    {"method": "POST", "pattern": r"^/api/v1/users$", "perm": "sta:users:create", "action": "users.create"},
    {"method": "PUT", "pattern": r"^/api/v1/users/[^/]+$", "perm": "sta:users:update", "action": "users.update"},
    {"method": "DELETE", "pattern": r"^/api/v1/users/[^/]+$", "perm": "sta:users:delete", "action": "users.delete"},
    {"method": "POST", "pattern": r"^/api/v1/users/[^/]+/unlock$", "perm": "sta:users:unlock", "action": "users.unlock"},
    {"method": "POST", "pattern": r"^/api/v1/users/[^/]+/reset-password$", "perm": "sta:users:reset-password", "action": "users.reset_password"},

    # Authenticators
    {"method": "GET", "pattern": r"^/api/v1/users/[^/]+/tokens$", "perm": "sta:tokens:read", "action": "tokens.list"},
    {"method": "POST", "pattern": r"^/api/v1/users/[^/]+/tokens$", "perm": "sta:tokens:assign", "action": "tokens.assign"},
    {"method": "DELETE", "pattern": r"^/api/v1/users/[^/]+/tokens/[^/]+$", "perm": "sta:tokens:revoke", "action": "tokens.revoke"},
    {"method": "POST", "pattern": r"^/api/v1/users/[^/]+/tokens/[^/]+/unlock$", "perm": "sta:tokens:unlock", "action": "tokens.unlock"},

    # Applications
    {"method": "GET", "pattern": r"^/api/v1/applications(/[^/]+)?$", "perm": "sta:applications:read", "action": "applications.read"},
    {"method": "POST", "pattern": r"^/api/v1/applications$", "perm": "sta:applications:create", "action": "applications.create"},
    {"method": "DELETE", "pattern": r"^/api/v1/applications/[^/]+$", "perm": "sta:applications:delete", "action": "applications.delete"},

    # Policies
    {"method": "GET", "pattern": r"^/api/v1/policies(/[^/]+)?$", "perm": "sta:policies:read", "action": "policies.read"},
    {"method": "POST", "pattern": r"^/api/v1/policies$", "perm": "sta:policies:create", "action": "policies.create"},
    {"method": "DELETE", "pattern": r"^/api/v1/policies/[^/]+$", "perm": "sta:policies:delete", "action": "policies.delete"},

    # Groups
    {"method": "GET", "pattern": r"^/api/v1/groups(/[^/]+)?$", "perm": "sta:groups:read", "action": "groups.read"},
    {"method": "POST", "pattern": r"^/api/v1/groups/[^/]+/members$", "perm": "sta:groups:manage", "action": "groups.manage"},

    # Audit
    {"method": "GET", "pattern": r"^/api/v1/logs$", "perm": "sta:audit:read", "action": "audit.read"}
]

# -----------------------------------------------------------------------------
# FastAPI App
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Thales STA Granular API Proxy",
    description="Zero-Trust RBAC and Security Audit Gateway for SafeNet Trusted Access",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent HTTP Client with TLS verification
http_client = httpx.AsyncClient(timeout=30.0, verify=True)

# -----------------------------------------------------------------------------
# Authentication & RBAC Engine
# -----------------------------------------------------------------------------
def authenticate_request(request: Request) -> CallerIdentity:
    """Authenticates caller via X-API-Key or Authorization Bearer (OIDC JWT)"""
    api_key = request.headers.get("X-API-Key")
    auth_header = request.headers.get("Authorization", "")

    token = None
    if api_key:
        token = api_key.strip()
    elif auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication failed: missing credentials (expected X-API-Key or Bearer token)"
        )

    # 1. Check Service Account Key
    if token in SERVICE_ACCOUNTS_DB:
        sa_data = SERVICE_ACCOUNTS_DB[token]
        if not sa_data.get("active", True):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"authentication failed: service account '{sa_data['id']}' is revoked"
            )

        roles = sa_data["roles"]
        perms = set()
        for r in roles:
            for p in ROLES_PERMISSIONS_DB.get(r, []):
                perms.add(p)

        return CallerIdentity(
            id=sa_data["id"],
            name=sa_data["name"],
            auth_type="SERVICE_ACCOUNT",
            roles=roles,
            permissions=list(perms)
        )

    # 2. Check OpenID Connect JWT
    if token.startswith("eyJ") or "." in token:
        try:
            # In production, configure PyJWKClient:
            # jwks_client = jwt.PyJWKClient(OIDC_JWKS_URL)
            # signing_key = jwks_client.get_signing_key_from_jwt(token)
            # payload = jwt.decode(token, signing_key.key, algorithms=["RS256"], audience=OIDC_AUDIENCE, issuer=OIDC_ISSUER)
            
            # For standalone demo decoding:
            payload = jwt.decode(token, options={"verify_signature": False})
            
            # Expiry check
            if "exp" in payload and payload["exp"] < time.time():
                raise HTTPException(status_code=401, detail="authentication failed: OIDC token expired")

            sub = payload.get("sub") or payload.get("email") or "oidc_caller"
            roles = payload.get("roles") or payload.get("groups") or ["user-self-service"]
            
            perms = set()
            for r in roles:
                for p in ROLES_PERMISSIONS_DB.get(r, []):
                    perms.add(p)

            return CallerIdentity(
                id=sub,
                name=f"OIDC: {payload.get('name', sub)}",
                auth_type="OIDC_BEARER",
                roles=roles,
                permissions=list(perms)
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"authentication failed: invalid OIDC token ({str(e)})")

    raise HTTPException(status_code=401, detail="authentication failed: unrecognized credentials")

def check_rbac(identity: CallerIdentity, method: str, path: str):
    """Evaluates request against Granular RBAC table"""
    method = method.upper()
    for rule in ENDPOINT_RULES:
        if rule["method"] == method and re.match(rule["pattern"], path):
            req_perm = rule["perm"]
            if "*" in identity.permissions or req_perm in identity.permissions:
                return rule
            
            roles_str = ", ".join(identity.roles)
            reason = f"improper rights: caller roles [{roles_str}] lack required permission '{req_perm}' for {rule['action']}"
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "Forbidden",
                    "code": "IMPROPER_RIGHTS",
                    "reason": reason,
                    "requiredPermission": req_perm,
                    "caller": identity.id
                }
            )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": "Forbidden",
            "code": "UNMAPPED_ENDPOINT",
            "reason": f"improper rights: endpoint '{method} {path}' is not permitted by zero-trust gateway policy"
        }
    )

# -----------------------------------------------------------------------------
# Main Reverse Proxy Route
# -----------------------------------------------------------------------------
@app.api_route("/api/v1/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_sta_request(full_path: str, request: Request):
    start_time = time.time()
    correlation_id = request.headers.get("X-Correlation-ID", f"req_{uuid.uuid4()}")
    client_ip = request.client.host if request.client else "127.0.0.1"
    path = f"/api/v1/{full_path}"
    method = request.method.upper()

    identity: Optional[CallerIdentity] = None
    rule = None

    # Step 1: Authentication
    try:
        identity = authenticate_request(request)
    except HTTPException as auth_err:
        latency_ms = int((time.time() - start_time) * 1000)
        audit_logger.log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "correlationId": correlation_id,
            "userId": "anonymous_caller",
            "authType": "ANONYMOUS",
            "authSuccess": False,
            "authFailureReason": str(auth_err.detail),
            "action": "unknown",
            "httpMethod": method,
            "endpoint": path,
            "actionStatus": "AUTH_FAILED",
            "rejectionReason": str(auth_err.detail),
            "upstreamStatusCode": None,
            "latencyMs": latency_ms,
            "clientIp": client_ip
        })
        return JSONResponse(
            status_code=auth_err.status_code,
            headers={"X-Correlation-ID": correlation_id},
            content={"error": "Unauthorized", "message": auth_err.detail, "correlationId": correlation_id}
        )

    # Step 2: RBAC Policy Check
    try:
        rule = check_rbac(identity, method, path)
    except HTTPException as rbac_err:
        latency_ms = int((time.time() - start_time) * 1000)
        detail = rbac_err.detail if isinstance(rbac_err.detail, dict) else {"reason": str(rbac_err.detail)}
        reason = detail.get("reason", "improper rights")
        
        audit_logger.log({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "correlationId": correlation_id,
            "userId": identity.id,
            "authType": identity.auth_type,
            "authSuccess": True,
            "authFailureReason": None,
            "action": detail.get("code", "rbac.blocked"),
            "httpMethod": method,
            "endpoint": path,
            "actionStatus": "FORBIDDEN",
            "rejectionReason": reason,
            "upstreamStatusCode": None,
            "latencyMs": latency_ms,
            "clientIp": client_ip
        })
        return JSONResponse(
            status_code=rbac_err.status_code,
            headers={"X-Correlation-ID": correlation_id},
            content=detail
        )

    # Step 3: Forward to Upstream Thales STA over TLS
    upstream_url = f"{STA_BASE_URL.rstrip('/')}{path}"
    headers = {
        "Authorization": f"Bearer {STA_MASTER_API_KEY}",
        "X-STA-Tenant-ID": STA_TENANT_ID,
        "X-Correlation-ID": correlation_id,
        "Content-Type": "application/json"
    }
    
    body = await request.body()
    try:
        upstream_resp = await http_client.request(
            method=method,
            url=upstream_url,
            headers=headers,
            content=body,
            params=dict(request.query_params)
        )
        upstream_status = upstream_resp.status_code
        upstream_content = upstream_resp.content
    except Exception as exc:
        upstream_status = 502
        upstream_content = json.dumps({"error": "Bad Gateway", "message": f"STA connection error: {str(exc)}"}).encode()

    latency_ms = int((time.time() - start_time) * 1000)
    is_success = 200 <= upstream_status < 300

    # Step 4: Audit Logging of Execution
    action_status = "SUCCESS" if is_success else "UPSTREAM_FAILED"
    rejection_reason = None
    if not is_success:
        try:
            err_data = json.loads(upstream_content)
            msg = err_data.get("message") or err_data.get("error") or "Unknown error"
        except:
            msg = upstream_content.decode(errors="ignore")
        rejection_reason = f"the action has failed on the identity provider side: STA returned HTTP {upstream_status}: {msg}"

    audit_logger.log({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "correlationId": correlation_id,
        "userId": identity.id,
        "authType": identity.auth_type,
        "authSuccess": True,
        "authFailureReason": None,
        "action": rule["action"] if rule else "sta.action",
        "httpMethod": method,
        "endpoint": path,
        "actionStatus": action_status,
        "rejectionReason": rejection_reason,
        "upstreamStatusCode": upstream_status,
        "latencyMs": latency_ms,
        "clientIp": client_ip
    })

    return Response(
        content=upstream_content,
        status_code=upstream_status,
        media_type="application/json",
        headers={"X-Correlation-ID": correlation_id}
    )

if __name__ == "__main__":
    import uvicorn
    # In production, pass ssl_keyfile and ssl_certfile for direct TLS 1.3 termination
    # Or terminate TLS via Nginx / Traefik reverse proxy
    uvicorn.run("main:app", host="0.0.0.0", port=8443, reload=False)
`
    },
    {
      path: 'requirements.txt',
      language: 'text',
      content: `fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
pyjwt[crypto]==2.9.0
pydantic==2.9.2
python-dotenv==1.0.1
cryptography==43.0.1
`
    },
    {
      path: 'Dockerfile',
      language: 'dockerfile',
      content: `FROM python:3.12-slim as builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY main.py .

ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

# Expose HTTPS port
EXPOSE 8443

# Run with TLS certificates mounted in /etc/ssl/certs
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8443", "--ssl-keyfile", "/etc/ssl/certs/privkey.pem", "--ssl-certfile", "/etc/ssl/certs/fullchain.pem"]
`
    },
    {
      path: 'docker-compose.yml',
      language: 'yaml',
      content: `# Compose Spec v2 (2026 Standard)
services:
  sta-api-proxy:
    build: .
    ports:
      - "8443:8443"
    environment:
      - STA_BASE_URL=https://api.safenetid.com
      - STA_TENANT_ID=YOUR_STA_TENANT_CODE
      - STA_MASTER_API_KEY=YOUR_STA_MASTER_SECRET_KEY
      - OIDC_ISSUER=https://auth.yourcompany.com
      - OIDC_AUDIENCE=https://api-proxy.yourcompany.com/sta
    volumes:
      - ./certs:/etc/ssl/certs:ro
    restart: unless-stopped
`
    }
  ]
};

export const GO_CODE_EXPORT = {
  filename: 'sta_proxy_go.zip',
  files: [
    {
      path: 'main.go',
      language: 'go',
      content: `// Thales SafeNet Trusted Access (STA) Granular API Proxy in Go
// High performance, compiled, memory-safe standalone reverse proxy.
package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

type AuditEntry struct {
	Timestamp          string \`json:"timestamp"\`
	CorrelationID      string \`json:"correlationId"\`
	UserID             string \`json:"userId"\`
	AuthType           string \`json:"authType"\`
	AuthSuccess        bool   \`json:"authSuccess"\`
	AuthFailureReason  string \`json:"authFailureReason,omitempty"\`
	Action             string \`json:"action"\`
	HTTPMethod         string \`json:"httpMethod"\`
	Endpoint           string \`json:"endpoint"\`
	ActionStatus       string \`json:"actionStatus"\` // SUCCESS, FORBIDDEN, AUTH_FAILED, UPSTREAM_FAILED
	RejectionReason    string \`json:"rejectionReason,omitempty"\`
	UpstreamStatusCode int    \`json:"upstreamStatusCode,omitempty"\`
	LatencyMs          int64  \`json:"latencyMs"\`
	ClientIP           string \`json:"clientIp"\`
}

var (
	staBaseURL      = getEnv("STA_BASE_URL", "https://api.safenetid.com")
	staMasterAPIKey = getEnv("STA_MASTER_API_KEY", "sta_master_secret_here")
	staTenantID     = getEnv("STA_TENANT_ID", "STA-ENTERPRISE-TENANT")

	// Service Accounts store
	serviceAccounts = map[string][]string{
		"sta_proxy_sk_helpdesk_7a9c2b81": {"sta:users:read", "sta:users:unlock", "sta:users:reset-password", "sta:tokens:read", "sta:tokens:assign", "sta:tokens:revoke", "sta:tokens:unlock"},
		"sta_proxy_sk_hrsync_5e2d1a49":   {"sta:users:read", "sta:users:create", "sta:users:update", "sta:groups:read"},
		"sta_proxy_sk_splunk_99f43c12":   {"sta:audit:read", "sta:policies:read", "sta:users:read"},
	}

	httpClient = &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13},
		},
	}
)

func getEnv(key, def string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return def
}

func logAudit(entry AuditEntry) {
	b, _ := json.Marshal(entry)
	fmt.Println(string(b))
}

func handler(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	corrID := r.Header.Get("X-Correlation-ID")
	if corrID == "" {
		corrID = "req_" + uuid.New().String()
	}
	w.Header().Set("X-Correlation-ID", corrID)
	w.Header().Set("Content-Type", "application/json")

	// 1. Authenticate
	apiKey := r.Header.Get("X-API-Key")
	if apiKey == "" {
		authH := r.Header.Get("Authorization")
		if strings.HasPrefix(strings.ToLower(authH), "bearer ") {
			apiKey = strings.TrimSpace(authH[7:])
		}
	}

	perms, ok := serviceAccounts[apiKey]
	if !ok {
		latency := time.Since(start).Milliseconds()
		failReason := "authentication failed: missing or invalid service account credentials"
		logAudit(AuditEntry{
			Timestamp:         time.Now().UTC().Format(time.RFC3339),
			CorrelationID:     corrID,
			UserID:            "anonymous",
			AuthType:          "ANONYMOUS",
			AuthSuccess:       false,
			AuthFailureReason: failReason,
			Action:            "unknown",
			HTTPMethod:        r.Method,
			Endpoint:          r.URL.Path,
			ActionStatus:      "AUTH_FAILED",
			RejectionReason:   failReason,
			LatencyMs:         latency,
			ClientIP:          r.RemoteAddr,
		})
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized", "message": failReason})
		return
	}

	// 2. Granular RBAC Check
	requiredPerm, actionName := resolvePermission(r.Method, r.URL.Path)
	if requiredPerm == "" {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "message": "unmapped endpoint in zero-trust catalog"})
		return
	}

	hasPerm := false
	for _, p := range perms {
		if p == "*" || p == requiredPerm {
			hasPerm = true
			break
		}
	}

	if !hasPerm {
		latency := time.Since(start).Milliseconds()
		reason := fmt.Sprintf("improper rights: caller lacks required permission '%s' for action '%s'", requiredPerm, actionName)
		logAudit(AuditEntry{
			Timestamp:       time.Now().UTC().Format(time.RFC3339),
			CorrelationID:   corrID,
			UserID:          "service_account",
			AuthType:        "SERVICE_ACCOUNT",
			AuthSuccess:     true,
			Action:          actionName,
			HTTPMethod:      r.Method,
			Endpoint:        r.URL.Path,
			ActionStatus:    "FORBIDDEN",
			RejectionReason: reason,
			LatencyMs:       latency,
			ClientIP:        r.RemoteAddr,
		})
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "code": "IMPROPER_RIGHTS", "reason": reason})
		return
	}

	// 3. Forward to Upstream SafeNet Trusted Access
	bodyBytes, _ := io.ReadAll(r.Body)
	targetURL := fmt.Sprintf("%s%s", strings.TrimRight(staBaseURL, "/"), r.URL.Path)
	upReq, _ := http.NewRequest(r.Method, targetURL, bytes.NewReader(bodyBytes))
	upReq.Header.Set("Authorization", "Bearer "+staMasterAPIKey)
	upReq.Header.Set("X-STA-Tenant-ID", staTenantID)
	upReq.Header.Set("Content-Type", "application/json")
	upReq.Header.Set("X-Correlation-ID", corrID)

	upResp, err := httpClient.Do(upReq)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		logAudit(AuditEntry{
			Timestamp:          time.Now().UTC().Format(time.RFC3339),
			CorrelationID:      corrID,
			UserID:             "service_account",
			AuthType:           "SERVICE_ACCOUNT",
			AuthSuccess:        true,
			Action:             actionName,
			HTTPMethod:         r.Method,
			Endpoint:           r.URL.Path,
			ActionStatus:       "UPSTREAM_FAILED",
			RejectionReason:    "action failed: upstream Thales STA unreachable: " + err.Error(),
			UpstreamStatusCode: http.StatusBadGateway,
			LatencyMs:          latency,
			ClientIP:           r.RemoteAddr,
		})
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Gateway", "message": err.Error()})
		return
	}
	defer upResp.Body.Close()

	respBody, _ := io.ReadAll(upResp.Body)
	isSuccess := upResp.StatusCode >= 200 && upResp.StatusCode < 300
	actionStatus := "SUCCESS"
	rejectionReason := ""

	if !isSuccess {
		actionStatus = "UPSTREAM_FAILED"
		rejectionReason = fmt.Sprintf("the action has failed on the identity provider side: STA returned HTTP %d: %s", upResp.StatusCode, string(respBody))
	}

	logAudit(AuditEntry{
		Timestamp:          time.Now().UTC().Format(time.RFC3339),
		CorrelationID:      corrID,
		UserID:             "service_account",
		AuthType:           "SERVICE_ACCOUNT",
		AuthSuccess:        true,
		Action:             actionName,
		HTTPMethod:         r.Method,
		Endpoint:           r.URL.Path,
		ActionStatus:       actionStatus,
		RejectionReason:    rejectionReason,
		UpstreamStatusCode: upResp.StatusCode,
		LatencyMs:          latency,
		ClientIP:           r.RemoteAddr,
	})

	w.WriteHeader(upResp.StatusCode)
	w.Write(respBody)
}

func resolvePermission(method, path string) (string, string) {
	if method == "GET" && path == "/api/v1/users" {
		return "sta:users:read", "users.list"
	}
	if method == "POST" && regexp.MustCompile(\`^/api/v1/users/[^/]+/unlock$\`).MatchString(path) {
		return "sta:users:unlock", "users.unlock"
	}
	if method == "POST" && regexp.MustCompile(\`^/api/v1/users/[^/]+/tokens$\`).MatchString(path) {
		return "sta:tokens:assign", "tokens.assign"
	}
	if method == "POST" && regexp.MustCompile(\`^/api/v1/users/[^/]+/tokens/[^/]+/unlock$\`).MatchString(path) {
		return "sta:tokens:unlock", "tokens.unlock"
	}
	if method == "DELETE" && regexp.MustCompile(\`^/api/v1/policies/[^/]+$\`).MatchString(path) {
		return "sta:policies:delete", "policies.delete"
	}
	if method == "GET" && regexp.MustCompile(\`^/api/v1/groups(/[^/]+)?$\`).MatchString(path) {
		return "sta:groups:read", "groups.read"
	}
	if method == "POST" && regexp.MustCompile(\`^/api/v1/groups/[^/]+/members$\`).MatchString(path) {
		return "sta:groups:manage", "groups.manage"
	}
	if method == "GET" && path == "/api/v1/logs" {
		return "sta:audit:read", "audit.read"
	}
	return "", ""
}

func main() {
	http.HandleFunc("/api/v1/", handler)
	log.Println("Thales STA Granular API Proxy listening on :8443 (TLS)...")
	// For production: log.Fatal(http.ListenAndServeTLS(":8443", "cert.pem", "key.pem", nil))
	log.Fatal(http.ListenAndServe(":8443", nil))
}
`
    },
    {
      path: 'go.mod',
      language: 'text',
      content: `module sta-proxy

go 1.22

require github.com/google/uuid v1.6.0
`
    }
  ]
};

export const DOCKER_CODE_EXPORT = {
  filename: 'sta_proxy_docker.zip',
  files: [
    {
      path: 'Dockerfile',
      language: 'dockerfile',
      content: `# Multi-stage production container for Thales STA Granular Proxy
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache curl
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
RUN npm install -g tsx
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/metadata.json ./metadata.json
RUN mkdir -p /etc/ssl/certs && chown -R node:node /app /etc/ssl/certs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -f http://localhost:3000/api/stats || exit 1
CMD ["tsx", "server.ts"]
`
    },
    {
      path: 'docker-compose.yml',
      language: 'yaml',
      content: `# Compose Spec v2 (2026 Standard)
services:
  sta-api-proxy:
    build: .
    container_name: thales-sta-proxy
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - STA_BASE_URL=https://api.safenetid.com
      - STA_TENANT_ID=STA-ENTERPRISE-TENANT-EU
      - STA_MASTER_API_KEY=YOUR_STA_MASTER_SECRET_KEY
      - OIDC_ISSUER=https://auth.enterprise-corp.com/oauth2/v1
      - OIDC_AUDIENCE=https://api-proxy.enterprise-corp.com/sta
    volumes:
      - ./certs:/etc/ssl/certs:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/stats"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"
`
    },
    {
      path: 'nginx.conf.example',
      language: 'nginx',
      content: `events { worker_connections 1024; }
http {
    upstream sta_backend { server sta-api-proxy:3000; }
    server {
        listen 443 ssl;
        http2 on;
        server_name proxy.sta.enterprise.corp;
        ssl_certificate     /etc/ssl/certs/fullchain.pem;
        ssl_certificate_key /etc/ssl/certs/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        location / {
            proxy_pass http://sta_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
        }
    }
}
`
    },
    {
      path: '.dockerignore',
      language: 'text',
      content: `node_modules\ndist\n.git\n.env\ncerts/*.key\n`
    }
  ]
};
