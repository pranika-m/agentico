"use client";

import Link from "next/link";
import { useState } from "react";
import { apiPost } from "@/lib/api";

interface SubmitResponse {
  status: string;
  ticket_id: string;
}

const initialForm = {
  name: "",
  email: "",
  customer_id: "",
  order_id: "",
  product_id: "",
  query: "",
};

export default function SubmitTicket() {
  const [form, setForm] = useState(initialForm);
  const [createdTicket, setCreatedTicket] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiPost<SubmitResponse>("/tickets/submit", form);
      setCreatedTicket(response.ticket_id);
      setForm(initialForm);
    } catch {
      setError("The request could not be added. Check the backend connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">Request intake</p>
          <h1 className="page-title">Add a New Support Request</h1>
          <p className="page-subtitle">
            Capture the customer query and any known customer, order, or product references so Agentico can produce a more accurate reply.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary">Back to queue</Link>
      </div>

      <div className="split-layout">
        <form onSubmit={handleSubmit} className="panel panel-body form-stack">
          {error && <div className="error-bar">{error}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="name">Customer name</label>
              <input
                id="name"
                className="form-input"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Customer email</label>
              <input
                id="email"
                className="form-input"
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </div>

          <div className="form-grid three">
            <div className="form-group">
              <label className="form-label" htmlFor="customer_id">Customer ID</label>
              <input
                id="customer_id"
                className="form-input"
                placeholder="C001"
                value={form.customer_id}
                onChange={(event) => setForm({ ...form, customer_id: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="order_id">Order ID</label>
              <input
                id="order_id"
                className="form-input"
                placeholder="ORD-1001"
                value={form.order_id}
                onChange={(event) => setForm({ ...form, order_id: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="product_id">Product ID</label>
              <input
                id="product_id"
                className="form-input"
                placeholder="P001"
                value={form.product_id}
                onChange={(event) => setForm({ ...form, product_id: event.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="query">Customer query</label>
            <textarea
              id="query"
              className="form-input"
              required
              rows={8}
              value={form.query}
              onChange={(event) => setForm({ ...form, query: event.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Adding request..." : "Add request"}
          </button>
        </form>

        <aside className="panel panel-body stack-16">
          <h2 className="section-title">How it connects</h2>
          <p className="text-muted">
            Agentico assigns the next available ticket number, saves the query in the shared queue, and uses the supplied references during the agent run.
          </p>

          {createdTicket ? (
            <div className="success-card compact">
              <span className="ticket-id">{createdTicket}</span>
              <h3>Request added</h3>
              <p className="text-muted">It is now visible in the unified queue.</p>
              <Link className="btn btn-secondary" href="/">View queue</Link>
            </div>
          ) : (
            <div className="meta-grid">
              <div className="meta-card">
                <span className="meta-label">Ticket number</span>
                <span className="meta-value">Auto</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Initial state</span>
                <span className="meta-value">Queued</span>
              </div>
              <div className="meta-card">
                <span className="meta-label">Sheet mode</span>
                <span className="meta-value">Upsert</span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
