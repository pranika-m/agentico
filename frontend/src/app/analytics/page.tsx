"use client";

import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";

interface Analytics {
  total: number;
  resolved: number;
  escalated: number;
  dead_letter: number;
  avg_confidence: number;
  confidence_distribution: Record<string, number>;
  failure_types: Record<string, number>;
  tool_call_frequency: Record<string, number>;
}

/* ─── Radial gauge (donut variant for analytics) ────────────── */
function DonutChart({
  segments,
  size = 130,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
}) {
  const r = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;

  const arcs = segments.map((seg, index) => {
    const pct = seg.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const cumulative = segments.slice(0, index).reduce((sum, item) => sum + item.value, 0);
    const rotate = (cumulative / total) * 360;
    return { ...seg, dash, gap, rotate };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Resolution distribution donut chart">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="14" />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth="14"
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={circumference * 0.25}
          style={{ transform: `rotate(${arc.rotate}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "stroke-dasharray 0.7s cubic-bezier(0.16,1,0.3,1)" }}
        />
      ))}
    </svg>
  );
}

/* ─── Confidence radial ──────────────────────────────────────── */
function ConfidenceRing({ score, size = 110 }: { score: number; size?: number }) {
  const r = (size - 18) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score));
  const dashoffset = circumference * (1 - pct);
  const color = pct >= 0.8 ? "var(--emerald)" : pct >= 0.6 ? "var(--amber)" : "var(--rose)";

  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="gauge-label">
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color, lineHeight: 1 }}>
          {pct.toFixed(2)}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--text-subtle)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
          avg score
        </span>
      </div>
    </div>
  );
}

/* ─── Stat mini card ─────────────────────────────────────────── */
function MiniStat({
  label,
  value,
  color,
  badge,
}: {
  label: string;
  value: string | number;
  color: string;
  badge: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label" style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>{label}</span>
        <span className="badge" style={{ background: `${color}18`, color, border: "none" }}>{badge}</span>
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-bar" style={{ background: color, opacity: 0.5 }} />
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/analytics`);
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
    };
    void load();
  }, []);

  if (!data) {
    return (
      <>
        <div className="page-header">
          <div>
            <p className="eyebrow">Observability</p>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">Run the agent first to populate performance data.</p>
          </div>
        </div>
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 14V7h3v7H3ZM8.5 14V4h3v10h-3ZM14 14V10h3v4H14Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <strong style={{ color: "var(--text)" }}>No analytics yet</strong>
            <span style={{ fontSize: "0.85rem" }}>Data appears here after the agent has processed tickets.</span>
          </div>
        </div>
      </>
    );
  }

  /* ── Derived values ─────────────────────────────────────────── */
  const resolutionSegments = [
    { value: data.resolved, color: "var(--emerald)", label: "Resolved" },
    { value: data.escalated, color: "var(--amber)", label: "Escalated" },
    { value: data.dead_letter, color: "var(--rose)", label: "Dead letter" },
  ].filter((s) => s.value > 0);

  const maxDecision = Math.max(data.resolved, data.escalated, data.dead_letter, 1);

  const confEntries = Object.entries(data.confidence_distribution).sort(([a], [b]) => a.localeCompare(b));
  const maxConf = Math.max(...confEntries.map(([, v]) => v), 1);

  const toolEntries = Object.entries(data.tool_call_frequency).sort(([, a], [, b]) => b - a);
  const maxTool = Math.max(...toolEntries.map(([, v]) => v), 1);

  const failureEntries = Object.entries(data.failure_types).sort(([, a], [, b]) => b - a);

  const confBucketColor = (bucket: string) => {
    if (bucket.startsWith("0.8") || bucket === "1.0") return "var(--emerald)";
    if (bucket.startsWith("0.6") || bucket.startsWith("0.7")) return "var(--amber)";
    return "var(--rose)";
  };

  return (
    <>
      {/* ─── Header ──────────────────────────────── */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Observability</p>
          <h1 className="page-title">Performance & Trust Signals</h1>
          <p className="page-subtitle">
            Resolution mix, confidence distribution, failure patterns, and tool usage across the full ticket batch.
          </p>
        </div>
        <span className="pill">{data.total} tickets processed</span>
      </div>

      {/* ─── Top stat cards ───────────────────────── */}
      <div className="stat-grid">
        <MiniStat label="Resolved"       value={data.resolved}                  color="var(--emerald)" badge="Direct" />
        <MiniStat label="Escalated"      value={data.escalated}                 color="var(--amber)"   badge="Specialist" />
        <MiniStat label="Dead Letters"   value={data.dead_letter}               color="var(--rose)"    badge="Recovery" />
        <MiniStat label="Avg Confidence" value={data.avg_confidence.toFixed(2)} color="var(--indigo)"  badge="Score" />
      </div>

      {/* ─── Row 1: Donut + Confidence + Bar chart ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Resolution donut */}
        <div className="panel" style={{ padding: "20px 22px" }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>Resolution Mix</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <DonutChart segments={resolutionSegments} size={130} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resolutionSegments.map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{s.label}</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)", marginLeft: "auto" }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Confidence ring */}
        <div className="panel" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="section-title">Average Confidence</h2>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
            <ConfidenceRing score={data.avg_confidence} size={120} />
          </div>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
            {data.avg_confidence >= 0.8
              ? "High confidence — strong autonomous resolution rate."
              : data.avg_confidence >= 0.6
              ? "Moderate confidence — some cases required escalation."
              : "Low confidence — most tickets required human review."}
          </p>
        </div>

        {/* Resolution bar chart */}
        <div className="panel" style={{ padding: "20px 22px" }}>
          <h2 className="section-title" style={{ marginBottom: 18 }}>Decision Comparison</h2>
          <div className="bar-columns">
            {[
              { label: "Resolved",    value: data.resolved,    color: "var(--emerald)" },
              { label: "Escalated",   value: data.escalated,   color: "var(--amber)" },
              { label: "Dead Letter", value: data.dead_letter, color: "var(--rose)" },
            ].map((b) => (
              <div className="bar-col" key={b.label}>
                <span className="bar-col-val">{b.value}</span>
                <div
                  className="bar-col-fill"
                  style={{
                    height: `${(b.value / maxDecision) * 130}px`,
                    background: b.color,
                    opacity: 0.85,
                    minHeight: b.value > 0 ? 8 : 0,
                  }}
                />
                <span className="bar-col-lbl">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Row 2: Confidence histogram + Tool frequency ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Confidence distribution */}
        <div className="panel" style={{ padding: "20px 22px" }}>
          <div className="section-row">
            <h2 className="section-title">Confidence Distribution</h2>
          </div>
          {confEntries.length === 0 ? (
            <div className="empty-state" style={{ padding: "24px", minHeight: "unset" }}>No data</div>
          ) : (
            <div className="bar-columns">
              {confEntries.map(([bucket, count]) => (
                <div className="bar-col" key={bucket}>
                  <span className="bar-col-val">{count}</span>
                  <div
                    className="bar-col-fill"
                    style={{
                      height: `${(count / maxConf) * 130}px`,
                      background: confBucketColor(bucket),
                      opacity: 0.8,
                      minHeight: count > 0 ? 4 : 0,
                    }}
                  />
                  <span className="bar-col-lbl">{bucket}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool frequency */}
        <div className="panel" style={{ padding: "20px 22px" }}>
          <div className="section-row">
            <h2 className="section-title">Tool Call Frequency</h2>
            <span className="pill">{toolEntries.length} tools</span>
          </div>
          <div className="h-bar-list">
            {toolEntries.map(([name, count]) => (
              <div className="h-bar-row" key={name}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>
                  {name}
                </span>
                <div className="h-bar-track">
                  <div className="h-bar-fill" style={{ width: `${(count / maxTool) * 100}%` }} />
                </div>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Row 3: Failure breakdown ─────────────────── */}
      {failureEntries.length > 0 && (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div className="panel-header">
            <h2 className="panel-title">Failure Breakdown</h2>
            <span className="pill">{failureEntries.length} types</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Failure type</th>
                  <th>Count</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {failureEntries.map(([type, count]) => {
                  const total = failureEntries.reduce((s, [, c]) => s + c, 0);
                  const pct = ((count / total) * 100).toFixed(1);
                  return (
                    <tr key={type}>
                      <td><span className="badge badge-failed">{type}</span></td>
                      <td style={{ fontWeight: 700 }}>{count}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="h-bar-track" style={{ width: 80 }}>
                            <div
                              className="h-bar-fill"
                              style={{ width: `${(count / (failureEntries[0]?.[1] ?? 1)) * 100}%`, background: "var(--rose)" }}
                            />
                          </div>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
