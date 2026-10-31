import React, { useState } from 'react';
import {
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle,
  ExternalLink,
  Code,
  Shield,
  FileText,
  UserCheck
} from 'lucide-react';
import { RbacRole, ServiceAccount } from '../types.ts';

interface ServiceAccountsManagerProps {
  serviceAccounts: ServiceAccount[];
  roles: RbacRole[];
  onAccountCreated: () => void;
  onNavigateTab: (tab: string) => void;
}

export const ServiceAccountsManager: React.FC<ServiceAccountsManagerProps> = ({
  serviceAccounts,
  roles,
  onAccountCreated,
  onNavigateTab,
}) => {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create SA Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [saName, setSaName] = useState<string>('');
  const [saDesc, setSaDesc] = useState<string>('');
  const [saRoles, setSaRoles] = useState<string[]>(['helpdesk-operator']);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // OIDC Token Generator State
  const [oidcSub, setOidcSub] = useState<string>('elena.rostova@enterprise.corp');
  const [oidcName, setOidcName] = useState<string>('Elena Rostova');
  const [oidcRole, setOidcRole] = useState<string>('helpdesk-operator');
  const [generatedJwt, setGeneratedJwt] = useState<string>('');
  const [decodedJwt, setDecodedJwt] = useState<any>(null);
  const [generatingOidc, setGeneratingOidc] = useState<boolean>(false);

  // Code snippet tab
  const [snippetTab, setSnippetTab] = useState<'python' | 'go' | 'node' | 'curl'>('python');

  const toggleShowKey = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateSa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saName || !saRoles.length) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/service-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saName,
          description: saDesc,
          roles: saRoles,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setSaName('');
        setSaDesc('');
        setSaRoles(['helpdesk-operator']);
        onAccountCreated();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSa = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this service account? Any background application using this key will immediately fail with 401 Unauthorized.')) {
      return;
    }
    const res = await fetch(`/api/service-accounts/${id}/revoke`, { method: 'POST' });
    if (res.ok) {
      onAccountCreated();
    }
  };

  const handleGenerateOidcToken = async () => {
    setGeneratingOidc(true);
    try {
      const res = await fetch('/api/oidc/test-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub: oidcSub,
          name: oidcName,
          roles: [oidcRole],
        }),
      });
      const data = await res.json();
      setGeneratedJwt(data.token);
      setDecodedJwt(data.decoded);
    } finally {
      setGeneratingOidc(false);
    }
  };

  // Code snippets
  const getSnippets = () => {
    const origin = window.location.origin;
    const sa = serviceAccounts[0] || { id: 'sa_servicenow_helpdesk', apiKey: 'sta_proxy_sk_helpdesk_7a9c2b81' };

    return {
      python: `import httpx

# External service account authenticates to proxy over TLS
PROXY_URL = "${origin}/proxy/api/v1/users/usr_4821/unlock"
PROXY_API_KEY = "${sa.apiKey}"

headers = {
    "X-API-Key": PROXY_API_KEY,
    "Content-Type": "application/json"
}

payload = {
    "reason": "Automated incident resolution by ITSM workflow"
}

with httpx.Client(verify=True) as client:
    response = client.post(PROXY_URL, headers=headers, json=payload)
    print(f"Status: {response.status_code}")
    print(response.json())
`,
      go: `package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
)

func main() {
    url := "${origin}/proxy/api/v1/users/usr_4821/unlock"
    payload := []byte(\`{"reason": "Automated unlocking via Go microservice"}\`)

    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
    req.Header.Set("X-API-Key", "${sa.apiKey}")
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Printf("HTTP Status: %d\\n%s\\n", resp.StatusCode, string(body))
}
`,
      node: `// Node.js Service Account Client
const PROXY_URL = '${origin}/proxy/api/v1/users/usr_4821/unlock';
const API_KEY = '${sa.apiKey}';

async function unlockUser() {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: 'ITSM Bot automated ticket resolution'
    })
  });

  const result = await response.json();
  console.log('Proxy Response:', response.status, result);
}

unlockUser();
`,
      curl: `curl -X POST "${origin}/proxy/api/v1/users/usr_4821/unlock" \\
  -H "X-API-Key: ${sa.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"reason": "Incident INC-9901 resolved"}' \\
  -i
`
    };
  };

  const snippets = getSnippets();

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Service Accounts & OpenID Connect (OIDC) M2M Authentication
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Enable microservices, ticketing bots, HR pipelines, and human users to securely communicate with the Thales STA API using least-privilege service credentials or corporate OIDC tokens.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Issue Service Account Key</span>
          </button>
        </div>
      </div>

      {/* Service Accounts Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Registered Service Accounts
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {serviceAccounts.length} active clients
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-[10px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Service Name & ID</th>
                <th className="py-2.5 px-3">API Key (X-API-Key)</th>
                <th className="py-2.5 px-3">Assigned Granular Roles</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Last Active</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {serviceAccounts.map(sa => {
                const isShowing = showKeys[sa.id] || false;
                const isRevoked = sa.status === 'revoked';

                return (
                  <tr key={sa.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{sa.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {sa.id} · {sa.description}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 dark:text-slate-300">
                          {isShowing ? sa.apiKey : `${sa.apiKey.slice(0, 14)}••••••••`}
                        </span>
                        <button
                          onClick={() => toggleShowKey(sa.id)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {isShowing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(sa.apiKey, sa.id)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {copiedId === sa.id && (
                          <span className="text-[10px] text-emerald-600 font-sans">Copied!</span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {sa.roles.map(rId => (
                          <span
                            key={rId}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                          >
                            {rId}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          !isRevoked
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {isRevoked ? 'REVOKED' : 'ACTIVE'}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 tabular-nums">
                      {sa.lastUsedAt ? new Date(sa.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      {!isRevoked && (
                        <button
                          onClick={() => handleRevokeSa(sa.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column Grid: OIDC Generator & Microservice Snippets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: OpenID Connect JWT Generator & Inspector (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-500" />
                <span>OpenID Connect (OIDC) JWT Token Generator</span>
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate simulated signed JWT Bearer tokens to test SSO integration with corporate IdPs (Okta, Keycloak, Ping, Microsoft Entra ID).
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  User Subject (sub / email):
                </label>
                <input
                  type="text"
                  value={oidcSub}
                  onChange={e => setOidcSub(e.target.value)}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Display Name:
                </label>
                <input
                  type="text"
                  value={oidcName}
                  onChange={e => setOidcName(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Embedded OIDC Role Claim:
                </label>
                <select
                  value={oidcRole}
                  onChange={e => setOidcRole(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-900 dark:text-white"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateOidcToken}
                disabled={generatingOidc}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
              >
                {generatingOidc ? 'Generating...' : 'Issue OIDC Bearer Token'}
              </button>

              {generatedJwt && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <span>Generated JWT:</span>
                    <button
                      onClick={() => copyToClipboard(generatedJwt, 'oidc_token')}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedId === 'oidc_token' ? 'Copied' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 text-indigo-300 font-mono text-[10px] break-all max-h-24 overflow-y-auto">
                    {generatedJwt}
                  </div>

                  {decodedJwt && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500">Decoded Claims:</span>
                      <pre className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300 mt-1">
                        {JSON.stringify(decodedJwt, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: M2M Microservice Code Snippets (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Code className="w-4 h-4 text-indigo-500" />
                <span>Microservice M2M Integration Snippets</span>
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              How another program (ServiceNow, Workday, SIEM, custom microservice) calls the API proxy over TLS:
            </p>

            {/* Language tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
              <button
                onClick={() => setSnippetTab('python')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  snippetTab === 'python' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Python (httpx)
              </button>
              <button
                onClick={() => setSnippetTab('go')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  snippetTab === 'go' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Go (net/http)
              </button>
              <button
                onClick={() => setSnippetTab('node')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  snippetTab === 'node' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Node.js
              </button>
              <button
                onClick={() => setSnippetTab('curl')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  snippetTab === 'curl' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                cURL
              </button>
            </div>

            {/* Snippet display */}
            <div className="relative">
              <button
                onClick={() => copyToClipboard(snippets[snippetTab], 'snippet')}
                className="absolute right-3 top-3 p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedId === 'snippet' ? 'Copied' : 'Copy'}</span>
              </button>
              <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-72">
                {snippets[snippetTab]}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Create SA Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Issue Service Account API Key
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSa} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Service / Application Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jira Service Management Integration"
                  value={saName}
                  onChange={e => setSaName(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production microservice automating account unlock requests"
                  value={saDesc}
                  onChange={e => setSaDesc(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Assign Granular Role:
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  {roles.map(r => (
                    <label key={r.id} className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saRoles.includes(r.id)}
                        onChange={() => {
                          if (saRoles.includes(r.id)) {
                            setSaRoles(saRoles.filter(id => id !== r.id));
                          } else {
                            setSaRoles([...saRoles, r.id]);
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-200">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{r.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
