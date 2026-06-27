"""
routes.py — FastAPI endpoints for the Agentico frontend.

POST /api/run is non-blocking — uses BackgroundTasks, returns job ID immediately.
"""

import json
import uuid
import asyncio
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, UploadFile
from core.logger import get_audit_logger
from core.state_manager import get_state_manager
from core.dead_letter_queue import get_dead_letter_queue
from tools.read_tools import reset_read_failures
from tools.write_tools import reset_tool_state


router = APIRouter(prefix="/api")

# =========================
# [JOB STATE]
# =========================

_current_job = {"id": None, "status": "idle"}  # idle | running | completed

DATA_DIR = Path(__file__).parent.parent / "data"
AUDIT_LOG_PATH = Path(__file__).parent.parent / "audit_log.json"


def _load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_tickets():
    return _load_json(DATA_DIR / "tickets.json", [])


def _load_persisted_logs():
    return _load_json(AUDIT_LOG_PATH, [])


def _all_audit_logs():
    logger = get_audit_logger()
    logs = logger.get_all_logs()
    return logs or _load_persisted_logs()


def _ticket_summary(original: dict, log: dict | None = None, state=None):
    log = log or {}
    state_value = state.value if state else ("QUEUED" if not log else "UNKNOWN")
    decision = log.get("final_decision")
    tool_calls = log.get("tool_calls", [])

    return {
        "ticket_id": original.get("ticket_id", log.get("ticket_id", "")),
        "subject": original.get("subject", log.get("subject", "")),
        "customer_email": original.get("customer_email", log.get("customer_email", "")),
        "body": original.get("body", ""),
        "query": original.get("query", original.get("body", "")),
        "customer_id": original.get("customer_id"),
        "order_id": original.get("order_id"),
        "product_id": original.get("product_id"),
        "source": original.get("source", ""),
        "created_at": original.get("created_at", ""),
        "state": state_value,
        "final_decision": decision,
        "confidence_score": log.get("confidence_score"),
        "tool_call_count": len(tool_calls),
        "has_audit": bool(log),
        "reply": log.get("reply_sent") or original.get("reply"),
    }


def _next_ticket_id(tickets: list[dict]) -> str:
    highest = 0
    for ticket in tickets:
        raw_id = str(ticket.get("ticket_id", ""))
        if not raw_id.startswith("TKT-"):
            continue
        suffix = raw_id.replace("TKT-", "", 1)
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return f"TKT-{highest + 1:03d}"


# =========================
# [BACKGROUND TASK] — Run agent
# =========================

async def _run_agent_task():
    """Background task that runs the agent on all tickets."""
    from agent.agent_loop import run_batch_ticket_processing

    tickets = _load_tickets()

    _current_job["status"] = "running"

    try:
        await run_batch_ticket_processing(tickets)
        _current_job["status"] = "completed"
    except Exception as e:
        _current_job["status"] = "completed"
        print(f"Agent run error: {e}")


# =========================
# [ENDPOINTS]
# =========================

@router.post("/run")
async def run_agent(background_tasks: BackgroundTasks):
    """
    Trigger the agent to process all 20 tickets.
    Non-blocking — returns job ID immediately.
    """
    # Reset state for fresh run
    from core.state_manager import StateManager
    from core.logger import AuditLogger
    from core.dead_letter_queue import DeadLetterQueue
    import core.state_manager as sm_mod
    import core.logger as log_mod
    import core.dead_letter_queue as dlq_mod

    sm_mod._manager = StateManager()
    log_mod._logger = AuditLogger()
    dlq_mod._dlq = DeadLetterQueue()
    reset_tool_state()
    reset_read_failures()

    job_id = str(uuid.uuid4())[:8]
    _current_job["id"] = job_id
    _current_job["status"] = "running"

    background_tasks.add_task(_run_agent_task)

    return {"job_id": job_id, "status": "running", "message": "Agent started processing all tickets."}


@router.post("/tickets/submit")
async def submit_ticket(ticket: dict):
    """
    Accepts a real ticket from the public form.
    Expected body: {"name": "...", "email": "...", "query": "...", optional refs...}
    """
    tickets_path = DATA_DIR / "tickets.json"
    tickets = _load_tickets()
    query = (ticket.get("query") or ticket.get("issue") or "").strip()
    subject_seed = ticket.get("subject") or (query.splitlines()[0] if query else "New support request")
    subject = subject_seed[:80]

    new_ticket = {
        "ticket_id": _next_ticket_id(tickets),
        "customer_name": (ticket.get("name") or "").strip(),
        "customer_email": (ticket.get("email") or "").strip(),
        "customer_id": (ticket.get("customer_id") or "").strip() or None,
        "order_id": (ticket.get("order_id") or "").strip() or None,
        "product_id": (ticket.get("product_id") or "").strip() or None,
        "subject": subject,
        "query": query,
        "body": query,
        "reply": "",
        "source": "public_form",
        "created_at": datetime.utcnow().isoformat(),
    }
    tickets.append(new_ticket)

    with open(tickets_path, "w", encoding="utf-8") as f:
        json.dump(tickets, f, indent=2)

    return {"status": "received", "ticket_id": new_ticket["ticket_id"]}


@router.post("/ingest-whatsapp")
async def ingest_whatsapp(file: UploadFile):
    """
    Accepts a WhatsApp .txt export and returns last-contact summaries per sender.
    """
    from tools.whatsapp_tool import parse_whatsapp_export
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    return parse_whatsapp_export(text)


@router.get("/status")
async def get_status():
    """Get current processing status and per-ticket progress."""
    state_mgr = get_state_manager()
    summary = state_mgr.get_summary()

    states = state_mgr.get_all_states()
    tickets = []
    for tid, state in states.items():
        tickets.append({"ticket_id": tid, "state": state.value})

    return {
        "job_id": _current_job["id"],
        "job_status": _current_job["status"],
        "total": summary["total"],
        "completed": summary["completed"],
        "counts": summary["counts"],
        "tickets": tickets
    }


@router.get("/tickets")
async def get_all_tickets():
    """Get the complete ticket queue with best-known processing status."""
    state_mgr = get_state_manager()
    original_tickets = _load_tickets()
    logs_by_ticket = {log.get("ticket_id"): log for log in _all_audit_logs()}

    result = [
        _ticket_summary(ticket, logs_by_ticket.get(ticket.get("ticket_id")), state_mgr.get_state(ticket.get("ticket_id")))
        for ticket in original_tickets
    ]

    logged_ids = {ticket.get("ticket_id") for ticket in original_tickets}
    for ticket_id, log in logs_by_ticket.items():
        if ticket_id not in logged_ids:
            result.append(_ticket_summary({}, log, state_mgr.get_state(ticket_id)))

    return {"tickets": result}


@router.get("/tickets/{ticket_id}")
async def get_ticket_detail(ticket_id: str):
    """Get full audit trail for a single ticket."""
    log = get_audit_logger().get_ticket_log(ticket_id)
    if not log:
        log = next((l for l in _load_persisted_logs() if l.get("ticket_id") == ticket_id), {})

    tickets = _load_tickets()
    original = next((t for t in tickets if t["ticket_id"] == ticket_id), {})

    return {
        "ticket_id": ticket_id,
        "original_ticket": original,
        "audit": log,
        "has_audit": bool(log),
    }


@router.get("/customers")
async def get_customers():
    """Get lightweight customer list for UI display."""
    customers_path = DATA_DIR / "customers.json"
    with open(customers_path, "r", encoding="utf-8") as f:
        customers = json.load(f)

    result = [
        {
            "customer_id": c.get("customer_id"),
            "name": c.get("name"),
            "email": c.get("email"),
            "tier": c.get("tier"),
        }
        for c in customers
    ]
    return {"customers": result}


@router.get("/customers/{customer_email}")
async def get_customer_detail(customer_email: str):
    """Get customer profile and all related ticket queries."""
    state_mgr = get_state_manager()

    customers_path = DATA_DIR / "customers.json"
    customers = _load_json(customers_path, [])
    tickets = _load_tickets()

    customer = next(
        (c for c in customers if (c.get("email") or "").lower() == customer_email.lower()),
        None,
    )

    logs = _all_audit_logs()
    logs_by_ticket = {log.get("ticket_id"): log for log in logs}

    related_originals = [
        t for t in tickets if (t.get("customer_email") or "").lower() == customer_email.lower()
    ]

    related_queries = []
    for original in related_originals:
        ticket_id = original.get("ticket_id")
        log = logs_by_ticket.get(ticket_id, {})
        state = state_mgr.get_state(ticket_id)
        llm_feedback = "No customer response available yet."

        if log:
            reasoning_trace = log.get("reasoning_trace", [])
            react_reasoning = [
                entry.get("reasoning", "")
                for entry in reasoning_trace
                if str(entry.get("step", "")).startswith("REACT_STEP")
            ]

            if log.get("reply_sent"):
                llm_feedback = str(log.get("reply_sent"))
            elif react_reasoning:
                llm_feedback = f"Draft response reasoning: {react_reasoning[-1]}"
            elif log.get("escalation_summary"):
                llm_feedback = f"Escalation note: {str(log.get('escalation_summary'))[:180]}"
            elif log.get("final_decision"):
                llm_feedback = f"Final decision: {log.get('final_decision')}"

        related_queries.append(
            {
                "ticket_id": ticket_id,
                "subject": original.get("subject", ""),
                "body": original.get("body", ""),
                "source": original.get("source", ""),
                "created_at": original.get("created_at", ""),
                "state": state.value if state else "UNKNOWN",
                "final_decision": log.get("final_decision"),
                "confidence_score": log.get("confidence_score"),
                "tool_call_count": len(log.get("tool_calls", [])),
                "llm_feedback": llm_feedback,
            }
        )

    return {
        "customer": customer,
        "customer_email": customer_email,
        "queries": related_queries,
    }


@router.get("/analytics")
async def get_analytics():
    """Get aggregated analytics for the dashboard."""
    logs = _all_audit_logs()

    total = len(logs)
    resolved = sum(1 for l in logs if l.get("final_decision") == "RESOLVED")
    escalated = sum(1 for l in logs if l.get("final_decision") == "ESCALATED")
    dead_letter = sum(1 for l in logs if l.get("final_decision") == "DEAD_LETTER")

    # Confidence distribution
    scores = [l.get("confidence_score", 0) for l in logs if l.get("confidence_score") is not None]
    confidence_buckets = {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0}
    for s in scores:
        if s < 0.2: confidence_buckets["0.0-0.2"] += 1
        elif s < 0.4: confidence_buckets["0.2-0.4"] += 1
        elif s < 0.6: confidence_buckets["0.4-0.6"] += 1
        elif s < 0.8: confidence_buckets["0.6-0.8"] += 1
        else: confidence_buckets["0.8-1.0"] += 1

    # Failure breakdown
    failure_types = {"TIMEOUT": 0, "VALIDATION_ERROR": 0, "RETRY": 0, "TOOL_ERROR": 0}
    for l in logs:
        for err in l.get("errors", []):
            tag = err.get("tag", "")
            if tag in failure_types:
                failure_types[tag] += 1
        for retry in l.get("retry_events", []):
            failure_types["RETRY"] += 1

    # Tool call frequency
    tool_freq = {}
    for l in logs:
        for tc in l.get("tool_calls", []):
            name = tc.get("tool_name", "unknown")
            tool_freq[name] = tool_freq.get(name, 0) + 1

    avg_confidence = sum(scores) / len(scores) if scores else 0

    return {
        "total": total,
        "resolved": resolved,
        "escalated": escalated,
        "dead_letter": dead_letter,
        "avg_confidence": round(avg_confidence, 2),
        "confidence_distribution": confidence_buckets,
        "failure_types": failure_types,
        "tool_call_frequency": tool_freq,
    }


@router.get("/audit-log")
async def get_audit_log():
    """Get the full audit log."""
    return {"audit_log": _all_audit_logs()}


@router.get("/dead-letters")
async def get_dead_letters():
    """Get all dead-lettered tickets."""
    dlq = get_dead_letter_queue()
    return {"dead_letters": dlq.get_all()}

