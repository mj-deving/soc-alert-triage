import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : SOC Alert Triage
// Nodes   : 5  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// AlertWebhook                       webhook
// NormalizeAlert                     code
// TriageAgent                        agent                      [AI]
// HaikuModel                         lmChatOpenAi               [creds] [ai_languageModel]
// EnrichIpTool                       toolCode                   [ai_tool]
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// AlertWebhook
//    → NormalizeAlert
//      → TriageAgent
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
        responseMode: 'lastNode',
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
        options: {},
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

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.AlertWebhook.out(0).to(this.NormalizeAlert.in(0));
        this.NormalizeAlert.out(0).to(this.TriageAgent.in(0));

        this.TriageAgent.uses({
            ai_languageModel: this.HaikuModel.output,
            ai_tool: [this.EnrichIpTool.output],
        });
    }
}
