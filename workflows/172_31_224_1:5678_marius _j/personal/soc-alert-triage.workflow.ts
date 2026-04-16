import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : SOC Alert Triage
// Nodes   : 9  |  Connections: 6
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// AlertWebhook                       webhook
// NormalizeAlert                     code
// TriageAgent                        agent                      [AI]
// HaikuModel                         lmChatOpenAi               [creds] [ai_languageModel]
// EnrichIpTool                       toolCode                   [ai_tool]
// ScoreAndDedup                      code
// SeverityRouter                     switch
// AlertCritical                      telegram                   [creds]
// AlertHigh                          telegram                   [creds]
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// AlertWebhook
//    → NormalizeAlert
//      → TriageAgent
//        → ScoreAndDedup
//          → SeverityRouter
//            → AlertCritical
//           .out(1) → AlertHigh
//
// AI CONNECTIONS
// TriageAgent.uses({ ai_languageModel: HaikuModel, ai_tool: [EnrichIpTool] })
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Y8yy3136pozbsFeG',
    name: 'SOC Alert Triage',
    active: true,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: false },
})
export class SocAlertTriageWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '2f9316bf-40fa-4fea-8303-078c1730fdc1',
        webhookId: 'ddb03f1e-728e-4780-a7a8-010c468bfb4c',
        name: 'Alert Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2.1,
        position: [250, 300],
    })
    AlertWebhook = {
        httpMethod: 'POST',
        path: 'soc-alert-triage',
        responseMode: 'onReceived',
        responseCode: 200,
        responseBinaryPropertyName: 'data',
    };

    @node({
        id: 'f3e80f75-3420-4020-9dc4-fa6390db40de',
        name: 'Normalize Alert',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [500, 300],
    })
    NormalizeAlert = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// SOC Alert Normalizer
// Accepts Wazuh, Elastic SIEM, or generic alert formats
// Outputs a common schema for downstream enrichment

const items = $input.all();
const results = [];

for (const item of items) {
  // Webhook node passes full envelope (headers, params, query, body)
  // The actual alert payload is in the body field
  const raw = item.json.body || item.json;
  let normalized;

  // Detect format and normalize
  if (raw.rule && raw.agent && raw.data) {
    // --- Wazuh format ---
    const level = Number(raw.rule.level) || 0;
    let severity;
    if (level >= 12) severity = 'critical';
    else if (level >= 10) severity = 'high';
    else if (level >= 7) severity = 'medium';
    else severity = 'low';

    normalized = {
      source: 'wazuh',
      source_ip: raw.data.srcip || null,
      dest_ip: raw.data.dstip || raw.agent.ip || null,
      dest_port: raw.data.dstport || null,
      alert_type: raw.rule.description || 'unknown',
      rule_id: raw.rule.id || null,
      severity: severity,
      agent_name: raw.agent.name || null,
      timestamp: raw.timestamp || new Date().toISOString(),
      raw_payload: raw,
    };
  } else if (raw.signal && raw.signal.rule) {
    // --- Elastic SIEM format ---
    normalized = {
      source: 'elastic',
      source_ip: (raw.source && raw.source.ip) || null,
      dest_ip: (raw.destination && raw.destination.ip) || null,
      dest_port: (raw.destination && raw.destination.port) || null,
      alert_type: raw.signal.rule.name || 'unknown',
      rule_id: raw.signal.rule.id || null,
      severity: raw.signal.rule.severity || 'medium',
      agent_name: null,
      timestamp: raw['@timestamp'] || new Date().toISOString(),
      raw_payload: raw,
    };
  } else {
    // --- Generic format ---
    normalized = {
      source: 'generic',
      source_ip: raw.source_ip || raw.src_ip || null,
      dest_ip: raw.dest_ip || raw.dst_ip || null,
      dest_port: raw.dest_port || raw.dst_port || null,
      alert_type: raw.alert_type || raw.description || 'unknown',
      rule_id: raw.rule_id || null,
      severity: raw.severity || 'medium',
      agent_name: raw.agent_name || null,
      timestamp: raw.timestamp || new Date().toISOString(),
      raw_payload: raw,
    };
  }

  results.push({ json: normalized });
}

return results;`,
    };

    @node({
        id: '27a125e2-8a2f-491e-a85b-4db95273b3a7',
        name: 'Triage Agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [750, 300],
    })
    TriageAgent = {
        promptType: 'define',
        text: `=Analyze this normalized security alert and enrich it using the enrich_ip tool.

Alert data:
- Source IP: {{ $json.source_ip }}
- Dest IP: {{ $json.dest_ip }}
- Alert Type: {{ $json.alert_type }}
- Severity: {{ $json.severity }}
- Source: {{ $json.source }}
- Timestamp: {{ $json.timestamp }}

Call the enrich_ip tool with the source_ip and alert_type to get threat intelligence data.
After receiving the enrichment results, return a JSON object with:
1. "alert" — the original normalized alert fields
2. "enrichment" — the raw enrichment results from all sources
3. "summary" — a brief analyst-friendly summary of what the enrichment reveals about this IP`,
        hasOutputParser: false,
        options: {
            systemMessage: `You are a SOC (Security Operations Center) triage analyst AI. Your job is to enrich security alerts with threat intelligence data and provide concise analysis.

When you receive a normalized alert:
1. Call the enrich_ip tool with the source IP and alert type
2. Analyze the enrichment results
3. Return a structured JSON response with the alert, enrichment data, and your analysis

Always return valid JSON. Be concise and focus on actionable intelligence.`,
        },
    };

    @node({
        id: '7ed7e536-4880-454a-9326-5c31fbb9519a',
        name: 'Haiku Model',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        version: 1.3,
        position: [750, 520],
        credentials: { openAiApi: { id: 'mOL6UoYXfgKf6RZh', name: 'OpenRouter' } },
    })
    HaikuModel = {
        model: {
            mode: 'list',
            value: 'anthropic/claude-haiku-4-5',
        },
        options: {
            maxTokens: 4096,
        },
    };

    @node({
        id: '59d5f5cd-1d77-48ab-9012-2f7a2664bde4',
        name: 'Enrich IP Tool',
        type: '@n8n/n8n-nodes-langchain.toolCode',
        version: 1.3,
        position: [950, 520],
    })
    EnrichIpTool = {
        name: 'enrich_ip',
        description:
            'Look up threat intelligence for an IP address. Returns data from Shodan, MITRE ATT&CK, VirusTotal, and AbuseIPDB. Pass the source IP and alert type.',
        language: 'javaScript',
        specifyInputSchema: true,
        schemaType: 'manual',
        inputSchema:
            '{"type":"object","properties":{"ip":{"type":"string","description":"The IP address to look up"},"alert_type":{"type":"string","description":"The alert type for MITRE ATT&CK mapping"}},"required":["ip"]}',
        jsCode: `// Parallel Threat Intel Enrichment
// Fires 4 lookups simultaneously via Promise.allSettled

const input = query;
const ip = input.ip;
const alertType = input.alert_type || '';

// --- MITRE ATT&CK keyword mapping (embedded, no API needed) ---
function mapToMitre(alertDesc) {
  const desc = (alertDesc || '').toLowerCase();
  const mappings = [
    { keywords: ['brute force', 'failed login', 'authentication failure'], technique: 'T1110', name: 'Brute Force', tactic: 'Credential Access' },
    { keywords: ['ssh'], technique: 'T1021.004', name: 'Remote Services: SSH', tactic: 'Lateral Movement' },
    { keywords: ['rdp', 'remote desktop'], technique: 'T1021.001', name: 'Remote Services: RDP', tactic: 'Lateral Movement' },
    { keywords: ['port scan', 'network scan', 'reconnaissance'], technique: 'T1046', name: 'Network Service Discovery', tactic: 'Discovery' },
    { keywords: ['malware', 'trojan', 'virus', 'ransomware'], technique: 'T1204', name: 'User Execution', tactic: 'Execution' },
    { keywords: ['phishing', 'spear'], technique: 'T1566', name: 'Phishing', tactic: 'Initial Access' },
    { keywords: ['privilege', 'escalat', 'sudo', 'root'], technique: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'Privilege Escalation' },
    { keywords: ['exfiltrat', 'data transfer', 'upload'], technique: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration' },
    { keywords: ['command and control', 'c2', 'beacon', 'callback'], technique: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control' },
    { keywords: ['sql injection', 'sqli', 'injection'], technique: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' },
    { keywords: ['web shell', 'webshell'], technique: 'T1505.003', name: 'Server Software Component: Web Shell', tactic: 'Persistence' },
    { keywords: ['denial of service', 'dos', 'ddos', 'flood'], technique: 'T1498', name: 'Network Denial of Service', tactic: 'Impact' },
  ];
  for (const m of mappings) {
    if (m.keywords.some(kw => desc.includes(kw))) {
      return { technique_id: m.technique, technique_name: m.name, tactic: m.tactic, confidence: 'keyword_match' };
    }
  }
  return { technique_id: null, technique_name: null, tactic: null, confidence: 'no_match' };
}

// --- Build parallel lookup promises ---
const lookups = [];

// 1. Shodan InternetDB (free, no API key)
lookups.push(
  this.helpers.httpRequest({
    method: 'GET',
    url: 'https://internetdb.shodan.io/' + ip,
    json: true,
  }).then(data => ({ source: 'shodan_internetdb', success: true, data }))
    .catch(err => ({ source: 'shodan_internetdb', success: false, error: err.message || String(err) }))
);

// 2. MITRE ATT&CK mapping (embedded)
lookups.push(
  Promise.resolve({ source: 'mitre_attack', success: true, data: mapToMitre(alertType) })
);

// 3. VirusTotal v3 (needs API key — graceful degradation)
lookups.push(
  this.helpers.httpRequest({
    method: 'GET',
    url: 'https://www.virustotal.com/api/v3/ip_addresses/' + ip,
    headers: { 'x-apikey': '' },
    json: true,
  }).then(data => ({ source: 'virustotal', success: true, data: {
    reputation: data.data && data.data.attributes ? data.data.attributes.reputation : null,
    last_analysis_stats: data.data && data.data.attributes ? data.data.attributes.last_analysis_stats : null,
    country: data.data && data.data.attributes ? data.data.attributes.country : null,
    as_owner: data.data && data.data.attributes ? data.data.attributes.as_owner : null,
  }}))
    .catch(err => ({ source: 'virustotal', success: false, error: 'API key not configured or request failed' }))
);

// 4. AbuseIPDB v2 (needs API key — graceful degradation)
lookups.push(
  this.helpers.httpRequest({
    method: 'GET',
    url: 'https://api.abuseipdb.com/api/v2/check',
    qs: { ipAddress: ip, maxAgeInDays: '90' },
    headers: { Key: '', Accept: 'application/json' },
    json: true,
  }).then(data => ({ source: 'abuseipdb', success: true, data: {
    abuse_confidence_score: data.data ? data.data.abuseConfidenceScore : null,
    total_reports: data.data ? data.data.totalReports : null,
    is_tor: data.data ? data.data.isTor : null,
    isp: data.data ? data.data.isp : null,
    country_code: data.data ? data.data.countryCode : null,
  }}))
    .catch(err => ({ source: 'abuseipdb', success: false, error: 'API key not configured or request failed' }))
);

// Fire all lookups in parallel
const results = await Promise.allSettled(lookups);

// Collect results
const enrichment = {};
for (const result of results) {
  const val = result.status === 'fulfilled' ? result.value : { source: 'unknown', success: false, error: result.reason };
  enrichment[val.source] = val;
}

return JSON.stringify(enrichment);`,
    };

    @node({
        id: 'ea0e3444-f439-4dd4-956d-6daf230f9a4e',
        name: 'Score and Dedup',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1000, 300],
    })
    ScoreAndDedup = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Severity Scoring + Deduplication
// Parses agent enrichment output, computes weighted severity score,
// tracks IP dedup via workflow static data

const items = $input.all();
const results = [];
const staticData = $getWorkflowStaticData('global');
if (!staticData.seen_ips) staticData.seen_ips = {};

const DEDUP_WINDOW_MS = 3600000; // 1 hour
const now = Date.now();

// Clean expired entries from dedup window
for (const ip of Object.keys(staticData.seen_ips)) {
  if (now - staticData.seen_ips[ip].last_seen > DEDUP_WINDOW_MS) {
    delete staticData.seen_ips[ip];
  }
}

for (const item of items) {
  // Parse agent output — extract JSON from markdown code fences or raw text
  let agentText = item.json.output || '';
  let parsed = {};
  try {
    // Try extracting JSON from code fences first
    const fenceMatch = agentText.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/);
    const jsonStr = fenceMatch ? fenceMatch[1] : agentText;
    // If no fence match, try finding first { to last }
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
    } else {
      parsed = JSON.parse(jsonStr);
    }
  } catch (e) {
    // If agent didn't return valid JSON, create minimal structure
    parsed = { alert: {}, enrichment: {}, summary: agentText };
  }

  const alert = parsed.alert || {};
  const enrichment = parsed.enrichment || {};
  const sourceIp = alert.source_ip || 'unknown';

  // --- Compute per-source scores (0-100) ---
  let scores = {};
  let weights = { virustotal: 0.3, abuseipdb: 0.3, shodan: 0.2, base: 0.2 };
  let availableWeight = 0;

  // Shodan InternetDB score
  const shodan = enrichment.shodan_internetdb || {};
  if (shodan.success) {
    const data = shodan.data || {};
    const portCount = (data.ports || []).length;
    const vulnCount = (data.vulns || []).length;
    const isTor = (data.hostnames || []).some(h => h.includes('tor'));
    let shodanScore = Math.min(portCount * 10, 40) + Math.min(vulnCount * 20, 40) + (isTor ? 20 : 0);
    scores.shodan = Math.min(shodanScore, 100);
    availableWeight += weights.shodan;
  }

  // MITRE ATT&CK — boost score if technique matched
  const mitre = enrichment.mitre_attack || {};
  let mitreBoost = 0;
  if (mitre.success && mitre.data && mitre.data.technique_id) {
    mitreBoost = 15;
  }

  // VirusTotal score
  const vt = enrichment.virustotal || {};
  if (vt.success && vt.data) {
    const stats = vt.data.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const total = (stats.malicious || 0) + (stats.undetected || 0) + (stats.harmless || 0) + (stats.suspicious || 0);
    const vtRatio = total > 0 ? (malicious / total) * 100 : 0;
    const repScore = Math.min(Math.abs(vt.data.reputation || 0), 100);
    scores.virustotal = Math.min(Math.max(vtRatio, repScore), 100);
    availableWeight += weights.virustotal;
  }

  // AbuseIPDB score
  const abuse = enrichment.abuseipdb || {};
  if (abuse.success && abuse.data) {
    scores.abuseipdb = abuse.data.abuse_confidence_score || 0;
    availableWeight += weights.abuseipdb;
  }

  // Base severity score
  const severityMap = { critical: 100, high: 75, medium: 50, low: 25 };
  scores.base = severityMap[alert.severity] || 50;
  availableWeight += weights.base;

  // --- Compute weighted score with redistribution ---
  let totalScore = 0;
  if (availableWeight > 0) {
    if (scores.shodan !== undefined) totalScore += scores.shodan * (weights.shodan / availableWeight);
    if (scores.virustotal !== undefined) totalScore += scores.virustotal * (weights.virustotal / availableWeight);
    if (scores.abuseipdb !== undefined) totalScore += scores.abuseipdb * (weights.abuseipdb / availableWeight);
    totalScore += scores.base * (weights.base / availableWeight);
  }

  // Apply MITRE boost
  totalScore = Math.min(totalScore + mitreBoost, 100);
  totalScore = Math.round(totalScore);

  // --- Determine severity level ---
  let severityLevel, routeIndex;
  if (totalScore >= 80) { severityLevel = 'critical'; routeIndex = 0; }
  else if (totalScore >= 60) { severityLevel = 'high'; routeIndex = 1; }
  else if (totalScore >= 40) { severityLevel = 'medium'; routeIndex = 2; }
  else { severityLevel = 'low'; routeIndex = 3; }

  // --- Deduplication ---
  let isDuplicate = false;
  let dedupInfo = { first_seen: new Date().toISOString(), count: 1, last_seen: now };

  if (staticData.seen_ips[sourceIp]) {
    const prev = staticData.seen_ips[sourceIp];
    isDuplicate = true;
    dedupInfo = {
      first_seen: prev.first_seen,
      count: prev.count + 1,
      last_seen: now,
    };
  }
  staticData.seen_ips[sourceIp] = dedupInfo;

  results.push({
    json: {
      severity_score: totalScore,
      severity_level: severityLevel,
      route_index: routeIndex,
      is_duplicate: isDuplicate,
      dedup: dedupInfo,
      scores_breakdown: scores,
      mitre_boost: mitreBoost,
      alert: alert,
      enrichment: enrichment,
      summary: parsed.summary || null,
    },
  });
}

return results;`,
    };

    @node({
        id: 'ba5da93a-08f3-482c-a7ee-899cce71bb03',
        name: 'Severity Router',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1250, 300],
    })
    SeverityRouter = {
        mode: 'expression',
        numberOutputs: 4,
        output: '={{ $json.route_index }}',
        options: {
            fallbackOutput: 3,
        },
    };

    @node({
        id: '70b1304b-54aa-4ea5-b429-073333e75de2',
        name: 'Alert Critical',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [1500, 100],
        credentials: { telegramApi: { id: 'nzmbw9ZNGZdA9sZp', name: 'Telegram Bot' } },
    })
    AlertCritical = {
        chatId: '={{ $getWorkflowStaticData("global").telegram_chat_id || "CONFIGURE_CHAT_ID" }}',
        text: `=🔴 CRITICAL SECURITY ALERT

⚠️ Score: {{ $json.severity_score }}/100

📋 Alert: {{ $json.alert.alert_type }}
🌐 Source IP: {{ $json.alert.source_ip }}
🎯 Target: {{ $json.alert.dest_ip }}:{{ $json.alert.dest_port }}
📡 Source: {{ $json.alert.source }}
🕐 Time: {{ $json.alert.timestamp }}

🔍 Enrichment:
{{ $json.enrichment.shodan_internetdb?.success ? '• Shodan: ' + ($json.enrichment.shodan_internetdb.data?.hostnames?.join(', ') || 'no hostnames') + ' | Ports: ' + ($json.enrichment.shodan_internetdb.data?.ports?.join(', ') || 'none') : '• Shodan: unavailable' }}
{{ $json.enrichment.mitre_attack?.success && $json.enrichment.mitre_attack.data?.technique_id ? '• MITRE: ' + $json.enrichment.mitre_attack.data.technique_id + ' ' + $json.enrichment.mitre_attack.data.technique_name + ' (' + $json.enrichment.mitre_attack.data.tactic + ')' : '• MITRE: no match' }}
{{ $json.enrichment.virustotal?.success ? '• VT: reputation ' + $json.enrichment.virustotal.data?.reputation : '• VT: not configured' }}
{{ $json.enrichment.abuseipdb?.success ? '• AbuseIPDB: confidence ' + $json.enrichment.abuseipdb.data?.abuse_confidence_score + '%' : '• AbuseIPDB: not configured' }}

{{ $json.is_duplicate ? '🔁 DUPLICATE: seen ' + $json.dedup.count + ' times since ' + $json.dedup.first_seen : '🆕 First occurrence' }}

🏷️ Scoring: {{ Object.entries($json.scores_breakdown).map(([k,v]) => k + '=' + v).join(', ') }}{{ $json.mitre_boost > 0 ? ' +MITRE boost ' + $json.mitre_boost : '' }}`,
        additionalFields: {
            parse_mode: 'HTML',
        },
    };

    @node({
        id: '400b9356-bfb6-4bf2-a063-19c5216a3ee9',
        name: 'Alert High',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [1500, 300],
        credentials: { telegramApi: { id: 'nzmbw9ZNGZdA9sZp', name: 'Telegram Bot' } },
    })
    AlertHigh = {
        chatId: '={{ $getWorkflowStaticData("global").telegram_chat_id || "CONFIGURE_CHAT_ID" }}',
        text: `=🟠 HIGH SEVERITY ALERT

⚠️ Score: {{ $json.severity_score }}/100

📋 Alert: {{ $json.alert.alert_type }}
🌐 Source IP: {{ $json.alert.source_ip }}
🎯 Target: {{ $json.alert.dest_ip }}:{{ $json.alert.dest_port }}
📡 Source: {{ $json.alert.source }}
🕐 Time: {{ $json.alert.timestamp }}

🔍 Enrichment:
{{ $json.enrichment.shodan_internetdb?.success ? '• Shodan: ' + ($json.enrichment.shodan_internetdb.data?.hostnames?.join(', ') || 'no hostnames') + ' | Ports: ' + ($json.enrichment.shodan_internetdb.data?.ports?.join(', ') || 'none') : '• Shodan: unavailable' }}
{{ $json.enrichment.mitre_attack?.success && $json.enrichment.mitre_attack.data?.technique_id ? '• MITRE: ' + $json.enrichment.mitre_attack.data.technique_id + ' ' + $json.enrichment.mitre_attack.data.technique_name + ' (' + $json.enrichment.mitre_attack.data.tactic + ')' : '• MITRE: no match' }}

{{ $json.is_duplicate ? '🔁 DUPLICATE: seen ' + $json.dedup.count + ' times' : '🆕 First occurrence' }}`,
        additionalFields: {
            parse_mode: 'HTML',
        },
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.AlertWebhook.out(0).to(this.NormalizeAlert.in(0));
        this.NormalizeAlert.out(0).to(this.TriageAgent.in(0));
        this.TriageAgent.out(0).to(this.ScoreAndDedup.in(0));
        this.ScoreAndDedup.out(0).to(this.SeverityRouter.in(0));
        this.SeverityRouter.out(0).to(this.AlertCritical.in(0));
        this.SeverityRouter.out(1).to(this.AlertHigh.in(0));

        this.TriageAgent.uses({
            ai_languageModel: this.HaikuModel.output,
            ai_tool: [this.EnrichIpTool.output],
        });
    }
}
