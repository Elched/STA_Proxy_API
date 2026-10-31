import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Download,
  Copy,
  CheckCircle,
  XCircle,
  Lock,
  Shield,
  ChevronDown,
  ChevronRight,
  Play,
  Terminal,
  ExternalLink,
  Code,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Key,
  Layers
} from 'lucide-react';
import { RbacRole, ServiceAccount } from '../types.ts';

interface OpenApiDocViewerProps {
  roles: RbacRole[];
  serviceAccounts: ServiceAccount[];
  onNavigateTab: (tab: string) => void;
}

export const OpenApiDocViewer: React.FC<OpenApiDocViewerProps> = ({
  roles,
  serviceAccounts,
  onNavigateTab,
}) => {
  const [spec, setSpec] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [hideForbidden, setHideForbidden] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [expandedOps, setExpandedOps] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'interactive' | 'raw_json' | 'raw_yaml'>('interactive');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // In-docs "Try It Out" state
  const [tryOutActive, setTryOutActive] = useState<Record<string, boolean>>({});
  const [tryOutParams, setTryOutParams] = useState<Record<string, Record<string, string>>>({});
  const [tryOutBodies, setTryOutBodies] = useState<Record<string, string>>({});
  const [tryOutCaller, setTryOutCaller] = useState<string>('sa_helpdesk');
  const [tryOutResults, setTryOutResults] = useState<Record<string, { status: number; body: any; latencyMs: number }>>({});
  const [tryOutLoading, setTryOutLoading] = useState<Record<string, boolean>>({});

  const fetchSpec = async (role: string) => {
    setLoading(true);
    try {
      const url = role === 'all' ? '/api/openapi.json' : `/api/openapi.json?role=${encodeURIComponent(role)}`;
      const res = await fetch(url);
      const data = await res.json();
      setSpec(data);

      // Pre-expand first 3 operations
      const initialExpanded: Record<string, boolean> = {};
      let count = 0;
      if (data.paths) {
        for (const [pathKey, pathObj] of Object.entries(data.paths)) {
          for (const method of Object.keys(pathObj as any)) {
            if (count < 2) {
              initialExpanded[`${method}_${pathKey}`] = true;
              count++;
            }
          }
        }
      }
      setExpandedOps(initialExpanded);
    } catch (err) {
      console.error('Failed to load OpenAPI spec:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpec(selectedRole);
  }, [selectedRole]);

  const toggleOp = (key: string) => {
    setExpandedOps(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleDownload = (format: 'json' | 'yaml') => {
    const roleParam = selectedRole !== 'all' ? `?role=${selectedRole}` : '';
    window.open(`/api/openapi.${format}${roleParam}`, '_blank');
  };

  // Execute Try It Out
  const executeTryOut = async (method: string, pathTemplate: string, opKey: string) => {
    setTryOutLoading(prev => ({ ...prev, [opKey]: true }));
    const startTime = Date.now();

    // Substitute path params
    let actualPath = pathTemplate;
    const params = tryOutParams[opKey] || {};
    for (const [pName, pVal] of Object.entries(params)) {
      actualPath = actualPath.replace(`{${pName}}`, pVal);
    }

    // Default params if unsupplied
    actualPath = actualPath.replace('{userId}', 'usr_4821')
      .replace('{appId}', 'app_m365_sso')
      .replace('{policyId}', 'pol_mfa_all_cloud')
      .replace('{tokenId}', 'tok_mp_101');

    // Resolve Auth header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tryOutCaller === 'sa_helpdesk') {
      const sa = serviceAccounts.find(s => s.id === 'sa_servicenow_helpdesk');
      headers['X-API-Key'] = sa ? sa.apiKey : 'sta_proxy_sk_helpdesk_7a9c2b81';
    } else if (tryOutCaller === 'sa_hr') {
      const sa = serviceAccounts.find(s => s.id === 'sa_workday_hr');
      headers['X-API-Key'] = sa ? sa.apiKey : 'sta_proxy_sk_hrsync_5e2d1a49';
    } else if (tryOutCaller === 'sa_siem') {
      const sa = serviceAccounts.find(s => s.id === 'sa_splunk_siem');
      headers['X-API-Key'] = sa ? sa.apiKey : 'sta_proxy_sk_splunk_99f43c12';
    } else if (tryOutCaller === 'sa_devops') {
      const sa = serviceAccounts.find(s => s.id === 'sa_jenkins_ci');
      headers['X-API-Key'] = sa ? sa.apiKey : 'sta_proxy_sk_devops_38b19e76';
    } else if (tryOutCaller === 'anonymous') {
      // no auth header
    }

    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
    };

    if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
      fetchOptions.body = tryOutBodies[opKey] || '{}';
    }

    try {
      const res = await fetch(`/proxy${actualPath}`, fetchOptions);
      const text = await res.text();
      let bodyData: any = {};
      try {
        bodyData = JSON.parse(text);
      } catch {
        bodyData = { raw: text };
      }

      setTryOutResults(prev => ({
        ...prev,
        [opKey]: {
          status: res.status,
          body: bodyData,
          latencyMs: Date.now() - startTime,
        },
      }));
    } catch (err: any) {
      setTryOutResults(prev => ({
        ...prev,
        [opKey]: {
          status: 500,
          body: { error: err.message },
          latencyMs: Date.now() - startTime,
        },
      }));
    } finally {
      setTryOutLoading(prev => ({ ...prev, [opKey]: false }));
    }
  };

  // Parse tags and operations from spec
  const parsedOperations: Array<{
    key: string;
    path: string;
    method: string;
    tag: string;
    op: any;
  }> = [];

  if (spec && spec.paths) {
    for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
      for (const [methodStr, opItem] of Object.entries(pathItem as any)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(methodStr)) {
          const tag = (opItem as any).tags?.[0] || 'General';
          parsedOperations.push({
            key: `${methodStr}_${pathStr}`,
            path: pathStr,
            method: methodStr,
            tag,
            op: opItem,
          });
        }
      }
    }
  }

  // Filter operations
  const filteredOperations = parsedOperations.filter(item => {
    if (selectedTag !== 'ALL' && item.tag !== selectedTag) {
      return false;
    }
    if (hideForbidden && selectedRole !== 'all' && item.op['x-is-permitted-for-role'] === false) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.path.toLowerCase().includes(q) ||
        item.op.summary?.toLowerCase().includes(q) ||
        item.op['x-required-permission']?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const allTags = ['ALL', 'Users', 'Authenticators', 'Applications', 'Policies', 'Audit'];

  return (
    <div className="space-y-6">
      {/* Top Banner & Spec Overview */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                OpenAPI 3.0.3
              </span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Dynamic Swagger / OpenAPI Documentation
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Dynamically generated API specification reflecting the current Granular RBAC permissions, required scopes, and Thales STA upstream endpoints. Filter by role to inspect exact granted permissions.
            </p>
          </div>

          {/* Download & View Mode Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
              <button
                onClick={() => setViewMode('interactive')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  viewMode === 'interactive'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Interactive Docs
              </button>
              <button
                onClick={() => setViewMode('raw_json')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  viewMode === 'raw_json'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Raw JSON
              </button>
              <button
                onClick={() => setViewMode('raw_yaml')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  viewMode === 'raw_yaml'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Raw YAML
              </button>
            </div>

            <button
              onClick={() => handleDownload('json')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>openapi.json</span>
            </button>
            <button
              onClick={() => handleDownload('yaml')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>openapi.yaml</span>
            </button>
          </div>
        </div>

        {/* Role Perspective Filter Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>View API Spec as Role:</span>
            </span>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="all">Full Specification (All Roles & Full Catalog)</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.permissions.length} perms)
                </option>
              ))}
            </select>
          </div>

          {selectedRole !== 'all' && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideForbidden}
                  onChange={e => setHideForbidden(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Hide endpoints forbidden for this role</span>
              </label>

              <span className="text-slate-400">|</span>

              <span className="text-[11px] text-slate-500">
                Permitted: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{parsedOperations.filter(p => p.op['x-is-permitted-for-role']).length}</strong> / {parsedOperations.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'interactive' && (
        <>
          {/* Search & Tag Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                    selectedTag === tag
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs font-semibold'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by endpoint, summary or scope..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white pl-9 pr-3 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Endpoints List */}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Generating dynamic OpenAPI specifications...
            </div>
          ) : filteredOperations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              No endpoints match the current filter or search criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOperations.map(item => {
                const isExpanded = expandedOps[item.key] || false;
                const isPermitted = item.op['x-is-permitted-for-role'] ?? true;
                const isTryOutOpen = tryOutActive[item.key] || false;
                const result = tryOutResults[item.key];
                const isExecuting = tryOutLoading[item.key] || false;

                const methodBadgeColor = {
                  get: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
                  post: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                  put: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                  delete: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                  patch: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
                }[item.method] || 'bg-slate-100 text-slate-800';

                return (
                  <div
                    key={item.key}
                    className={`rounded-xl border transition-all ${
                      isPermitted
                        ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        : 'border-amber-200/80 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10'
                    } overflow-hidden shadow-2xs`}
                  >
                    {/* Operation Accordion Header */}
                    <div
                      onClick={() => toggleOp(item.key)}
                      className="p-3 sm:px-4 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border uppercase shrink-0 ${methodBadgeColor}`}>
                          {item.method}
                        </span>

                        <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.path}
                        </span>

                        <span className="hidden md:inline-block text-slate-400 font-sans truncate">
                          — {item.op.summary}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {/* Scope badge */}
                        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {item.op['x-required-permission']}
                        </span>

                        {/* Permitted for role badge */}
                        {selectedRole !== 'all' && (
                          isPermitted ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Permitted</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                              <Lock className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Forbidden (403)</span>
                            </span>
                          )
                        )}

                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {/* Expanded Operation Body */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800 p-4 sm:p-5 space-y-4 text-xs bg-slate-50/40 dark:bg-slate-950/40">
                        {/* Summary & RBAC Callout */}
                        <div className="space-y-1.5">
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                            {item.op.description?.split('\n\n')[0]}
                          </p>

                          <div className="p-3 rounded-lg border border-indigo-100 dark:border-indigo-950 bg-indigo-50/50 dark:bg-indigo-950/30 text-[11px] space-y-1">
                            <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Granular RBAC Security Constraint</span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">
                              Requires Permission Scope: <code className="font-mono text-indigo-700 dark:text-indigo-300 font-semibold">{item.op['x-required-permission']}</code>
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              Permitted Roles: {item.op['x-permitted-role-names']?.join(', ')}
                            </div>
                          </div>
                        </div>

                        {/* Parameters Table */}
                        {item.op.parameters && item.op.parameters.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              Parameters
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] text-slate-500 uppercase font-semibold">
                                  <tr>
                                    <th className="py-2 px-3">Name</th>
                                    <th className="py-2 px-3">In</th>
                                    <th className="py-2 px-3">Type</th>
                                    <th className="py-2 px-3">Required</th>
                                    <th className="py-2 px-3">Description</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {item.op.parameters.map((p: any) => (
                                    <tr key={p.name}>
                                      <td className="py-2 px-3 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                                        {p.name}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-[10px] text-slate-500">
                                        {p.in}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-[10px] text-slate-500">
                                        {p.schema?.type || 'string'}
                                      </td>
                                      <td className="py-2 px-3">
                                        {p.required ? (
                                          <span className="text-rose-600 font-semibold text-[10px]">required</span>
                                        ) : (
                                          <span className="text-slate-400 text-[10px]">optional</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                                        {p.description}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Request Body (if any) */}
                        {item.op.requestBody && (
                          <div className="space-y-1.5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                              Request Body (application/json)
                            </div>
                            <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto border border-slate-800">
                              {JSON.stringify(
                                item.op.requestBody.content?.['application/json']?.schema || {},
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        )}

                        {/* Responses Grid */}
                        <div className="space-y-1.5">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                            Responses
                          </div>
                          <div className="space-y-1.5">
                            {Object.entries(item.op.responses || {}).map(([statusCode, respObj]: [string, any]) => (
                              <div
                                key={statusCode}
                                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-1 text-[11px]"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                                      statusCode.startsWith('2')
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                        : statusCode === '403'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                    }`}
                                  >
                                    HTTP {statusCode}
                                  </span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {respObj.description}
                                  </span>
                                </div>
                                {respObj.content?.['application/json']?.schema && (
                                  <div className="mt-1">
                                    <pre className="p-2 rounded bg-slate-950 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-36">
                                      {JSON.stringify(respObj.content['application/json'].schema, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Interactive "Try It Out" Runner within Docs */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                          <button
                            onClick={() => {
                              setTryOutActive(prev => ({ ...prev, [item.key]: !isTryOutOpen }));
                              // Pre-populate sample body if not set
                              if (!tryOutBodies[item.key] && item.op.requestBody) {
                                const sampleSchema = item.op.requestBody.content?.['application/json']?.schema;
                                const sampleObj: Record<string, any> = {};
                                if (sampleSchema?.properties) {
                                  for (const [k, v] of Object.entries(sampleSchema.properties as Record<string, any>)) {
                                    sampleObj[k] = v.example ?? (v.type === 'string' ? '' : v.type === 'boolean' ? true : 0);
                                  }
                                }
                                setTryOutBodies(prev => ({ ...prev, [item.key]: JSON.stringify(sampleObj, null, 2) }));
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 fill-indigo-500 text-indigo-500" />
                            <span>{isTryOutOpen ? 'Close Test Console' : 'Try it out against Proxy'}</span>
                          </button>

                          {isTryOutOpen && (
                            <div className="mt-3 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                  <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>Execute {item.method.toUpperCase()} {item.path}</span>
                                </span>

                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-slate-500">Test Caller:</span>
                                  <select
                                    value={tryOutCaller}
                                    onChange={e => setTryOutCaller(e.target.value)}
                                    className="text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-white"
                                  >
                                    <option value="sa_helpdesk">Service Account: Helpdesk Bot (helpdesk-operator)</option>
                                    <option value="sa_hr">Service Account: Workday HR Sync (hr-onboarding)</option>
                                    <option value="sa_siem">Service Account: Splunk SIEM (security-auditor)</option>
                                    <option value="sa_devops">Service Account: DevOps (app-integrator)</option>
                                    <option value="anonymous">Anonymous (No API Key)</option>
                                  </select>
                                </div>
                              </div>

                              {/* Body Input if POST/PUT */}
                              {['post', 'put', 'patch'].includes(item.method) && (
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Request JSON Body:
                                  </label>
                                  <textarea
                                    rows={4}
                                    value={tryOutBodies[item.key] || ''}
                                    onChange={e => setTryOutBodies(prev => ({ ...prev, [item.key]: e.target.value }))}
                                    className="w-full text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-white"
                                  />
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1">
                                <button
                                  onClick={() => executeTryOut(item.method, item.path, item.key)}
                                  disabled={isExecuting}
                                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                  {isExecuting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                                  <span>Execute</span>
                                </button>
                              </div>

                              {/* Result */}
                              {result && (
                                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                                        result.status >= 200 && result.status < 300
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : result.status === 403
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      }`}
                                    >
                                      HTTP {result.status}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      {result.latencyMs} ms
                                    </span>
                                  </div>
                                  <pre className="p-3 rounded bg-slate-950 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-48 border border-slate-800">
                                    {JSON.stringify(result.body, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Raw JSON Viewer */}
      {viewMode === 'raw_json' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-2xs">
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 font-mono">
            <span>openapi.json (OpenAPI 3.0.3)</span>
            <button
              onClick={() => copyToClipboard(JSON.stringify(spec, null, 2), 'raw_json')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedText === 'raw_json' ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="p-4 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-[600px] leading-relaxed">
            {JSON.stringify(spec, null, 2)}
          </pre>
        </div>
      )}

      {/* Raw YAML Viewer */}
      {viewMode === 'raw_yaml' && (
        <RawYamlViewer role={selectedRole} onCopy={copyToClipboard} copiedText={copiedText} />
      )}
    </div>
  );
};

// Subcomponent to fetch and render raw YAML
const RawYamlViewer: React.FC<{ role: string; onCopy: (text: string, label: string) => void; copiedText: string | null }> = ({
  role,
  onCopy,
  copiedText,
}) => {
  const [yaml, setYaml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchYaml = async () => {
      setLoading(true);
      try {
        const url = role === 'all' ? '/api/openapi.yaml' : `/api/openapi.yaml?role=${encodeURIComponent(role)}`;
        const res = await fetch(url);
        const text = await res.text();
        setYaml(text);
      } finally {
        setLoading(false);
      }
    };
    fetchYaml();
  }, [role]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-2xs">
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 font-mono">
        <span>openapi.yaml (Swagger / OpenAPI 3.0.3)</span>
        <button
          onClick={() => onCopy(yaml, 'raw_yaml')}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>{copiedText === 'raw_yaml' ? 'Copied' : 'Copy YAML'}</span>
        </button>
      </div>
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500">Generating YAML...</div>
      ) : (
        <pre className="p-4 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-[600px] leading-relaxed">
          {yaml}
        </pre>
      )}
    </div>
  );
};
