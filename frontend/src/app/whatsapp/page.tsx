"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPost } from "@/lib/api";

interface ContactSummary {
  message_count: number;
  last_contact: string;
  last_message: string;
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

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setFileName(file.name);
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, info]) => (
                    <tr key={name}>
                      <td className="table-primary">{name}</td>
                      <td>{info.message_count}</td>
                      <td>{info.last_contact}</td>
                      <td><span className="priority priority-medium">{classify(info.last_message)}</span></td>
                      <td>{info.last_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
