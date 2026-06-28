"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";

interface WhatsAppMessage {
  time: string;
  message: string;
}

interface ContactSummary {
  message_count: number;
  last_contact: string;
  last_message: string;
  messages: WhatsAppMessage[];
}

interface SubmitResponse {
  status: string;
  ticket_id: string;
}

function classify(message: string) {
  const text = message.toLowerCase();
  if (/(refund|return|cancel|broken|damaged|not received|delivered)/.test(text)) return "Create ticket";
  if (/(price|policy|how|when|where)/.test(text)) return "Answer from policy";
  return "Monitor";
}

export default function WhatsAppIngest() {
  const [results, setResults] = useState<Record<string, ContactSummary> | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [queueState, setQueueState] = useState<Record<string, "idle" | "adding" | "added" | "error">>({});
  const [queuedTicketIds, setQueuedTicketIds] = useState<Record<string, string>>({});

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setFileName(file.name);
    setExpanded(null);
    setQueueState({});
    setQueuedTicketIds({});
    try {
      const formData = new FormData();
      formData.append("file", file);
      setResults(await apiPost<Record<string, ContactSummary>>("/ingest-whatsapp", formData));
    } catch {
      setError("Could not process this file. Upload a WhatsApp .txt export.");
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => Object.entries(results ?? {}).sort(([, a], [, b]) => b.message_count - a.message_count), [results]);
  const actionable = rows.filter(([, info]) => classify(info.last_message) === "Create ticket").length;

  const addToQueue = async (name: string, info: ContactSummary) => {
    const email = (emailDrafts[name] || "").trim();
    if (!email) {
      setQueueState((prev) => ({ ...prev, [name]: "error" }));
      return;
    }

    setQueueState((prev) => ({ ...prev, [name]: "adding" }));
    try {
      // Use this contact's own messages as the ticket body, so the agent
      // gets the full conversation context, not just the last line.
      const conversation = info.messages.map((m) => `[${m.time}] ${m.message}`).join("\n");
      const response = await apiPost<SubmitResponse>("/tickets/submit", {
        name,
        email,
        query: conversation,
        subject: `WhatsApp: ${name}`,
      });
      setQueueState((prev) => ({ ...prev, [name]: "added" }));
      setQueuedTicketIds((prev) => ({ ...prev, [name]: response.ticket_id }));
    } catch {
      setQueueState((prev) => ({ ...prev, [name]: "error" }));
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Conversation intake</p>
          <h1 className="page-title">WhatsApp Support Triage</h1>
          <p className="page-subtitle">
            Upload an exported chat to identify contacts that should become support tickets or policy replies.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary">Back to queue</Link>
      </div>

      <section className="panel panel-body stack-16">
        <label className="upload-dropzone">
          <input
            type="file"
            accept=".txt"
            style={{ display: "none" }}
            onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])}
          />
          {fileName || "Select WhatsApp .txt export"}
        </label>

        {loading && <div className="empty-state">Parsing conversation export...</div>}
        {error && <div className="error-bar">{error}</div>}
      </section>

      {results && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Contacts</span>
              <span className="stat-value">{rows.length}</span>
              <p className="stat-description">People found in the export</p>
            </div>
            <div className="stat-card">
              <span className="stat-label">Ticket candidates</span>
              <span className="stat-value">{actionable}</span>
              <p className="stat-description">Last message likely needs queue follow-up</p>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Conversation Summary</h2>
              <span className="pill">{rows.length} contacts</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>Messages</th>
                    <th>Last contact</th>
                    <th>Recommended action</th>
                    <th>Last message</th>
                    <th>Detail</th>
                    <th>Add to queue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, info]) => {
                    const isOpen = expanded === name;
                    const state = queueState[name] ?? "idle";
                    return (
                      <Fragment key={name}>
                        <tr>
                          <td className="table-primary">{name}</td>
                          <td>{info.message_count}</td>
                          <td>{info.last_contact}</td>
                          <td><span className="priority priority-medium">{classify(info.last_message)}</span></td>
                          <td>{info.last_message}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setExpanded(isOpen ? null : name)}
                            >
                              {isOpen ? "Hide" : "View conversation"}
                            </button>
                          </td>
                          <td>
                            {state === "added" ? (
                              <span className="priority priority-low">✓ {queuedTicketIds[name]}</span>
                            ) : (
                              <div className="stack-8" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <input
                                  className="form-input form-input-sm"
                                  type="email"
                                  placeholder="customer email"
                                  value={emailDrafts[name] || ""}
                                  onChange={(event) =>
                                    setEmailDrafts((prev) => ({ ...prev, [name]: event.target.value }))
                                  }
                                  style={{ width: "150px" }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={state === "adding"}
                                  onClick={() => addToQueue(name, info)}
                                >
                                  {state === "adding" ? "Adding..." : "Add to queue"}
                                </button>
                              </div>
                            )}
                            {state === "error" && (
                              <p className="text-muted" style={{ color: "#c0392b", marginTop: "4px" }}>
                                Enter an email first.
                              </p>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7} style={{ background: "rgba(0,0,0,0.02)" }}>
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Time</th>
                                    <th>Message</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {info.messages.map((m, idx) => (
                                    <tr key={idx}>
                                      <td style={{ whiteSpace: "nowrap" }}>{m.time}</td>
                                      <td>{m.message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

