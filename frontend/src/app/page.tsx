"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import {
  CustomerDetailResponse,
  StatusData,
  TicketSummary,
  decisionVariant,
  emailToName,
  formatDate,
  priorityLabel,
  sourceLabel,
  ticketIntent,
} from "@/lib/domain";
import { Badge } from "@/components/Badge";
import { ConfidenceGauge } from "@/components/ConfidenceGauge";

type QueueFilter = "all" | "queued" | "active" | "resolved" | "escalated" | "review";

const filters: { key: QueueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "active", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "escalated", label: "Escalated" },
  { key: "review", label: "Needs review" },
];

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 2L11 7L3 12V2Z" fill="currentColor" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.5 6.5h8M7.5 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({ label, value, description }: { label: string; value: string | number; description: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <p className="stat-description">{description}</p>
    </div>
  );
}

function CustomerDrawer({
  data,
  loading,
  error,
  onClose,
}: {
  data: CustomerDetailResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={(event) => event.currentTarget === event.target && onClose()}>
      <section className="modal-drawer" aria-label="Customer profile">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Customer context</p>
            <h2 className="drawer-title">
              {data?.customer?.name ?? (data ? emailToName(data.customer_email) : "Loading")}
            </h2>
            <p className="text-muted">{data?.customer?.email ?? data?.customer_email}</p>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>

        <div className="drawer-body">
          {loading && <div className="empty-state">Loading customer profile...</div>}
          {error && <div className="error-bar">{error}</div>}
          {!loading && data && (
            <>
              <div className="meta-grid">
                <div className="meta-card">
                  <span className="meta-label">Tier</span>
                  <span className="meta-value">{data.customer?.tier ?? "Unknown"}</span>
                </div>
                <div className="meta-card">
                  <span className="meta-label">Orders</span>
                  <span className="meta-value">{data.customer?.total_orders ?? 0}</span>
                </div>
                <div className="meta-card">
                  <span className="meta-label">Lifetime spend</span>
                  <span className="meta-value">${(data.customer?.total_spent ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {data.customer?.notes && (
                <div className="panel panel-body">
                  <h3 className="section-title">Account notes</h3>
                  <p className="text-muted">{data.customer.notes}</p>
                </div>
              )}

              <div className="panel">
                <div className="panel-header">
                  <h3 className="panel-title">Related tickets</h3>
                  <span className="pill">{data.queries.length}</span>
                </div>
                <div className="stack-12 panel-body">
                  {data.queries.map((ticket) => (
                    <Link href={`/tickets/${ticket.ticket_id}`} className="related-ticket" key={ticket.ticket_id}>
                      <div>
                        <span className="ticket-id">{ticket.ticket_id}</span>
                        <p>{ticket.subject}</p>
                      </div>
                      <Badge label={ticket.final_decision || ticket.state} variant={decisionVariant(ticket.final_decision || ticket.state)} />
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Dashboard() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<CustomerDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const [ticketResponse, statusResponse] = await Promise.all([
      apiGet<{ tickets: TicketSummary[] }> ("/tickets"),
      apiGet<StatusData>("/status"),
    ]);
    return { tickets: ticketResponse.tickets, status: statusResponse };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncQueue = async () => {
      try {
        const data = await loadQueue();
        if (!cancelled) {
          setTickets(data.tickets);
          setStatus(data.status);
        }
      } catch {
        if (!cancelled) {
          setError("Backend is offline. Start the API server on port 8000.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void syncQueue();

    return () => {
      cancelled = true;
    };
  }, [loadQueue]);

  const runAgent = async () => {
    setIsRunning(true);
    setError(null);
    try {
      await apiPost("/run");
      const poll = window.setInterval(async () => {
        try {
          const data = await loadQueue();
          setTickets(data.tickets);
          setStatus(data.status);
          if (data.status.total > 0 && data.status.completed >= data.status.total) {
            window.clearInterval(poll);
            setIsRunning(false);
          }
        } catch {
          window.clearInterval(poll);
          setIsRunning(false);
        }
      }, 1800);
    } catch {
      setError("Could not start the agent run.");
      setIsRunning(false);
    }
  };

  const openCustomer = async (email: string) => {
    setDrawer(null);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      setDrawer(await apiGet<CustomerDetailResponse>(`/customers/${encodeURIComponent(email)}`));
    } catch {
      setDrawerError("Unable to load this customer.");
    } finally {
      setDrawerLoading(false);
    }
  };

  const filteredTickets = useMemo(() => {
    const query = search.toLowerCase().trim();
    return tickets.filter((ticket) => {
      const statusValue = (ticket.final_decision || ticket.state).toLowerCase();
      const matchesFilter =
        filter === "all" ||
        (filter === "queued" && ticket.state === "QUEUED") ||
        (filter === "active" && ["ingested", "context_loaded", "planned", "executing"].includes(statusValue)) ||
        (filter === "resolved" && statusValue === "resolved") ||
        (filter === "escalated" && statusValue === "escalated") ||
        (filter === "review" && (!ticket.has_audit || ticket.confidence_score === null || ticket.confidence_score < 0.6));
      const matchesSearch =
        !query ||
        ticket.ticket_id.toLowerCase().includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.customer_email.toLowerCase().includes(query) ||
        ticket.body.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [filter, search, tickets]);

  const resolved = tickets.filter((ticket) => ticket.final_decision === "RESOLVED").length;
  const escalated = tickets.filter((ticket) => ticket.final_decision === "ESCALATED").length;
  const queued = tickets.filter((ticket) => ticket.state === "QUEUED").length;
  const review = tickets.filter((ticket) => !ticket.has_audit || (ticket.confidence_score ?? 1) < 0.6).length;
  const live = isRunning || status?.job_status === "running";

  return (
    <>
      <div className="run-bar">
        <div className="run-bar-left">
          <span className={`run-status-indicator ${live ? "running" : "idle"}`} />
          <div>
            <span className="run-bar-label">{live ? "Agent run in progress" : "Support command center"}</span>
            <span className="run-bar-meta">{status?.completed ?? 0}/{status?.total ?? tickets.length} processed</span>
          </div>
        </div>
        <div className="run-bar-right">
          <Link className="btn btn-secondary" href="/submit">Add new request</Link>
          <button className="btn btn-primary" onClick={runAgent} disabled={isRunning}>
            <IconPlay />
            {isRunning ? "Processing..." : "Run policy agent"}
          </button>
        </div>
      </div>

      {error && <div className="error-bar">{error}</div>}

      <div className="page-header">
        <div>
          <p className="eyebrow">Agentico operations</p>
          <h1 className="page-title">Autonomous Support Command Center</h1>
          <p className="page-subtitle">
            Intake, customer context, policy decisions, escalations, and audit evidence in one connected queue.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/analytics">View analytics <IconArrow /></Link>
      </div>

      <div className="stat-grid">
        <StatCard label="Queue" value={tickets.length} description={`${queued} waiting for an agent pass`} />
        <StatCard label="Resolved" value={resolved} description="Closed by policy-backed automation" />
        <StatCard label="Escalated" value={escalated} description="Routed to a specialist with context" />
        <StatCard label="Review" value={review} description="Missing audit evidence or low confidence" />
      </div>

      <section className="panel">
        <div className="panel-header queue-header">
          <div>
            <h2 className="panel-title">Unified Ticket Queue</h2>
            <p className="panel-subtitle">Public form, email, queue imports, and agent outputs are shown together.</p>
          </div>
          <input
            className="form-input queue-search"
            placeholder="Search ticket, customer, or issue"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="filter-row">
          {filters.map((item) => (
            <button key={item.key} className={`filter-chip ${filter === item.key ? "active" : ""}`} onClick={() => setFilter(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Customer</th>
                <th>References</th>
                <th>Intent</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="empty-state">Loading the support queue...</div></td></tr>
              ) : filteredTickets.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state">No tickets match this view.</div></td></tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr key={ticket.ticket_id}>
                    <td>
                      <span className="ticket-id">{ticket.ticket_id}</span>
                      <p className="table-primary">{ticket.subject}</p>
                      <span className="text-subtle">{sourceLabel(ticket.source)} - {formatDate(ticket.created_at)}</span>
                    </td>
                    <td>
                      <button className="customer-btn" onClick={() => openCustomer(ticket.customer_email)}>
                        {emailToName(ticket.customer_email)}
                      </button>
                      <span className="table-secondary">{ticket.customer_email}</span>
                    </td>
                    <td>
                      <div className="ref-stack">
                        {ticket.customer_id && <span>C: {ticket.customer_id}</span>}
                        {ticket.order_id && <span>O: {ticket.order_id}</span>}
                        {ticket.product_id && <span>P: {ticket.product_id}</span>}
                        {!ticket.customer_id && !ticket.order_id && !ticket.product_id && <span className="text-subtle">None supplied</span>}
                      </div>
                    </td>
                    <td>{ticketIntent(ticket)}</td>
                    <td><span className={`priority priority-${priorityLabel(ticket).toLowerCase()}`}>{priorityLabel(ticket)}</span></td>
                    <td><Badge label={ticket.final_decision || ticket.state} variant={decisionVariant(ticket.final_decision || ticket.state)} /></td>
                    <td>
                      {ticket.confidence_score === null ? (
                        <span className="text-subtle">Awaiting run</span>
                      ) : (
                        <ConfidenceGauge score={ticket.confidence_score} label="" />
                      )}
                    </td>
                    <td>
                      <Link className="view-link" href={`/tickets/${ticket.ticket_id}`}>
                        Audit <IconArrow />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(drawer || drawerLoading || drawerError) && (
        <CustomerDrawer
          data={drawer}
          loading={drawerLoading}
          error={drawerError}
          onClose={() => {
            setDrawer(null);
            setDrawerError(null);
          }}
        />
      )}
    </>
  );
}

