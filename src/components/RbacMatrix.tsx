import React, { useState } from 'react';
import { Shield, Plus, Check, X, Info, Sliders, Lock, CheckCircle, XCircle } from 'lucide-react';
import { PermissionItem, RbacRole, RbacRule } from '../types.ts';

interface RbacMatrixProps {
  roles: RbacRole[];
  rules: RbacRule[];
  permissions: PermissionItem[];
  onRoleCreated: () => void;
}

export const RbacMatrix: React.FC<RbacMatrixProps> = ({
  roles,
  rules,
  permissions,
  onRoleCreated,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newRoleId, setNewRoleId] = useState<string>('');
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [newRoleDesc, setNewRoleDesc] = useState<string>('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Policy Simulator
  const [simRole, setSimRole] = useState<string>(roles[0]?.id || 'helpdesk-operator');
  const [simAction, setSimAction] = useState<string>(rules[0]?.id || 'rule_users_unlock');

  const categories = ['ALL', 'Users', 'Authenticators', 'Applications', 'Policies', 'Audit'];

  const filteredRules = rules.filter(r => {
    if (selectedCategory !== 'ALL' && r.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  const togglePermission = (permId: string) => {
    if (selectedPerms.includes(permId)) {
      setSelectedPerms(selectedPerms.filter(p => p !== permId));
    } else {
      setSelectedPerms([...selectedPerms, permId]);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleId || !newRoleName) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newRoleId.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          name: newRoleName,
          description: newRoleDesc,
          permissions: selectedPerms,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewRoleId('');
        setNewRoleName('');
        setNewRoleDesc('');
        setSelectedPerms([]);
        onRoleCreated();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Evaluate simulator
  const simSelectedRoleObj = roles.find(r => r.id === simRole);
  const simSelectedRuleObj = rules.find(r => r.id === simAction);
  const isSimAllowed = simSelectedRoleObj && simSelectedRuleObj
    ? (simSelectedRoleObj.permissions.includes('*') || simSelectedRoleObj.permissions.includes(simSelectedRuleObj.requiredPermission))
    : false;

  return (
    <div className="space-y-6">
      {/* Top Banner & Simulator */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Granular Role-Based Access Control (RBAC) Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Solve the Thales STA tenant-wide administrator vulnerability. Map individual REST endpoints to fine-grained scopes so each service account and OIDC role only accesses what they need.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Role</span>
          </button>
        </div>

        {/* Live Simulator Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-500" />
            <span>Instant Policy Evaluation Simulator:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs">
            <div className="sm:col-span-4">
              <label className="text-[11px] text-slate-500 block mb-1">Select Role / Persona:</label>
              <select
                value={simRole}
                onChange={e => setSimRole(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-1.5"
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.permissions.length} perms)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="text-[11px] text-slate-500 block mb-1">Target STA Endpoint Action:</label>
              <select
                value={simAction}
                onChange={e => setSimAction(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-1.5"
              >
                {rules.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.httpMethod} {r.pathPattern} ({r.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="text-[11px] text-slate-500 block mb-1">Gateway Verdict:</label>
              <div
                className={`p-1.5 rounded-lg border flex items-center gap-2 font-medium text-xs ${
                  isSimAllowed
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                }`}
              >
                {isSimAllowed ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>ALLOWED (Possesses scope {simSelectedRuleObj?.requiredPermission})</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>DENIED: "improper rights" (Lacks {simSelectedRuleObj?.requiredPermission})</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setSelectedCategory(c)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
              selectedCategory === c
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs font-semibold'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {c} ({c === 'ALL' ? rules.length : rules.filter(r => r.category === c).length})
          </button>
        ))}
      </div>

      {/* Endpoint Authorization Catalog Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Thales STA Protected Endpoint Catalog & Required Scopes
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {filteredRules.length} registered endpoints
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-[10px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Method & Path</th>
                <th className="py-2.5 px-3">Action Description</th>
                <th className="py-2.5 px-3">Required Scope</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Permitted Roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRules.map(rule => {
                const permittedRoles = roles.filter(
                  r => r.permissions.includes('*') || r.permissions.includes(rule.requiredPermission)
                );

                return (
                  <tr key={rule.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rule.httpMethod === 'GET'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : rule.httpMethod === 'POST'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : rule.httpMethod === 'PUT'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {rule.httpMethod}
                        </span>
                        <span className="text-slate-900 dark:text-slate-200 font-medium">
                          {rule.pathPattern}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{rule.name}</div>
                      <div className="text-[11px] text-slate-500">{rule.description}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {rule.requiredPermission}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {rule.category}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {permittedRoles.map(r => (
                          <span
                            key={r.id}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            {r.name.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Create Granular RBAC Role
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Role Identifier (ID):
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. security-tier2-responder"
                  value={newRoleId ?? ''}
                  onChange={e => setNewRoleId(e.target.value)}
                  className="w-full font-mono text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Security Operations Analyst"
                  value={newRoleName ?? ''}
                  onChange={e => setNewRoleName(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Can view audit logs and unlock accounts only."
                  value={newRoleDesc ?? ''}
                  onChange={e => setNewRoleDesc(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Granted Granular Permissions ({selectedPerms.length} selected):
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1.5 bg-slate-50 dark:bg-slate-950">
                  {permissions.map(p => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPerms.includes(p.id)}
                        onChange={() => togglePermission(p.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">
                          {p.id}
                        </span>
                        <span className="text-slate-500 text-[11px] block">{p.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
