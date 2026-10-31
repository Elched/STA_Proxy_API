import React, { useState } from 'react';
import {
  Play,
  Shield,
  Key,
  Server,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Terminal,
  ArrowRight,
  RefreshCw,
  Sliders,
  Code
} from 'lucide-react';
import { ServiceAccount } from '../types.ts';

interface ProxyGatewayTesterProps {
  serviceAccounts: ServiceAccount[];
  onLogGenerated: () => void;
  onNavigateTab: (tab: string) => void;
}

export const ProxyGatewayTester: React.FC<ProxyGatewayTesterProps> = ({
  serviceAccounts,
  onLogGenerated,
  onNavigateTab,
}) => {
  // Preset callers
  const [callerType, setCallerType] = useState<string>('sa_helpdesk');
  const [customKey, setCustomKey] = useState<string>('');
  const [oidcToken, setOidcToken] = useState<string>('');

  // Request parameters
  const [httpMethod, setHttpMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('POST');
  const [endpointPath, setEndpointPath] = useState<string>('/api/v1/users/usr_4821/unlock');
  const [requestBody, setRequestBody] = useState<string>('{\n  "reason": "ITSM INC-9941 unlocked by Tier 1 analyst"\n}');
  const [correlationId, setCorrelationId] = useState<string>('');

  // Execution state
  const [loading, setLoading] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{
    status: number;
    body: any;
    headers: Record<string, string>;
    latencyMs: number;
    timestamp: string;
    correlationId: string;
    pipeline: {
      authOk: boolean;
      authReason?: string;
      rbacOk: boolean;
      rbacReason?: string;
      upstreamSent: boolean;
      upstreamOk: boolean;
      upstreamReason?: string;
      auditRecorded: boolean;
    };
  } | null>(null);

  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Scenarios catalogue
  const scenarios = [
    {
      id: 'unlock_helpdesk',
      label: 'Helpdesk: Unlock User usr_4821',
      description: 'Account is currently LOCKED in STA. Helpdesk has permission sta:users:unlock.',
      caller: 'sa_helpdesk',
      method: 'POST' as const,
      path: '/api/v1/users/usr_4821/unlock',
      body: '{\n  "reason": "Identity verified via badge challenge. Unlocking account."\n}',
      expected: 'SUCCESS (200 OK)',
    },
    {
      id: 'delete_policy_helpdesk',
      label: 'Helpdesk: Delete MFA Policy (Unauthorized)',
      description: 'Helpdesk attempts to delete the Master Access Policy. Denied by granular RBAC ("improper rights").',
      caller: 'sa_helpdesk',
      method: 'DELETE' as const,
      path: '/api/v1/policies/pol_mfa_all_cloud',
      body: '',
      expected: 'FORBIDDEN (403 - Improper Rights)',
    },
    {
      id: 'create_duplicate_hr',
      label: 'HR Sync: Duplicate User (Upstream STA Conflict)',
      description: 'HR Sync possesses sta:users:create, but STA upstream rejects with 409 User Exists.',
      caller: 'sa_hr',
      method: 'POST' as const,
      path: '/api/v1/users',
      body: '{\n  "username": "marcus.vance",\n  "email": "marcus.vance@enterprise.corp",\n  "firstName": "Marcus",\n  "lastName": "Vance"\n}',
      expected: 'UPSTREAM_FAILED (409 Conflict)',
    },
    {
      id: 'assign_token_helpdesk',
      label: 'Helpdesk: Assign MobilePASS+ Token',
      description: 'Enroll new authenticator for user usr_102 (Clara Oswald).',
      caller: 'sa_helpdesk',
      method: 'POST' as const,
      path: '/api/v1/users/usr_102/tokens',
      body: '{\n  "type": "MobilePASS+",\n  "policy": "DefaultPush"\n}',
      expected: 'SUCCESS (201 Created)',
    },
    {
      id: 'siem_read_logs',
      label: 'Splunk SIEM: Query STA Logs',
      description: 'SIEM service account queries raw STA tenant security audit events.',
      caller: 'sa_siem',
      method: 'GET' as const,
      path: '/api/v1/logs',
      body: '',
      expected: 'SUCCESS (200 OK)',
    },
    {
      id: 'unauthenticated_call',
      label: 'Anonymous / Invalid API Key',
      description: 'Request sent without valid credentials. Proxy rejects at boundary before touching STA.',
      caller: 'anonymous',
      method: 'GET' as const,
      path: '/api/v1/users',
      body: '',
      expected: 'AUTH_FAILED (401 Unauthorized)',
    },
  ];

  const handleApplyScenario = (s: typeof scenarios[0]) => {
    setCallerType(s.caller);
    setHttpMethod(s.method);
    setEndpointPath(s.path);
    setRequestBody(s.body);
    setExecutionResult(null);
  };

  // Resolve headers based on selected caller
  const resolveAuthHeaders = (): Record<string, string> => {
    if (callerType === 'sa_helpdesk') {
      const sa = serviceAccounts.find(s => s.id === 'sa_servicenow_helpdesk');
      return { 'X-API-Key': sa ? sa.apiKey : 'sta_proxy_sk_helpdesk_7a9c2b81' };
    }
    if (callerType === 'sa_hr') {
      const sa = serviceAccounts.find(s => s.id === 'sa_workday_hr');
      return { 'X-API-Key': sa ? sa.apiKey : 'sta_proxy_sk_hrsync_5e2d1a49' };
    }
    if (callerType === 'sa_siem') {
      const sa = serviceAccounts.find(s => s.id === 'sa_splunk_siem');
      return { 'X-API-Key': sa ? sa.apiKey : 'sta_proxy_sk_splunk_99f43c12' };
    }
    if (callerType === 'sa_devops') {
      const sa = serviceAccounts.find(s => s.id === 'sa_jenkins_ci');
      return { 'X-API-Key': sa ? sa.apiKey : 'sta_proxy_sk_devops_38b19e76' };
    }
    if (callerType === 'oidc_helpdesk') {
      // In-line test OIDC token
      return {
        'Authorization': 'Bearer ' + (oidcToken || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZS5zbWl0aEBlbnRlcnByaXNlLmNvcnAiLCJuYW1lIjoiQWxpY2UgU21pdGgiLCJyb2xlcyI6WyJoZWxwZGVzay1vcGVyYXRvciJdLCJpc3MiOiJodHRwczovL2F1dGguY29ycC5jb20iLCJleHAiOjk5OTk5OTk5OTl9.mock_sig'),
      };
    }
    if (callerType === 'custom') {
      return customKey ? { 'X-API-Key': customKey } : {};
    }
    return {}; // anonymous
  };

  const executeProxyCall = async () => {
    setLoading(true);
    setExecutionResult(null);

    const startTime = Date.now();
    const corrId = correlationId || `req_${Math.random().toString(36).substring(2, 10)}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-ID': corrId,
      ...resolveAuthHeaders(),
    };

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(httpMethod) && requestBody.trim()) {
      fetchOptions.body = requestBody;
    }

    try {
      const res = await fetch(`/proxy${endpointPath}`, fetchOptions);
      const latencyMs = Date.now() - startTime;
      const text = await res.text();
      let bodyData: any = {};
      try {
        bodyData = JSON.parse(text);
      } catch {
        bodyData = { raw: text };
      }

      // Analyze Pipeline
      const authOk = res.status !== 401;
      const rbacOk = res.status !== 403;
      const upstreamSent = authOk && rbacOk;
      const upstreamOk = res.status >= 200 && res.status < 300;

      setExecutionResult({
        status: res.status,
        body: bodyData,
        headers: {
          'x-correlation-id': res.headers.get('x-correlation-id') || corrId,
          'content-type': res.headers.get('content-type') || 'application/json',
          'x-proxy-gateway': res.headers.get('x-proxy-gateway') || 'Thales-STA-Granular-RBAC-Proxy/1.0',
        },
        latencyMs,
        timestamp: new Date().toISOString(),
        correlationId: corrId,
        pipeline: {
          authOk,
          authReason: res.status === 401 ? bodyData?.message : undefined,
          rbacOk,
          rbacReason: res.status === 403 ? (bodyData?.details?.reason || bodyData?.reason || 'Improper rights') : undefined,
          upstreamSent,
          upstreamOk,
          upstreamReason: !upstreamOk && upstreamSent ? (bodyData?.message || bodyData?.error) : undefined,
          auditRecorded: true,
        },
      });

      onLogGenerated();
    } catch (err: any) {
      setExecutionResult({
        status: 500,
        body: { error: 'Network error', message: err.message },
        headers: {},
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        correlationId: corrId,
        pipeline: {
          authOk: false,
          rbacOk: false,
          upstreamSent: false,
          upstreamOk: false,
          auditRecorded: false,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurlSnippet = () => {
    const authHeaders = resolveAuthHeaders();
    let headerStr = Object.entries(authHeaders)
      .map(([k, v]) => `  -H "${k}: ${v}" \\\n`)
      .join('');
    if (!headerStr) headerStr = '  # No credentials (Anonymous)\n';

    const origin = window.location.origin;
    let dataStr = '';
    if (['POST', 'PUT', 'PATCH'].includes(httpMethod) && requestBody.trim()) {
      dataStr = `  -d '${requestBody.replace(/'/g, "'\\''")}' \\\n`;
    }

    return `curl -X ${httpMethod} "${origin}/proxy${endpointPath}" \\\n  -H "Content-Type: application/json" \\\n${headerStr}${dataStr}  -i`;
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Mission Card */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Interactive Proxy Gateway & Policy Tester
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Simulate service account and OIDC caller requests against Thales SafeNet Trusted Access endpoints.
              The proxy intercepts calls, enforces granular RBAC permissions, strips caller keys, injects the master STA credentials, and produces structured audit trails.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('audit')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              View Generated Audit Trail →
            </button>
          </div>
        </div>

        {/* Quick Scenarios Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Preset Test Scenarios:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {scenarios.map(s => (
              <button
                key={s.id}
                onClick={() => handleApplyScenario(s)}
                className="text-left p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 transition-all text-xs group"
              >
                <div className="font-medium text-slate-900 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center justify-between">
                  <span>{s.label}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{s.method}</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {s.description}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1 font-mono">
                  <span>Expected:</span>
                  <span className={s.expected.includes('SUCCESS') ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    {s.expected}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Request Form & Execution Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request Builder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-500" />
              <span>1. Configure Inbound Request</span>
            </h3>

            {/* Caller Identity Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Caller Identity & Credentials:
              </label>
              <select
                value={callerType}
                onChange={e => setCallerType(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="sa_helpdesk">
                  Service Account: ServiceNow Helpdesk Bot (Role: helpdesk-operator)
                </option>
                <option value="sa_hr">
                  Service Account: Workday HR Sync (Role: hr-onboarding-service)
                </option>
                <option value="sa_siem">
                  Service Account: Splunk SIEM Audit Collector (Role: security-auditor)
                </option>
                <option value="sa_devops">
                  Service Account: DevOps CI/CD App Deployer (Role: app-integrator)
                </option>
                <option value="oidc_helpdesk">
                  OpenID Connect: Alice Smith [OIDC JWT Bearer] (Role: helpdesk-operator)
                </option>
                <option value="anonymous">
                  Anonymous Caller (No Credentials - Demonstrates 401 Auth Failure)
                </option>
                <option value="custom">
                  Custom API Key / Bearer Token
                </option>
              </select>
            </div>

            {callerType === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Custom Key or Token:
                </label>
                <input
                  type="text"
                  placeholder="e.g. sta_proxy_sk_... or eyJhbGciOi..."
                  value={customKey}
                  onChange={e => setCustomKey(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* HTTP Method & Target Path */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                HTTP Method & Thales STA Target Path:
              </label>
              <div className="flex gap-2">
                <select
                  value={httpMethod}
                  onChange={e => setHttpMethod(e.target.value as any)}
                  className="w-28 text-xs font-mono font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-2 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-400">/proxy</span>
                  <input
                    type="text"
                    value={endpointPath}
                    onChange={e => setEndpointPath(e.target.value)}
                    placeholder="/api/v1/users/usr_4821/unlock"
                    className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-16 pr-3 py-2 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Request Body (if POST/PUT) */}
            {['POST', 'PUT', 'PATCH'].includes(httpMethod) && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  JSON Request Payload:
                </label>
                <textarea
                  rows={4}
                  value={requestBody}
                  onChange={e => setRequestBody(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            {/* Headers Preview */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Injected Headers by Client:</span>
                <span className="text-[10px] text-slate-400 font-mono">Simulated TLS Connection</span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                <div>Content-Type: application/json</div>
                {Object.entries(resolveAuthHeaders()).map(([k, v]) => (
                  <div key={k} className="text-indigo-600 dark:text-indigo-400 truncate">
                    {k}: {v.slice(0, 32)}...
                  </div>
                ))}
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={executeProxyCall}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                <span>Send Request via Proxy</span>
              </button>

              <button
                onClick={() => copyToClipboard(getCurlSnippet(), 'curl')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedType === 'curl' ? 'Copied cURL!' : 'Copy cURL'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Pipeline & Result Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-500" />
                <span>2. Gateway Policy Decision Trace</span>
              </span>
              {executionResult && (
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {executionResult.latencyMs}ms
                </span>
              )}
            </h3>

            {/* Pipeline Steps */}
            <div className="space-y-2.5 text-xs">
              {/* Step 1: Auth */}
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-2.5">
                <div className="mt-0.5">
                  {!executionResult ? (
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                  ) : executionResult.pipeline.authOk ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">
                    Step 1: Inbound Authentication
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {!executionResult
                      ? 'Verify Service Account API Key or OpenID Connect JWT signature'
                      : executionResult.pipeline.authOk
                      ? 'Identity verified and claims resolved.'
                      : executionResult.pipeline.authReason}
                  </div>
                </div>
              </div>

              {/* Step 2: RBAC Evaluation */}
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-2.5">
                <div className="mt-0.5">
                  {!executionResult ? (
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                  ) : executionResult.pipeline.rbacOk ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">
                    Step 2: Granular RBAC Evaluation
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {!executionResult
                      ? 'Match method & path to required granular Thales STA permission'
                      : executionResult.pipeline.rbacOk
                      ? 'Authorized. Caller possesses required permission.'
                      : executionResult.pipeline.rbacReason}
                  </div>
                </div>
              </div>

              {/* Step 3: Upstream Thales STA */}
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-2.5">
                <div className="mt-0.5">
                  {!executionResult ? (
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                  ) : !executionResult.pipeline.upstreamSent ? (
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 text-center text-[10px] text-slate-400">-</div>
                  ) : executionResult.pipeline.upstreamOk ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">
                    Step 3: Upstream Thales STA Execution
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {!executionResult
                      ? 'Forward with injected Master STA credentials over TLS'
                      : !executionResult.pipeline.upstreamSent
                      ? 'Skipped (blocked at proxy perimeter before reaching STA)'
                      : executionResult.pipeline.upstreamOk
                      ? 'STA API executed operation successfully.'
                      : `Upstream rejected: ${executionResult.pipeline.upstreamReason}`}
                  </div>
                </div>
              </div>

              {/* Step 4: Security Audit Log */}
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-2.5">
                <div className="mt-0.5">
                  {!executionResult ? (
                    <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-900 dark:text-white">
                    Step 4: Structured Audit Log Emitted
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {!executionResult
                      ? 'Captured timestamp, userID, action, auth status, exact reason'
                      : 'Logged with correlation ID ' + executionResult.correlationId}
                  </div>
                </div>
              </div>
            </div>

            {/* Execution Result Details */}
            {executionResult && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                        executionResult.status >= 200 && executionResult.status < 300
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : executionResult.status === 403
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                      }`}
                    >
                      HTTP {executionResult.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {executionResult.status === 200 || executionResult.status === 201
                        ? 'Authorized & Executed'
                        : executionResult.status === 403
                        ? 'Blocked: Improper Rights'
                        : executionResult.status === 401
                        ? 'Blocked: Auth Failed'
                        : 'Failed on Identity Provider'}
                    </span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(executionResult.body, null, 2), 'body')}
                    className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedType === 'body' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg bg-slate-950 p-3 text-[11px] font-mono text-emerald-400 border border-slate-800">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(executionResult.body, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
