import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : SOC Alert Triage
// Nodes   : 2  |  Connections: 1
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// AlertWebhook                       webhook
// NormalizeAlert                     code
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// AlertWebhook
//    → NormalizeAlert
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

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.AlertWebhook.out(0).to(this.NormalizeAlert.in(0));
    }
}
