export type AuthType = 'SERVICE_ACCOUNT' | 'OIDC_BEARER' | 'CLIENT_CREDENTIALS' | 'ANONYMOUS';

export type ActionStatus = 'SUCCESS' | 'FORBIDDEN' | 'AUTH_FAILED' | 'UPSTREAM_FAILED' | 'BAD_REQUEST';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  correlationId: string;
  userId: string;
  clientName: string;
  authType: AuthType;
  authSuccess: boolean;
  authFailureReason: string | null;
  action: string;
  actionCategory: 'Users' | 'Authenticators' | 'Applications' | 'Policies' | 'Groups' | 'Audit' | 'System' | 'Accounts';
  httpMethod: string;
  endpoint: string;
  actionStatus: ActionStatus;
  rejectionReason: string | null;
  upstreamStatusCode: number | null;
  latencyMs: number;
  clientIp: string;
  userAgent: string;
  requestPayloadSummary?: string;
  responseSummary?: string;
}

export interface RbacRule {
  id: string;
  name: string;
  description: string;
  httpMethod: string;
  pathPattern: string;
  requiredPermission: string;
  category: 'Users' | 'Authenticators' | 'Applications' | 'Policies' | 'Groups' | 'Audit' | 'System' | 'Accounts';
}

export interface RbacRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  category: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  roles: string[];
  status: 'active' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
}

export interface UpstreamStaConfig {
  mode: 'mock' | 'live';
  tenantId: string;
  apiBaseUrl: string;
  masterApiKey: string;
  masterApiKeyMasked?: string;
  simulateUpstreamFailure?: 'none' | 'maintenance_503' | 'rate_limit_429' | 'internal_error_500';
  verifyTls: boolean;
}

export interface ProxyStats {
  total: number;
  success: number;
  deniedRbac: number;
  authFailed: number;
  upstreamFailed: number;
  avgLatency: number;
  serviceAccountsCount: number;
  rolesCount: number;
  mockUsersCount: number;
  mockLockedCount: number;
  upstreamMode: 'mock' | 'live';
  simulateUpstreamFailure: string;
}
