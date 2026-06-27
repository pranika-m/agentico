export interface TicketSummary {
  ticket_id: string;
  subject: string;
  customer_email: string;
  customer_id?: string | null;
  order_id?: string | null;
  product_id?: string | null;
  body: string;
  query?: string;
  reply?: string;
  source: string;
  created_at: string;
  state: string;
  final_decision: string | null;
  confidence_score: number | null;
  tool_call_count: number;
  has_audit?: boolean;
  llm_feedback?: string;
}

export interface StatusData {
  job_id: string | null;
  job_status: string;
  total: number;
  completed: number;
  counts: Record<string, number>;
}

export interface CustomerProfile {
  customer_id: string;
  name: string;
  email: string;
  phone: string;
  tier: string;
  member_since: string;
  total_orders: number;
  total_spent: number;
  address?: { street: string; city: string; state: string; zip: string };
  notes?: string;
}

export interface CustomerDetailResponse {
  customer: CustomerProfile | null;
  customer_email: string;
  queries: TicketSummary[];
}

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

export function emailToName(email: string): string {
  const [local] = email.split("@");
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function decisionVariant(value?: string | null): BadgeVariant {
  const decision = (value || "").toLowerCase();
  if (decision === "resolved") return "success";
  if (decision === "escalated") return "warning";
  if (decision === "failed" || decision === "dead_letter") return "error";
  if (["executing", "planned", "context_loaded", "ingested", "queued"].includes(decision)) return "info";
  return "default";
}

export function formatDate(value?: string): string {
  if (!value) return "Pending";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ticketIntent(ticket: Pick<TicketSummary, "subject" | "body">): string {
  const text = `${ticket.subject} ${ticket.body}`.toLowerCase();
  if (/(refund|money back|charge|charged)/.test(text)) return "Refund";
  if (/(return|exchange)/.test(text)) return "Return";
  if (/(cancel|cancellation)/.test(text)) return "Cancellation";
  if (/(broken|damaged|defect|stopped working|wrong)/.test(text)) return "Quality issue";
  if (/(shipping|delivery|where is|delivered)/.test(text)) return "Delivery";
  if (/(policy|question|process)/.test(text)) return "Policy";
  return "General support";
}

export function priorityLabel(ticket: Pick<TicketSummary, "subject" | "body" | "state" | "final_decision">): string {
  const text = `${ticket.subject} ${ticket.body}`.toLowerCase();
  if (ticket.final_decision === "ESCALATED" || /(urgent|immediately|lawyer|bank|dispute|today)/.test(text)) return "High";
  if (ticket.state === "QUEUED" || /(refund|cancel|delivered)/.test(text)) return "Medium";
  return "Normal";
}

export function sourceLabel(source: string): string {
  return source.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
