// Console, built against the shared mjdeving-lab design lock.
// Lock + tokens: MJ-OS references/design-system/lab/{reference-lock.md,design.md,tokens.css}
// Archetype A (console). Project accent: amber #e3a63c (alerting).
// Amber and not red on purpose: --danger is red and already means broken, so an
// alert painted red would read as an outage. The three accent variables below are
// the only tokens this project overrides. Everything else is the shared set.
// Accent role = signal only: the one action, the score bar, the live badge, focus.
// Mono role = technical metadata only. Prose stays sans.
//
// One accent means severity is NOT colour-coded. A critical alert and a low one
// differ by the length of the score bar and by the word next to it, which is the
// same information without a second palette.
import { EXAMPLES } from "../triage/examples";

export function renderConsole(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>soc-alert-triage / triage console</title>
  <style>
:root{
  --canvas:#0a0b0d; --surface:#121417; --surface-2:#171a1e;
  --border:#23272d; --border-bright:#2e343b;
  --text:#e7e9ec; --text-muted:#9aa1a8; --text-dim:#656b72;
  --accent:#e3a63c; --accent-dim:#a3752a; --accent-faint:rgba(227,166,60,.12);
  --danger:#e5674c;
  --font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  --radius:8px; --radius-sm:6px; --maxw:820px;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--text);font-family:var(--font-sans);
  font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}

header{border-bottom:1px solid var(--border);padding:22px 0 18px;margin-bottom:28px}
.headrow{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap}
.mark{font-weight:700;font-size:19px;letter-spacing:-.01em}
.mark .dim{color:var(--text-dim);font-weight:400}
.tag{color:var(--text-muted);font-size:13.5px;margin-top:4px;max-width:64ch}
.stack{display:flex;gap:6px;flex-wrap:wrap}
.prim{font-family:var(--font-mono);font-size:11px;color:var(--text-dim);
  border:1px solid var(--border);border-radius:5px;padding:2px 7px;white-space:nowrap}

.health{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.badge{font-family:var(--font-mono);font-size:11px;color:var(--text-dim);
  border:1px solid var(--border);border-radius:5px;padding:2px 7px;white-space:nowrap}
.badge.live{color:var(--accent);border-color:var(--accent-dim)}
.badge.off{color:var(--danger);border-color:var(--danger)}

#alert{width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);
  border-radius:var(--radius);padding:13px 14px;font-family:var(--font-mono);font-size:12.5px;
  line-height:1.5;outline:none;resize:vertical;min-height:132px;transition:border-color .12s ease}
#alert:focus{border-color:var(--accent)}
.actions{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
#run{background:var(--accent);color:#1c1204;border:0;border-radius:var(--radius);
  padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer;font-family:var(--font-sans);
  transition:background .12s ease}
#run:hover{background:#eeb757}
#run:disabled{background:var(--accent-dim);opacity:.55;cursor:not-allowed}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.chip{font-family:var(--font-mono);font-size:12px;color:var(--text-muted);background:transparent;
  border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;cursor:pointer;
  transition:border-color .12s ease,color .12s ease;text-align:left}
.chip:hover{border-color:var(--border-bright);color:var(--text)}
.hint{margin-top:14px;color:var(--text-dim);font-size:12.5px;max-width:72ch}

.out{margin-top:34px}
.meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;min-height:18px}
.err{color:var(--danger);font-family:var(--font-mono);font-size:12.5px}

.verdict{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px 16px 14px}
.vtop{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
.vscore{font-family:var(--font-mono);font-size:26px;font-weight:600;letter-spacing:-.02em}
.vscore .of{color:var(--text-dim);font-size:14px;font-weight:400}
.vlevel{font-family:var(--font-mono);font-size:12px;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:.08em}
/* The bar is drawn at its width, not animated to it. The lock allows colour and
   opacity transitions only, and a growing bar would also be the one thing on the
   page that performs rather than reports. */
.bar{height:3px;background:var(--border);border-radius:2px;margin-top:12px;overflow:hidden}
.bar span{display:block;height:100%;background:var(--accent)}
.vroute{font-family:var(--font-mono);font-size:12px;color:var(--text-dim);margin-top:10px}

.stage{margin-top:22px}
.eyebrow{font-family:var(--font-mono);font-size:11px;color:var(--accent);letter-spacing:.1em;
  text-transform:uppercase;margin-bottom:8px}
.stage h2{font-size:14px;font-weight:600;margin:0 0 10px}

.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-family:var(--font-mono);font-size:12.5px}
.kv dt{color:var(--text-dim)}
.kv dd{margin:0;color:var(--text);word-break:break-all}

.src{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:11px 13px;margin-bottom:8px}
.src-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;
  font-family:var(--font-mono);font-size:12.5px}
.src-name{color:var(--text)}
.src-body{font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:7px;
  word-break:break-word}
.src-body.quiet{color:var(--text-dim)}

.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-family:var(--font-mono);font-size:12.5px;
  min-width:420px}
th,td{text-align:left;padding:6px 12px 6px 0;border-bottom:1px solid var(--border);white-space:nowrap}
th{color:var(--text-dim);font-weight:400}
td.num{text-align:right;padding-right:16px}
tr.total td{border-bottom:0;color:var(--text)}
tr.muted td{color:var(--text-dim)}

footer{margin:48px 0 40px;padding-top:18px;border-top:1px solid var(--border);
  color:var(--text-dim);font-size:12px;font-family:var(--font-mono)}
footer a{color:var(--text-muted);text-decoration:none;border-bottom:1px solid var(--border)}
  </style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="headrow">
      <div>
        <div class="mark">soc-alert-triage<span class="dim">/</span></div>
        <div class="tag">A raw SIEM alert goes in. It is normalized, enriched against threat intelligence in parallel, scored on whichever sources answered, checked against a one hour dedup window, and routed. Every number below is shown with the source it came from.</div>
      </div>
      <div class="stack" aria-label="pipeline primitives">
        <span class="prim">Workers</span><span class="prim">Hono</span>
        <span class="prim">Shodan InternetDB</span><span class="prim">MITRE ATT&amp;CK</span>
      </div>
    </div>
  </header>

  <div class="health" id="health"><span class="badge">reading enrichers ...</span></div>

  <textarea id="alert" spellcheck="false" aria-label="raw alert payload"></textarea>
  <div class="actions">
    <button id="run">Triage alert</button>
  </div>
  <div class="chips" id="chips"></div>
  <div class="hint" id="hint">The alerts are synthetic. The IP addresses in them are real, so the lookup that runs against them is a real lookup: what you see is what Shodan knows about that address right now, which is also why a score can move between two runs. Paste your own alert in Wazuh, Elastic or generic shape.</div>

  <div class="out" id="out">
    <div class="meta" id="meta"></div>
    <div id="result"></div>
  </div>

  <footer>
    4 enrichment sources, 2 of them keyless &middot; the triage logic runs in the worker, no model in the loop &middot;
    <a href="https://github.com/mj-deving/soc-alert-triage" target="_blank" rel="noreferrer">github.com/mj-deving/soc-alert-triage</a>
  </footer>
</div>

<script>
  var EXAMPLES = ${JSON.stringify(EXAMPLES)};

  var healthEl = document.getElementById("health");
  var chipsEl = document.getElementById("chips");
  var metaEl = document.getElementById("meta");
  var resultEl = document.getElementById("result");
  var alertEl = document.getElementById("alert");
  var runEl = document.getElementById("run");

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c];
    });
  }

  function badge(label, cls) {
    var b = document.createElement("span");
    b.className = "badge " + (cls || "");
    b.textContent = label;
    return b;
  }

  alertEl.value = JSON.stringify(EXAMPLES[0].payload, null, 2);

  EXAMPLES.forEach(function (example) {
    var b = document.createElement("button");
    b.className = "chip";
    b.textContent = example.label;
    b.title = example.note;
    b.addEventListener("click", function () {
      alertEl.value = JSON.stringify(example.payload, null, 2);
      run();
    });
    chipsEl.appendChild(b);
  });

  fetch("/health").then(function (r) { return r.json(); }).then(function (h) {
    healthEl.innerHTML = "";
    h.enrichers.forEach(function (e) {
      healthEl.appendChild(badge(e.name + " " + e.state, e.state === "live" ? "live" : ""));
    });
  }).catch(function () {
    healthEl.innerHTML = "";
    healthEl.appendChild(badge("enricher status unreachable", "off"));
  });

  // Every source states what it is: answered, asked and silent, not asked because
  // this deployment holds no key, not asked because the alert names no IP. A source
  // that did not answer shows the reason, never a substitute number.
  function sourceCard(key, r) {
    var body;
    if (r.status === "ok" && key === "shodan_internetdb") {
      var d = r.data;
      body = "ports " + (d.ports.length ? d.ports.join(", ") : "none")
        + " &middot; hostnames " + (d.hostnames.length ? esc(d.hostnames.join(", ")) : "none")
        + " &middot; vulns " + (d.vulns.length ? esc(d.vulns.join(", ")) : "none");
    } else if (r.status === "ok" && key === "mitre_attack") {
      body = r.data.technique_id
        ? esc(r.data.technique_id + " " + r.data.technique_name + " (" + r.data.tactic + ")")
        : "no technique matched this description";
    } else if (r.status === "ok" && key === "virustotal") {
      var s = r.data.last_analysis_stats || {};
      body = "reputation " + r.data.reputation + " &middot; malicious " + (s.malicious || 0)
        + " &middot; as " + esc(r.data.as_owner || "unknown");
    } else if (r.status === "ok" && key === "abuseipdb") {
      body = "confidence " + r.data.abuse_confidence_score + "% &middot; reports " + r.data.total_reports
        + " &middot; isp " + esc(r.data.isp || "unknown");
    } else {
      body = esc(r.reason || r.status);
    }

    var quiet = r.status !== "ok";
    var latency = r.latency_ms === undefined ? "" : r.latency_ms + " ms";

    return '<div class="src"><div class="src-top"><span class="src-name">' + esc(key)
      + '</span><span class="badge ' + (r.status === "ok" ? "live" : "") + '">' + esc(r.status)
      + (latency ? " &middot; " + latency : "") + '</span></div>'
      + '<div class="src-body' + (quiet ? " quiet" : "") + '">' + body + "</div></div>";
  }

  function scoreRows(scoring) {
    var rows = "";
    var names = { shodan: "shodan", virustotal: "virustotal", abuseipdb: "abuseipdb", base: "alert severity" };

    ["shodan", "virustotal", "abuseipdb", "base"].forEach(function (key) {
      var sub = scoring.subscores[key];
      var weight = scoring.weights_applied[key];
      var answered = sub !== undefined && sub !== null;

      rows += '<tr' + (answered ? "" : ' class="muted"') + "><td>" + names[key] + "</td>"
        + '<td class="num">' + (answered ? sub : "no answer") + "</td>"
        + '<td class="num">' + (weight * 100).toFixed(0) + "%</td>"
        + '<td class="num">' + (answered ? (sub * weight).toFixed(1) : "0.0") + "</td></tr>";
    });

    rows += '<tr' + (scoring.mitre_boost ? "" : ' class="muted"') + "><td>MITRE boost</td>"
      + '<td class="num">' + (scoring.mitre_boost ? "matched" : "no match") + "</td>"
      + '<td class="num">flat</td>'
      + '<td class="num">' + (scoring.mitre_boost ? "+" + scoring.mitre_boost : "0") + ".0</td></tr>";

    rows += '<tr class="total"><td>total</td><td class="num"></td><td class="num"></td>'
      + '<td class="num">' + scoring.severity_score + "</td></tr>";

    return rows;
  }

  function render(res) {
    var a = res.alert;
    var s = res.scoring;

    var dedup = res.dedup === null
      ? "no source IP in this alert, so there is no window to check it against"
      : (res.dedup.is_duplicate
          ? "seen " + res.dedup.count + " times, first at " + new Date(res.dedup.first_seen_ms).toISOString()
          : "first occurrence of this source IP in the window");

    // The weight column only earns its place when a source is missing, so name the
    // redistribution rather than leaving the reader to derive it from the numbers.
    var missing = ["shodan", "virustotal", "abuseipdb"].filter(function (k) {
      return s.subscores[k] === undefined || s.subscores[k] === null;
    });
    var note = missing.length
      ? missing.join(" and ") + " did not answer, so the weight they would have carried is spread over the sources that did. A silent source does not score zero."
      : "All four sources answered, so each carries its nominal weight.";

    resultEl.innerHTML =
      '<div class="verdict">'
      + '<div class="vtop"><div class="vscore">' + s.severity_score + '<span class="of">/100</span></div>'
      + '<div class="vlevel">' + esc(s.severity_level) + "</div></div>"
      + '<div class="bar"><span style="width:' + s.severity_score + '%"></span></div>'
      + '<div class="vroute">route ' + s.route_index + " &middot; " + esc(res.route) + "</div>"
      + "</div>"

      + '<div class="stage"><div class="eyebrow">1 &middot; normalize</div>'
      + "<h2>Read as " + esc(a.source) + "</h2>"
      + '<dl class="kv">'
      + "<dt>source ip</dt><dd>" + esc(a.source_ip || "none") + "</dd>"
      + "<dt>target</dt><dd>" + esc((a.dest_ip || "none") + ":" + (a.dest_port || "-")) + "</dd>"
      + "<dt>alert type</dt><dd>" + esc(a.alert_type) + "</dd>"
      + "<dt>severity</dt><dd>" + esc(a.severity) + "</dd>"
      + "<dt>rule</dt><dd>" + esc(a.rule_id || "none") + "</dd>"
      + "</dl></div>"

      + '<div class="stage"><div class="eyebrow">2 &middot; enrich</div>'
      + "<h2>Four sources, fired together, settled independently</h2>"
      + sourceCard("shodan_internetdb", res.enrichment.shodan_internetdb)
      + sourceCard("mitre_attack", res.enrichment.mitre_attack)
      + sourceCard("virustotal", res.enrichment.virustotal)
      + sourceCard("abuseipdb", res.enrichment.abuseipdb)
      + "</div>"

      + '<div class="stage"><div class="eyebrow">3 &middot; score</div>'
      + "<h2>Weighted over the sources that answered</h2>"
      + '<div class="scroll"><table><thead><tr><th>source</th><th class="num">subscore</th>'
      + '<th class="num">weight</th><th class="num">contribution</th></tr></thead><tbody>'
      + scoreRows(s) + "</tbody></table></div>"
      + '<div class="src-body quiet" style="margin-top:10px">' + esc(note) + "</div></div>"

      + '<div class="stage"><div class="eyebrow">4 &middot; dedup</div>'
      + "<h2>One hour window, keyed on the source IP</h2>"
      + '<div class="src-body quiet">' + esc(dedup) + "</div></div>";
  }

  function run() {
    var raw = alertEl.value.trim();
    if (!raw) return;

    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      metaEl.innerHTML = "";
      resultEl.innerHTML = '<div class="err">That is not valid JSON: ' + esc(e.message) + "</div>";
      return;
    }

    runEl.disabled = true;
    metaEl.innerHTML = "";
    metaEl.appendChild(badge("triaging ..."));
    resultEl.innerHTML = "";

    fetch("/triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        runEl.disabled = false;
        metaEl.innerHTML = "";

        if (res.error) {
          resultEl.innerHTML = '<div class="err">' + esc(res.error) + "</div>";
          return;
        }

        metaEl.appendChild(badge(res.alert.source + " format"));
        metaEl.appendChild(badge(res.timings.enrich_ms + " ms enrich (4 in parallel)"));
        metaEl.appendChild(badge(res.timings.total_ms + " ms total"));
        render(res);
      })
      .catch(function (error) {
        runEl.disabled = false;
        metaEl.innerHTML = "";
        resultEl.innerHTML = '<div class="err">' + esc(String(error)) + "</div>";
      });
  }

  runEl.addEventListener("click", run);
</script>
</body>
</html>`;
}
