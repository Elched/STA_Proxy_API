import dgram from 'dgram';
import net from 'net';
import tls from 'tls';
import { AuditLogEntry } from './types.ts';

export type SiemProtocol = 'UDP' | 'TCP' | 'TLS' | 'SPLUNK_HEC' | 'WEBHOOK';
export type SiemFormat = 'RFC_5424' | 'RFC_3164' | 'CEF' | 'JSON';

export interface SiemConfig {
  enabled: boolean;
  protocol: SiemProtocol;
  host: string;
  port: number;
  format: SiemFormat;
  facility: number; // 4 = authpriv, 16 = local0
  appName: string;
  hecToken?: string; // For Splunk HEC
  webhookUrl?: string; // For HTTP Webhook
  customHeaders?: Record<string, string>;
}

export interface SiemStatus {
  enabled: boolean;
  protocol: SiemProtocol;
  host: string;
  port: number;
  format: SiemFormat;
  eventsSent: number;
  eventsFailed: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastPayloadSample: string | null;
}

class SiemForwarder {
  private config: SiemConfig = {
    enabled: process.env.SIEM_FORWARDING_ENABLED === 'true' || false,
    protocol: (process.env.SIEM_PROTOCOL as SiemProtocol) || 'UDP',
    host: process.env.SIEM_HOST || '127.0.0.1',
    port: parseInt(process.env.SIEM_PORT || '514', 10),
    format: (process.env.SIEM_FORMAT as SiemFormat) || 'RFC_5424',
    facility: 4, // authpriv
    appName: 'sta-api-proxy',
    hecToken: process.env.SIEM_HEC_TOKEN || '',
    webhookUrl: process.env.SIEM_WEBHOOK_URL || '',
  };

  private eventsSent = 0;
  private eventsFailed = 0;
  private lastSentAt: string | null = null;
  private lastError: string | null = null;
  private lastPayloadSample: string | null = null;

  private udpClient: dgram.Socket | null = null;

  constructor() {
    this.initUdpClient();
  }

  private initUdpClient() {
    try {
      this.udpClient = dgram.createSocket('udp4');
      this.udpClient.on('error', err => {
        this.lastError = `UDP socket error: ${err.message}`;
      });
    } catch (err: any) {
      this.lastError = `Failed to create UDP socket: ${err.message}`;
    }
  }

  public getConfig(): SiemConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<SiemConfig>): SiemConfig {
    this.config = { ...this.config, ...newConfig };
    this.lastError = null;
    return { ...this.config };
  }

  public getStatus(): SiemStatus {
    return {
      enabled: this.config.enabled,
      protocol: this.config.protocol,
      host: this.config.host,
      port: this.config.port,
      format: this.config.format,
      eventsSent: this.eventsSent,
      eventsFailed: this.eventsFailed,
      lastSentAt: this.lastSentAt,
      lastError: this.lastError,
      lastPayloadSample: this.lastPayloadSample,
    };
  }

  /**
   * Format audit log entry according to chosen SIEM standard
   */
  public formatMessage(entry: AuditLogEntry, format: SiemFormat = this.config.format): string {
    const timestamp = entry.timestamp;
    const hostname = 'sta-proxy-gateway';
    const appName = this.config.appName;
    const pid = process.pid;
    const msgId = entry.correlationId;

    // Severity mapping
    // 0=Emergency, 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notice, 6=Informational, 7=Debug
    let severity = 6; // Informational
    if (entry.actionStatus === 'AUTH_FAILED') severity = 4; // Warning
    if (entry.actionStatus === 'FORBIDDEN') severity = 4; // Warning (Improper Rights)
    if (entry.actionStatus === 'UPSTREAM_FAILED') severity = 3; // Error

    const pri = this.config.facility * 8 + severity;

    if (format === 'RFC_5424') {
      // RFC-5424 Structured Syslog:
      // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [STRUCTURED-DATA] MSG
      const reasonSafe = (entry.rejectionReason || 'none').replace(/"/g, "'");
      const structuredData = `[staAudit@44917 userId="${entry.userId}" client="${entry.clientName}" authType="${entry.authType}" action="${entry.action}" status="${entry.actionStatus}" httpMethod="${entry.httpMethod}" endpoint="${entry.endpoint}" reason="${reasonSafe}" upstreamStatus="${entry.upstreamStatusCode || 'none'}" latencyMs="${entry.latencyMs}" clientIp="${entry.clientIp}"]`;
      const msg = `Thales STA Proxy: ${entry.httpMethod} ${entry.endpoint} by ${entry.userId} -> ${entry.actionStatus}${entry.rejectionReason ? ` (${entry.rejectionReason})` : ''}`;
      return `<${pri}>1 ${timestamp} ${hostname} ${appName} ${pid} ${msgId} ${structuredData} ${msg}`;
    }

    if (format === 'RFC_3164') {
      // RFC-3164 Traditional BSD Syslog:
      // <PRI>TIMESTAMP HOSTNAME TAG: MSG
      const d = new Date(timestamp);
      const bsdTime = d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '');
      return `<${pri}>${bsdTime} ${hostname} ${appName}[${pid}]: userId=${entry.userId} action=${entry.action} status=${entry.actionStatus} method=${entry.httpMethod} endpoint=${entry.endpoint} ip=${entry.clientIp} reason="${entry.rejectionReason || 'none'}"`;
    }

    if (format === 'CEF') {
      // ArcSight / QRadar Common Event Format:
      // CEF:Version|Device Vendor|Device Product|Device Version|Device Event Class ID|Name|Severity|[Extension]
      const name = entry.actionStatus === 'SUCCESS' ? 'STA Action Authorized' : entry.actionStatus === 'FORBIDDEN' ? 'STA Improper Rights' : 'STA Auth Failure';
      const cefSeverity = entry.actionStatus === 'SUCCESS' ? 3 : entry.actionStatus === 'FORBIDDEN' ? 7 : 8;
      const ext = [
        `duser=${entry.userId}`,
        `src=${entry.clientIp}`,
        `act=${entry.action}`,
        `app=${entry.httpMethod}`,
        `request=${entry.endpoint}`,
        `outcome=${entry.actionStatus}`,
        `reason=${encodeURIComponent(entry.rejectionReason || 'none')}`,
        `cn1=${entry.latencyMs}`,
        `cn1Label=latencyMs`,
        `externalId=${entry.correlationId}`,
      ].join(' ');

      return `CEF:0|Thales|SafeNet Trusted Access Granular Proxy|1.0.0|${entry.action}|${name}|${cefSeverity}|${ext}`;
    }

    // Default: JSON payload
    return JSON.stringify({
      version: '1.0',
      facility: 'authpriv',
      severity,
      syslogPri: pri,
      ...entry,
    });
  }

  /**
   * Forward an audit log entry in real time
   */
  public async forward(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'SIEM forwarding is currently disabled' };
    }

    const payload = this.formatMessage(entry);
    this.lastPayloadSample = payload;

    try {
      if (this.config.protocol === 'UDP') {
        await this.sendUdp(payload);
      } else if (this.config.protocol === 'TCP') {
        await this.sendTcp(payload, false);
      } else if (this.config.protocol === 'TLS') {
        await this.sendTcp(payload, true);
      } else if (this.config.protocol === 'SPLUNK_HEC') {
        await this.sendSplunkHec(entry);
      } else if (this.config.protocol === 'WEBHOOK') {
        await this.sendWebhook(payload);
      }

      this.eventsSent++;
      this.lastSentAt = new Date().toISOString();
      this.lastError = null;
      return { success: true };
    } catch (err: any) {
      this.eventsFailed++;
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  private sendUdp(message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.udpClient) {
        this.initUdpClient();
      }
      const buffer = Buffer.from(message + '\n');
      this.udpClient?.send(buffer, 0, buffer.length, this.config.port, this.config.host, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private sendTcp(message: string, useTls: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = {
        host: this.config.host,
        port: this.config.port,
        timeout: 5000,
      };

      const socket = useTls
        ? tls.connect({ ...options, rejectUnauthorized: false })
        : net.connect(options);

      socket.setTimeout(5000);

      socket.on('connect', () => {
        socket.write(message + '\n', () => {
          socket.end();
          resolve();
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`SIEM TCP connection timed out after 5000ms to ${this.config.host}:${this.config.port}`));
      });

      socket.on('error', err => {
        socket.destroy();
        reject(err);
      });
    });
  }

  private async sendSplunkHec(entry: AuditLogEntry): Promise<void> {
    const url = this.config.webhookUrl || `http://${this.config.host}:${this.config.port}/services/collector/event`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.hecToken) {
      headers['Authorization'] = `Splunk ${this.config.hecToken}`;
    }

    const hecPayload = {
      time: Math.floor(new Date(entry.timestamp).getTime() / 1000),
      host: 'sta-proxy-gateway',
      source: 'thales-sta-proxy',
      sourcetype: 'thales:sta:audit',
      event: entry,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(hecPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Splunk HEC returned HTTP ${res.status}: ${text}`);
    }
  }

  private async sendWebhook(payload: string): Promise<void> {
    const url = this.config.webhookUrl || `http://${this.config.host}:${this.config.port}/events`;
    const headers: Record<string, string> = {
      'Content-Type': this.config.format === 'JSON' ? 'application/json' : 'text/plain',
      ...(this.config.customHeaders || {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
    });

    if (!res.ok) {
      throw new Error(`Webhook target returned HTTP ${res.status}`);
    }
  }
}

export const siemForwarder = new SiemForwarder();
