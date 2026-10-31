import React, { useState, useEffect } from 'react';
import {
  Download,
  Copy,
  FileCode,
  Shield,
  Lock,
  Server,
  Terminal,
  ExternalLink,
  CheckCircle,
  FileText
} from 'lucide-react';

export const CodeExportDeploy: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState<'docker' | 'python' | 'go'>('docker');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [dockerFiles, setDockerFiles] = useState<any[]>([]);
  const [pythonFiles, setPythonFiles] = useState<any[]>([]);
  const [goFiles, setGoFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchExports = async () => {
      try {
        const [dockerRes, pyRes, goRes] = await Promise.all([
          fetch('/api/export/docker'),
          fetch('/api/export/python'),
          fetch('/api/export/go'),
        ]);
        const dockerData = await dockerRes.json();
        const pyData = await pyRes.json();
        const goData = await goRes.json();
        setDockerFiles(dockerData.files || []);
        setPythonFiles(pyData.files || []);
        setGoFiles(goData.files || []);
      } finally {
        setLoading(false);
      }
    };
    fetchExports();
  }, []);

  const currentFiles = selectedLang === 'docker' ? dockerFiles : selectedLang === 'python' ? pythonFiles : goFiles;
  const currentFile = currentFiles[activeFileIndex] || currentFiles[0];

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Loading exportable standalone code packages...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Standalone Production Code Packages & Deployment
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Complete, self-contained standalone implementations in Python (FastAPI + Pydantic + PyJWT) and Go (high performance compiled binary), ready to containerize and deploy behind TLS.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                currentFiles.forEach(f => downloadFile(f.path, f.content));
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Download {selectedLang === 'docker' ? 'Docker' : selectedLang === 'python' ? 'Python' : 'Go'} Files</span>
            </button>
          </div>
        </div>
      </div>

      {/* Language / Packaging Selector & File Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Viewer (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between">
            {/* Language / Container Toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
              <button
                onClick={() => {
                  setSelectedLang('docker');
                  setActiveFileIndex(0);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  selectedLang === 'docker'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Dockerized (Alternative)
              </button>
              <button
                onClick={() => {
                  setSelectedLang('python');
                  setActiveFileIndex(0);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  selectedLang === 'python'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Python (FastAPI)
              </button>
              <button
                onClick={() => {
                  setSelectedLang('go');
                  setActiveFileIndex(0);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  selectedLang === 'go'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Go (Single Binary)
              </button>
            </div>

            {/* Actions for active file */}
            {currentFile && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => copyToClipboard(currentFile.content, currentFile.path)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === currentFile.path ? 'Copied!' : 'Copy Code'}</span>
                </button>
                <button
                  onClick={() => downloadFile(currentFile.path, currentFile.content)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            )}
          </div>

          {/* File Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
            {currentFiles.map((file, idx) => (
              <button
                key={file.path}
                onClick={() => setActiveFileIndex(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors whitespace-nowrap ${
                  activeFileIndex === idx
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-white font-medium'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.path}</span>
              </button>
            ))}
          </div>

          {/* Code Body */}
          {currentFile && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden shadow-2xs">
              <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>{currentFile.path}</span>
                <span>Language: {currentFile.language}</span>
              </div>
              <pre className="p-4 text-slate-300 font-mono text-[11px] overflow-x-auto max-h-[580px] leading-relaxed">
                <code>{currentFile.content}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Right Column: Installation Guides & TLS Security Guide (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Installation Options Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3.5 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-500" />
              <span>Installation Options (README.md)</span>
            </h3>

            {/* Option A: Docker */}
            <div className="space-y-1.5 p-3 rounded-lg border border-indigo-100 dark:border-indigo-950 bg-indigo-50/40 dark:bg-indigo-950/20">
              <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
                <span>Option 1: Dockerized (Alternative)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold">CONTAINER</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Run isolated with Docker Compose (Node 22 alpine, non-root user, healthcheck):
              </p>
              <pre className="p-2 rounded bg-slate-950 text-indigo-300 font-mono text-[10px] overflow-x-auto">
                docker compose up --build -d
              </pre>
            </div>

            {/* Option B: Native */}
            <div className="space-y-1.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                <span>Option 2: Native Bare-Metal</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">NATIVE</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Run directly on host VM with Node.js 20+ LTS:
              </p>
              <pre className="p-2 rounded bg-slate-950 text-slate-300 font-mono text-[10px] overflow-x-auto">
                npm install && npm start
              </pre>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-500" />
              <span>TLS & Production Security Blueprint</span>
            </h3>

            {/* 1. TLS Encryption */}
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-500" />
                <span>1. Mandatory TLS 1.3 Encryption</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                All data transmissions must be encrypted in transit via TLS 1.3. Terminate TLS either via automated reverse proxy (Nginx, Caddy, Traefik, AWS ALB) or pass SSL certificates directly into Uvicorn / Go:
              </p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[10px] text-slate-300">
                uvicorn main:app --ssl-keyfile privkey.pem --ssl-certfile fullchain.pem
              </div>
            </div>

            {/* 2. Master Key Isolation */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-500" />
                <span>2. Master STA Key Isolation</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                The Thales STA Master API Key gives tenant-wide admin rights. Never store it on developer workstations or in code. Inject it at container runtime from HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets:
              </p>
              <div className="p-2 rounded bg-slate-950 font-mono text-[10px] text-indigo-300">
                export STA_MASTER_API_KEY=$(vault kv get -field=key secret/thales/master)
              </div>
            </div>

            {/* 3. OpenID Connect IdP Federation */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-500" />
                <span>3. OpenID Connect (OIDC) Federation</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                Configure PyJWKClient to dynamically fetch and cache public keys from your enterprise IdP (Okta, Keycloak, Microsoft Entra ID). The proxy extracts role claims and enforces zero-trust boundaries before any call touches SafeNet Trusted Access.
              </p>
            </div>

            {/* 4. Mutual TLS (mTLS) for High-Security Bots */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>4. Mutual TLS (mTLS) for Service Accounts</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
                For maximum security between backend microservices and the proxy, configure mTLS in Nginx with <code className="font-mono text-slate-600 dark:text-slate-300">ssl_verify_client on;</code>. This verifies both client and server certificates.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
