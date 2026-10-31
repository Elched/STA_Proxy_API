import React, { useState, useEffect } from 'react';
import {
  Server,
  Radio,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Terminal,
  Activity,
  Lock,
  Layers,
  FileCode,
  Shield,
  HelpCircle
} from 'lucide-react';

interface SiemConfig {
  enabled: boolean;
  protocol: 'UDP' | 'TCP' | 'TLS' | 'SPLUNK_HEC' | 'WEBHOOK';
  host: string;
  port: number;
  format: 'RFC_5424' | 'RFC_3164' | 'CEF' | 'JSON';
  facility: number;
  appName: string;
  tlsVerify?: boolean;
  hecToken?: string;
  webhookUrl?: string;
}

interface SiemStatus {
  enabled: boolean;
  protocol: string;
  host: string;
  port: number;
  format: string;
  eventsSent: number;
  eventsFailed: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastPayloadSample: string | null;
  tlsVerify?: boolean;
}

export const SiemForwarderConfigView: React.FC = () => {
  const [config, setConfig] = useState<SiemConfig>({
    enabled: false,
    protocol: 'UDP',
    host: '127.0.0.1',
    port: 514,
    format: 'RFC_5424',
    facility: 4,
    appName: 'sta-api-proxy',
    tlsVerify: true,
    hecToken: '',
    webhookUrl: '',
  });

  const [status, setStatus] = useState<SiemStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Guide tabs
  const [activeGuideTab, setActiveGuideTab] = useState<'splunk' | 'elk' | 'qradar' | 'rsyslog'>('splunk');

  // Test event scenario
  const [testScenario, setTestScenario] = useState<'SUCCESS' | 'FORBIDDEN' | 'AUTH_FAILED'>('FORBIDDEN');

  const fetchSiemData = async () => {
    try {
      const res = await fetch('/api/siem/config');
      const data = await res.json();
      setConfig(data.config);
      setStatus(data.status);
    } catch (err) {
      console.error('Failed to load SIEM config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSiemData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/siem/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setConfig(data.config);
      setStatus(data.status);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save SIEM config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/siem/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionStatus: testScenario,
          format: config.format,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.siemStatus) {
        setStatus(data.siemStatus);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        Loading SIEM configuration and real-time streaming telemetry...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${config.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {config.enabled ? 'ACTIVE STREAMING' : 'DISABLED'}
              </span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Real-Time SIEM & Syslog Log Forwarding
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Forward security audit events asynchronously in real time to your Security Information and Event Management (SIEM) system using RFC-5424, RFC-3164, CEF, or Splunk HEC over UDP, TCP, or TLS.
            </p>
          </div>

          {status && (
            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300">
                <span className="text-slate-400">Transmitted: </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{status.eventsSent}</span>
              </div>
              {status.eventsFailed > 0 && (
                <div className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                  <span className="text-rose-400">Failed: </span>
                  <span className="font-bold tabular-nums">{status.eventsFailed}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Configuration & Testing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <form onSubmit={handleSave} className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-500" />
                <span>SIEM Forwarder Parameters</span>
              </h3>

              {/* Master Switch */}
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Enable Real-Time Dispatch</span>
              </label>
            </div>

            {/* Protocol Selector */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Transmission Protocol:
              </label>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                {(['UDP', 'TCP', 'TLS', 'SPLUNK_HEC', 'WEBHOOK'] as const).map(proto => (
                  <button
                    key={proto}
                    type="button"
                    onClick={() => setConfig({ ...config, protocol: proto, port: proto === 'SPLUNK_HEC' ? 8088 : proto === 'TLS' ? 6514 : 514 })}
                    className={`py-2 px-2.5 rounded-lg border text-center transition-all ${
                      config.protocol === proto
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {proto === 'SPLUNK_HEC' ? 'Splunk HEC' : proto === 'TLS' ? 'Syslog TLS' : proto === 'WEBHOOK' ? 'HTTP Webhook' : `Syslog ${proto}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Log Wire Format:
              </label>
              <select
                value={config.format}
                onChange={e => setConfig({ ...config, format: e.target.value as any })}
                className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2"
              >
                <option value="RFC_5424">RFC-5424 Structured Syslog (Recommended - Includes staAudit structured data)</option>
                <option value="RFC_3164">RFC-3164 Traditional BSD Syslog (Legacy Unix / Rsyslog)</option>
                <option value="CEF">CEF - Common Event Format (Micro Focus ArcSight, IBM QRadar)</option>
                <option value="JSON">Raw Structured JSON (Splunk HEC, Datadog, Elasticsearch)</option>
              </select>
            </div>

            {/* Host & Port */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Destination Host / IP:
                </label>
                <input
                  type="text"
                  required
                  value={config.host}
                  onChange={e => setConfig({ ...config, host: e.target.value })}
                  placeholder="e.g. siem.corp.internal or 192.168.10.50"
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Port:
                </label>
                <input
                  type="number"
                  required
                  value={config.port}
                  onChange={e => setConfig({ ...config, port: parseInt(e.target.value, 10) || 514 })}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* TLS Certificate Verification (when TLS is selected) */}
            {config.protocol === 'TLS' && (
              <div className="p-3 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.tlsVerify !== false}
                    onChange={e => setConfig({ ...config, tlsVerify: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Strict TLS Certificate Validation (Zero-Trust Standard)
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Enforces valid X.509 certificate trust chain to prevent Man-in-the-Middle (MITM) attacks. Uncheck only in testing environments with self-signed test certs.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Splunk HEC Token (if HEC selected) */}
            {config.protocol === 'SPLUNK_HEC' && (
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Splunk HEC Token:
                </label>
                <input
                  type="password"
                  value={config.hecToken || ''}
                  onChange={e => setConfig({ ...config, hecToken: e.target.value })}
                  placeholder="e.g. b8c4e512-8812-4f30-8041-39c298e10492"
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Webhook URL (if Webhook selected) */}
            {config.protocol === 'WEBHOOK' && (
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full HTTP Webhook URL:
                </label>
                <input
                  type="text"
                  value={config.webhookUrl || ''}
                  onChange={e => setConfig({ ...config, webhookUrl: e.target.value })}
                  placeholder="https://http-intake.logs.datadoghq.com/api/v2/logs"
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Facility & App Name */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Syslog Facility:
                </label>
                <select
                  value={config.facility}
                  onChange={e => setConfig({ ...config, facility: parseInt(e.target.value, 10) })}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5"
                >
                  <option value={4}>4 - authpriv (Security / Authorization)</option>
                  <option value={10}>10 - auth (Security / Auth)</option>
                  <option value={16}>16 - local0</option>
                  <option value={17}>17 - local1</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  App Name Tag:
                </label>
                <input
                  type="text"
                  value={config.appName}
                  onChange={e => setConfig({ ...config, appName: e.target.value })}
                  className="w-full text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-50"
              >
                {saving ? 'Applying...' : 'Save SIEM Settings'}
              </button>

              {saveSuccess && (
                <span className="text-emerald-600 text-xs flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>SIEM configuration saved successfully!</span>
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Right Column: Live Wire Packet Tester (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-500" />
                <span>Real-Time SIEM Wire Tester</span>
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dispatch an instant synthetic security audit event to verify socket connectivity, port reachability, and payload parsing against your SIEM:
            </p>

            {/* Test Scenario Selector */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Event Scenario to Test:
              </label>
              <select
                value={testScenario}
                onChange={e => setTestScenario(e.target.value as any)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-1.5"
              >
                <option value="FORBIDDEN">Improper Rights Violation (Blocked by RBAC - Severity Warning)</option>
                <option value="SUCCESS">Authorized User Unlock (Executed on STA - Severity Notice)</option>
                <option value="AUTH_FAILED">Unauthenticated Token (Auth Failure - Severity Warning)</option>
              </select>
            </div>

            {/* Execute Test Button */}
            <button
              onClick={handleSendTest}
              disabled={testing}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Dispatch Test Event to SIEM</span>
            </button>

            {/* Test Result Callout */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border space-y-1.5 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {testResult.success ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                  <span>{testResult.success ? 'Transmission Successful' : 'Transmission Alert'}</span>
                </div>
                <div className="text-[11px] font-mono leading-relaxed opacity-90">
                  {testResult.message}
                </div>
              </div>
            )}

            {/* Wire Payload Inspector */}
            {testResult?.wirePayload && (
              <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span>Raw Wire Payload Transmitted:</span>
                  <button
                    onClick={() => copyToClipboard(testResult.wirePayload, 'wire_sample')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedKey === 'wire_sample' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-slate-950 text-indigo-300 font-mono text-[10px] break-all whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-800">
                  {testResult.wirePayload}
                </pre>
              </div>
            )}

            {/* Last Transmission Error if any */}
            {status?.lastError && !testResult && (
              <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-[11px]">
                <div className="font-semibold">Last Transmission Warning:</div>
                <div className="font-mono mt-0.5">{status.lastError}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SIEM Configuration Guides Section */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileCode className="w-4 h-4 text-indigo-500" />
            <span>SIEM Integration & Listener Configuration Guide</span>
          </h3>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
            <button
              onClick={() => setActiveGuideTab('splunk')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeGuideTab === 'splunk' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold' : 'text-slate-500'
              }`}
            >
              Splunk
            </button>
            <button
              onClick={() => setActiveGuideTab('elk')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeGuideTab === 'elk' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold' : 'text-slate-500'
              }`}
            >
              Elasticsearch / ELK
            </button>
            <button
              onClick={() => setActiveGuideTab('qradar')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeGuideTab === 'qradar' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold' : 'text-slate-500'
              }`}
            >
              QRadar / ArcSight
            </button>
            <button
              onClick={() => setActiveGuideTab('rsyslog')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeGuideTab === 'rsyslog' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold' : 'text-slate-500'
              }`}
            >
              Rsyslog / Syslog-ng
            </button>
          </div>
        </div>

        {activeGuideTab === 'splunk' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              In Splunk, you can ingest the Thales STA Proxy audit logs either via <strong>Syslog UDP/TCP port 514</strong> or through the <strong>Splunk HTTP Event Collector (HEC)</strong> on port 8088:
            </p>

            <div className="space-y-1.5">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Method A: Syslog UDP listener in Splunk <code className="font-mono text-slate-500">inputs.conf</code>
              </div>
              <pre className="p-3 rounded-lg bg-slate-950 text-slate-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
{`[udp://514]
connection_host = ip
sourcetype = thales:sta:audit
index = identity_security`}
              </pre>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Method B: Splunk HTTP Event Collector (HEC)
              </div>
              <p className="text-[11px] text-slate-500">
                1. Navigate to <em>Settings &gt; Data Inputs &gt; HTTP Event Collector</em>. Create a new token for <code className="font-mono">thales-sta-proxy</code>.<br />
                2. Set protocol to <code className="font-mono">SPLUNK_HEC</code>, host to your Splunk indexer, and paste the HEC token.
              </p>
            </div>
          </div>
        )}

        {activeGuideTab === 'elk' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              In the Elastic Stack (Logstash / Elasticsearch), configure a Syslog or TCP input plugin:
            </p>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
{`input {
  syslog {
    port => 514
    type => "thales_sta_proxy"
  }
}

filter {
  if [type] == "thales_sta_proxy" {
    grok {
      match => { "message" => "<%{POSINT:syslog_pri}>%{POSINT:syslog_version} %{TIMESTAMP_ISO8601:timestamp} %{DATA:hostname} %{DATA:app_name} %{DATA:proc_id} %{DATA:correlation_id} %{GREEDYDATA:syslog_message}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["https://elasticsearch.corp:9200"]
    index => "sta-proxy-audit-%{+YYYY.MM.dd}"
  }
}`}
            </pre>
          </div>
        )}

        {activeGuideTab === 'qradar' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              For <strong>IBM QRadar</strong> or <strong>Micro Focus ArcSight ESM</strong>, select the <code className="font-mono text-indigo-600 dark:text-indigo-400">CEF</code> wire format. The proxy outputs standard Common Event Format records:
            </p>
            <pre className="p-3 rounded-lg bg-slate-950 text-indigo-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
{`CEF:0|Thales|SafeNet Trusted Access Granular Proxy|1.0.0|users.unlock|STA Action Authorized|3|duser=sa_servicenow src=192.168.10.45 act=users.unlock app=POST request=/api/v1/users/usr_4821/unlock outcome=SUCCESS reason=none cn1=42 cn1Label=latencyMs externalId=req_9901`}
            </pre>
            <p className="text-[11px] text-slate-500">
              Configure a standard Syslog Log Source in QRadar targeting port 514 UDP/TCP with protocol <code className="font-mono">Syslog</code> and DSM type <code className="font-mono">Universal CEF</code>.
            </p>
          </div>
        )}

        {activeGuideTab === 'rsyslog' && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              To relay logs through a local <strong>Rsyslog</strong> or <strong>Syslog-ng</strong> daemon to a central SIEM aggregator:
            </p>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-300 font-mono text-[11px] border border-slate-800 overflow-x-auto">
{`# /etc/rsyslog.d/40-sta-proxy.conf
# Listen for STA Proxy Syslog on UDP 514
module(load="imudp")
input(type="imudp" port="514")

# Forward all authpriv events from sta-api-proxy to central SIEM over TLS
authpriv.* action(type="omfwd" target="central-siem.enterprise.corp" port="6514" protocol="tcp" StreamDriver="gtls" StreamDriverMode="1")`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
