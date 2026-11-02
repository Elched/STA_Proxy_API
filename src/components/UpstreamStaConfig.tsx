import React, { useState, useEffect } from 'react';
import {
  Server,
  Lock,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Database,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { UpstreamStaConfig } from '../types.ts';

interface UpstreamStaConfigProps {
  onConfigUpdated: () => void;
}

export const UpstreamStaConfigView: React.FC<UpstreamStaConfigProps> = ({ onConfigUpdated }) => {
  const [config, setConfig] = useState<UpstreamStaConfig | null>(null);
  const [tenantSummary, setTenantSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showMasterKey, setShowMasterKey] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Form states
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [tenantId, setTenantId] = useState<string>('');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [masterApiKey, setMasterApiKey] = useState<string>('');
  const [failureSim, setFailureSim] = useState<string>('none');
  const [verifyTls, setVerifyTls] = useState<boolean>(true);

  const loadData = async () => {
    try {
      const [confRes, mockRes] = await Promise.all([
        fetch('/api/sta/config'),
        fetch('/api/sta/mock-state'),
      ]);
      const confData = await confRes.json();
      const mockData = await mockRes.json();

      setConfig(confData);
      setTenantSummary(mockData);

      setMode(confData.mode || 'mock');
      setTenantId(confData.tenantId || 'STA-DEMO-TENANT');
      setApiBaseUrl(confData.apiBaseUrl || 'https://api.safenetid.com');
      setMasterApiKey(confData.masterApiKey || '');
      setFailureSim(confData.simulateUpstreamFailure || 'none');
      setVerifyTls(confData.verifyTls ?? true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/sta/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          tenantId,
          apiBaseUrl,
          masterApiKey,
          simulateUpstreamFailure: failureSim,
          verifyTls,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onConfigUpdated();
        await loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetMockData = async () => {
    if (!confirm('Reset all simulated Thales STA users, lockouts, and authenticators to original baseline?')) {
      return;
    }
    const res = await fetch('/api/sta/reset-mock', { method: 'POST' });
    if (res.ok) {
      await loadData();
      onConfigUpdated();
    }
  };

  if (loading || !config) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Loading Thales SafeNet Trusted Access configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview & Security Context */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Upstream Thales SafeNet Trusted Access (STA) Connector
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              The API Proxy stores and protects the Master Thales STA API Key on the server side. Downstream service accounts never receive or see this key.
            </p>
          </div>

          <a
            href="https://thalesdocs.com/sta/api/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Thales STA API Docs</span>
          </a>
        </div>
      </div>

      {/* Main Settings Form & Failure Injection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <form onSubmit={handleSaveConfig} className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-500" />
              <span>Upstream Connection Settings</span>
            </h3>

            {/* Mode Toggle */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Upstream Target Engine:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('mock')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    mode === 'mock'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold flex items-center justify-between">
                    <span>High-Fidelity Mock Tenant</span>
                    {mode === 'mock' && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Safe testing sandbox with simulated users, locked accounts, and tokens.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('live')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    mode === 'live'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold flex items-center justify-between">
                    <span>Live Thales STA Tenant</span>
                    {mode === 'live' && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Direct HTTPS forward to api.safenetid.com with your master API key.
                  </div>
                </button>
              </div>
            </div>

            {/* Tenant ID */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                STA Tenant ID / Code:
              </label>
              <input
                type="text"
                value={tenantId ?? ''}
                onChange={e => setTenantId(e.target.value)}
                placeholder="e.g. STA-CORP-PRODUCTION-EU"
                className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
              />
            </div>

            {/* Base URL */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                STA REST API Base URL:
              </label>
              <input
                type="text"
                value={apiBaseUrl ?? ''}
                onChange={e => setApiBaseUrl(e.target.value)}
                placeholder="https://api.safenetid.com"
                className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Standard: https://api.safenetid.com (EU/US/APAC endpoints supported)
              </span>
            </div>

            {/* Master API Key */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Master Thales STA API Key (Protected by Proxy):
              </label>
              <div className="relative">
                <input
                  type={showMasterKey ? 'text' : 'password'}
                  value={masterApiKey ?? ''}
                  onChange={e => setMasterApiKey(e.target.value)}
                  placeholder="Paste tenant-level master STA secret key..."
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-10 py-2 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowMasterKey(!showMasterKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showMasterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 block">
                Security note: This key has full administrative rights over accounts, applications, users, and policies. It is kept secret inside the proxy and never returned in logs or API responses.
              </span>
            </div>

            {/* Failure Injection Simulation */}
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Simulate Upstream Provider Failure (Demonstration):</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Test how the proxy logs failures that occur on the identity provider side (HTTP 503, 429, 500):
              </p>
              <select
                value={failureSim}
                onChange={e => setFailureSim(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5"
              >
                <option value="none">Normal Operation (Pass-through / Mock 200)</option>
                <option value="maintenance_503">Simulate STA Maintenance (HTTP 503)</option>
                <option value="rate_limit_429">Simulate STA Tenant Rate Limit (HTTP 429)</option>
                <option value="internal_error_500">Simulate STA Identity Store Timeout (HTTP 500)</option>
              </select>
            </div>

            {/* TLS Verification */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tls_verify"
                checked={verifyTls}
                onChange={e => setVerifyTls(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="tls_verify" className="text-slate-700 dark:text-slate-300 select-none">
                Enforce strict TLS 1.3 certificate validation on upstream calls
              </label>
            </div>

            {/* Submit */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors shadow-xs disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Connector Settings'}
              </button>

              {saveSuccess && (
                <span className="text-emerald-600 text-xs flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Settings updated successfully!</span>
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Right: Mock Tenant Entities Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <span>Simulated STA Tenant State</span>
              </h3>
              <button
                onClick={handleResetMockData}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset State</span>
              </button>
            </div>

            {tenantSummary && (
              <div className="space-y-3">
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Users in Tenant</div>
                    <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                      {tenantSummary.userCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Locked Accounts</div>
                    <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                      {tenantSummary.lockedCount}
                    </div>
                  </div>
                </div>

                {/* Users List */}
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Users & Authenticators:
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {tenantSummary.rawUsers.map((u: any) => (
                      <div
                        key={u.id}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 flex items-center justify-between text-[11px]"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-200">
                            {u.firstName} {u.lastName} ({u.username})
                          </div>
                          <div className="text-slate-400 text-[10px] font-mono">{u.id} · {u.email}</div>
                          <div className="text-[10px] text-indigo-500 mt-0.5">
                            Tokens: {u.authenticators.map((t: any) => `${t.type} (${t.status})`).join(', ') || 'None'}
                          </div>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {u.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Protected SSO Applications */}
                <div>
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Configured SSO Applications:
                  </div>
                  <div className="space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    {tenantSummary.rawApps.map((a: any) => (
                      <div key={a.id} className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 flex justify-between">
                        <span>{a.name}</span>
                        <span className="text-[10px] text-slate-400">{a.protocol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
