"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { Badge } from "@/components/Badge";

/* ─── Types ─────────────────────────────────────────────────── */
interface ToolCall {
  step: number;
  tag: string;
  tool_name: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  success: boolean;
  duration_ms: number;
  timestamp: string;
}

interface AuditLog {
  ticket_id: string;
  customer_email: string;
  subject: string;
  started_at: string;
  completed_at: string;
  customer_ref: string;
  order_ref: string;
  product_ref: string;
  tool_calls: ToolCall[];
  retry_events: Array<{ tool_name: string; attempt: number; backoff_seconds: number; reason: string }>;
  confidence_score: number | null;
  final_decision: string;
  escalation_summary: string | null;
  reply_sent: string | null;
  errors: Array<{ tag: string; error: string }>;
  reasoning_trace: Array<{ step: string; reasoning: string }>;
}

interface TicketDetail {
  ticket_id: string;
  original_ticket: {
    ticket_id: string;
    customer_email: string;
    subject: string;
    body: string;
    source: string;
    created_at: string;
  };
  audit: AuditLog;
}

/* ─── Helpers ────────────────────────────────────────────────── */
const QUERY_RULES = [
  { keywords: ["refund", "money back", "charge"],      label: "Refund request",       note: "Customer seeks reimbursement or payment correction." },
  { keywords: ["cancel", "subscription", "renewal"],   label: "Cancellation",          note: "Likely account termination or renewal stop request." },
  { keywords: ["replace", "broken", "damaged"],        label: "Replacement / defect",  note: "Physical product quality or replacement workflow." },
  { keywords: ["late", "delivery", "shipping"],        label: "Fulfillment / delivery", note: "Order movement, delay, or carrier status inquiry." },
  { keywords: ["warranty", "coverage", "guarantee"],   label: "Warranty",              note: "Customer asks about policy-backed product coverage." },
];

function queryType(subject: string, body: string) {
  const src = `${subject} ${body}`.toLowerCase();
  return (
    QUERY_RULES.find((r) => r.keywords.some((k) => src.includes(k))) ?? {
      label: "General support",
      note: "No dominant keyword cluster; treat as broad support inquiry.",
    }
  );
}

function urgency(subject: string, body: string) {
  const src = `${subject} ${body}`.toLowerCase();
  if (["urgent", "asap", "immediately", "fraud", "charged twice"].some((k) => src.includes(k)))
    return { label: "High urgency", note: "Escalation language detected — immediate attention recommended." };
  if (["today", "soon", "deadline", "important"].some((k) => src.includes(k)))
    return { label: "Medium urgency", note: "Time-sensitive wording; prioritise same-day follow-up." };
  return { label: "Normal urgency", note: "No explicit urgency language detected." };
}

function nameFromEmail(email: string) {
  const [l] = email.split("@");
  return l.replace(/[._-]+/g, " ").split(" ").filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

function fmtDate(v: string) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString();
}

function confColor(s: number) {
  if (s >= 0.8) return "var(--emerald)";
  if (s >= 0.6) return "var(--amber)";
  return "var(--rose)";
}

function getDecisionVariant(decision: string): "default" | "success" | "warning" | "error" | "info" {
  const d = (decision || "").toLowerCase();
  if (d === "resolved") return "success";
  if (d === "escalated") return "warning";
  if (d === "failed" || d === "dead_letter") return "error";
  if (d === "executing") return "info";
  return "default";
}

function checklist(audit: AuditLog): string[] {
  const items: string[] = [];
  if (audit.final_decision === "ESCALATED")         items.push("Assign to specialist queue — full tool timeline is attached.");
  if (audit.final_decision === "RESOLVED")          items.push("Review customer-facing reply for tone and accuracy before closing.");
  if (audit.retry_events?.length > 0)               items.push("Review retry events to identify flaky tools or brittle inputs.");
  if (audit.errors?.length > 0)                     items.push("Inspect error tags and verify fallback path behaviour.");
  if ((audit.confidence_score ?? 1) < 0.6)         items.push("Confidence below threshold — require human approval before any outbound action.");
  if (items.length === 0)                            items.push("No critical blockers found. Verify references and close ticket.");
  return items;
}

/* ─── Radial Gauge ───────────────────────────────────────────── */
function RadialGauge({ score }: { score: number }) {
  const size = 160;
  const r = 64;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score));
  const dashoffset = circ * (1 - pct);
  const color = confColor(pct);

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
        role="img"
        aria-label={`Confidence score: ${(pct * 100).toFixed(0)}%`}
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="gauge-label">
        <span style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 800, color, lineHeight: 1 }}>
          {pct.toFixed(2)}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
          confidence
        </span>
      </div>
    </div>
  );
}

/* ─── Icons ──────────────────────────────────────────────────── */
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M10 7H4M4 7L7 4M4 7L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCheck = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
    <path d="M1 4L3 6.5L7 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCross = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
    <path d="M1.5 1.5L6.5 6.5M6.5 1.5L1.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ─── Page ───────────────────────────────────────────────────── */
export default function TicketDetailPage() {
  const { id: ticketId } = useParams<{ id: string }>();
  const [data, setData] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/tickets/${ticketId}`);
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    };
    void load();
  }, [ticketId]);

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: 300 }}>
        <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Loading audit trail…</span>
      </div>
    );
  }

  if (!data?.audit?.ticket_id) {
    return (
      <>
        <Link href="/" className="back-link"><IconBack /> Back to Dashboard</Link>
        <div className="panel">
          <div className="empty-state">
            <strong style={{ color: "var(--text)" }}>Ticket not found</strong>
            <span style={{ fontSize: "0.85rem" }}>Run the agent first to populate the audit trail.</span>
          </div>
        </div>
      </>
    );
  }

  const { original_ticket: orig, audit } = data;
  const qt    = queryType(orig.subject, orig.body);
  const urg   = urgency(orig.subject, orig.body);
  const name  = nameFromEmail(orig.customer_email);
  const items = checklist(audit);

  return (
    <>
      {/* ─── Breadcrumb ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" className="back-link"><IconBack /> Back to Dashboard</Link>
        <span className="ticket-id">{ticketId}</span>
      </div>

      {/* ─── Page header ─────────────────────────────── */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Audit Trail</p>
          <h1 className="page-title">{orig.subject || ticketId}</h1>
          <p className="page-subtitle">
            Human review workspace: customer query, AI execution path, and recommended follow-up actions.
          </p>
        </div>
        {audit.final_decision && (
          <Badge label={audit.final_decision} variant={getDecisionVariant(audit.final_decision)} />
        )}
      </div>

      {/* ─── Meta cards ──────────────────────────────── */}
      <div className="meta-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {[
          { label: "Customer",   value: name,                            sub: orig.customer_email },
          { label: "Query Type", value: qt.label,                        sub: qt.note },
          { label: "Urgency",    value: urg.label,                       sub: urg.note },
          { label: "Created",    value: fmtDate(orig.created_at),        sub: `Source: ${orig.source}` },
          { label: "Customer",   value: audit.customer_ref || "—",       sub: "ref" },
          { label: "Order",      value: audit.order_ref || "—",          sub: "ref" },
          { label: "Product",    value: audit.product_ref || "—",        sub: "ref" },
          { label: "Tool Calls", value: audit.tool_calls?.length ?? 0,   sub: "in audit log" },
        ].map(({ label, value, sub }, i) => (
          <div className="meta-card" key={i}>
            <span className="meta-label">{label}</span>
            <span className="meta-value" style={{ fontSize: "0.92rem" }}>{value}</span>
            {sub && <span className="meta-sub">{sub}</span>}
          </div>
        ))}
      </div>

      {/* ─── Query body ──────────────────────────────── */}
      <div className="panel" style={{ padding: "20px 22px" }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Customer Message</h2>
        <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.75, fontSize: "0.9rem" }}>{orig.body}</p>
      </div>

      {/* ─── Two-column layout ───────────────────────── */}
      <div className="detail-grid">
        {/* ── Left: tool timeline + reasoning ── */}
        <div className="detail-stack">
          {/* Tool timeline */}
          <div className="panel" style={{ overflow: "hidden" }}>
            <div className="panel-header">
              <h2 className="panel-title">Tool Call Timeline</h2>
              <span className="pill">{audit.tool_calls?.length ?? 0} calls</span>
            </div>
            <div style={{ padding: "16px 18px" }}>
              {(!audit.tool_calls || audit.tool_calls.length === 0) ? (
                <div className="empty-state" style={{ minHeight: 80, padding: "24px" }}>No tool calls recorded.</div>
              ) : (
                <div className="timeline">
                  {audit.tool_calls.map((tc, i) => (
                    <div className="timeline-item" key={i}>
                      <div className={`timeline-dot ${tc.success ? "success" : "failure"}`}>
                        {tc.success ? <IconCheck /> : <IconCross />}
                      </div>
                      <div className={`timeline-content ${tc.success ? "success" : "failure"}`}>
                        <div className="timeline-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span className="timeline-tool">{tc.tool_name}</span>
                            <span className={`badge ${tc.success ? "badge-resolved" : "badge-failed"}`}>{tc.tag}</span>
                          </div>
                          <span className="timeline-dur">{tc.duration_ms.toFixed(0)} ms</span>
                        </div>
                        <div className="timeline-io">
                          <div><strong>Input: </strong>
                            <span className="code-block">{JSON.stringify(tc.inputs).substring(0, 200)}</span>
                          </div>
                          <div style={{ marginTop: 4 }}><strong>Output: </strong>
                            <span className="code-block">
                              {JSON.stringify(tc.outputs).substring(0, 280)}
                              {JSON.stringify(tc.outputs).length > 280 && "…"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reasoning trace */}
          {audit.reasoning_trace?.length > 0 && (
            <div className="panel" style={{ overflow: "hidden" }}>
              <div className="panel-header">
                <h2 className="panel-title">Reasoning Trace</h2>
                <span className="pill">{audit.reasoning_trace.length} steps</span>
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div className="timeline">
                  {audit.reasoning_trace.map((r, i) => (
                    <div className="timeline-item" key={i}>
                      <div className="timeline-dot neutral" />
                      <div className="timeline-content neutral">
                        <div className="timeline-top" style={{ marginBottom: 6 }}>
                          <span className="badge badge-processing">{r.step}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                          {r.reasoning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: confidence + actions + refs ── */}
        <div className="detail-stack">
          {/* Confidence gauge */}
          <div className="panel" style={{ padding: "20px 22px" }}>
            <h2 className="section-title" style={{ marginBottom: 16 }}>Confidence Score</h2>
            {audit.confidence_score !== null ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <RadialGauge score={audit.confidence_score} />
                <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, textAlign: "center" }}>
                  {[["Low", "< 0.6", "var(--rose)"], ["Med", "0.6–0.8", "var(--amber)"], ["High", "≥ 0.8", "var(--emerald)"]].map(
                    ([lvl, range, color]) => (
                      <div key={lvl} style={{ padding: "6px 8px", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "0.68rem", fontWeight: 700, color, letterSpacing: "0.06em" }}>{lvl}</div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-subtle)" }}>{range}</div>
                      </div>
                    )
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
                  {audit.confidence_score < 0.6
                    ? "Below threshold — escalation was required."
                    : "Above threshold — autonomous decision was permitted."}
                </p>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>Not yet scored.</p>
            )}
          </div>

          {/* Next actions */}
          <div className="panel" style={{ padding: "20px 22px" }}>
            <h2 className="section-title" style={{ marginBottom: 14 }}>Recommended Actions</h2>
            <div className="stack-12">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px 1fr",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    alignItems: "start",
                    fontSize: "0.82rem",
                    lineHeight: 1.55,
                  }}
                >
                  <span
                    style={{
                      width: 22, height: 22,
                      borderRadius: "50%",
                      background: "var(--indigo-light)",
                      color: "var(--indigo)",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Escalation summary */}
          {audit.escalation_summary && (
            <div className="highlight-panel escalated">
              <h2 className="section-title" style={{ marginBottom: 10, fontSize: "0.95rem" }}>Escalation Summary</h2>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                {audit.escalation_summary}
              </p>
            </div>
          )}

          {/* Reply sent */}
          {audit.reply_sent && (
            <div className="highlight-panel reply">
              <h2 className="section-title" style={{ marginBottom: 10, fontSize: "0.95rem" }}>Reply Sent to Customer</h2>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.7, fontStyle: "italic" }}>
                {audit.reply_sent}
              </p>
            </div>
          )}

          {/* Retry events */}
          {audit.retry_events?.length > 0 && (
            <div className="panel" style={{ padding: "18px 20px" }}>
              <h2 className="section-title" style={{ marginBottom: 14, fontSize: "0.95rem" }}>Retry Events</h2>
              <div className="stack-12">
                {audit.retry_events.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 12px",
                      background: "var(--amber-tint)",
                      border: "1px solid rgba(217,119,6,0.2)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.8rem",
                    }}
                  >
                    <strong>{r.tool_name}</strong>
                    <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>
                      Attempt {r.attempt} · Backoff {r.backoff_seconds}s · {r.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {audit.errors?.length > 0 && (
            <div className="panel" style={{ padding: "18px 20px" }}>
              <h2 className="section-title" style={{ marginBottom: 14, fontSize: "0.95rem" }}>Errors</h2>
              <div className="stack-12">
                {audit.errors.map((err, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 12px",
                      background: "var(--rose-light)",
                      border: "1px solid rgba(225,29,72,0.2)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span className="badge badge-failed" style={{ marginBottom: 6 }}>{err.tag}</span>
                    <p style={{ margin: 0, color: "var(--text-muted)" }}>{err.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
