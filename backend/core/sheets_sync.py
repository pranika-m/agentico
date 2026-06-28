import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials


DEFAULT_SHEET_ID = "1DucCmUCtQeBeaZF1kjShF3pr5YhkgsmpHirNesydFTw"
HEADERS = ["ticket_id", "customer", "status", "confidence", "query", "reply", "updated_at"]
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _get_spreadsheet_id():
    return (os.environ.get("SHEET_ID", "") or DEFAULT_SHEET_ID).strip()


def _load_service_account_info():
    env_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if env_json:
        try:
            info = json.loads(env_json)
            if isinstance(info, dict) and info.get("type") == "service_account":
                return info
        except json.JSONDecodeError as exc:
            raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON") from exc

    env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if env_path:
        path = Path(env_path).expanduser()
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                info = json.load(handle)
            if isinstance(info, dict) and info.get("type") == "service_account":
                return info

    for candidate in [
        BACKEND_DIR / "service_account.json",
        BACKEND_DIR / ".." / "service_account.json",
        Path("service_account.json"),
    ]:
        path = candidate.expanduser().resolve()
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                info = json.load(handle)
            if isinstance(info, dict) and info.get("type") == "service_account":
                return info

    raise FileNotFoundError(
        "Google service account credentials were not found. Place backend/service_account.json "
        "or set GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON to a valid service-account JSON file."
    )


_sheet_cache = None  # cached gspread worksheet handle, reused across calls


def get_sheet(force_refresh: bool = False):
    """Return a cached worksheet handle. Re-authenticating and re-opening the
    spreadsheet on every single call (as before) multiplies API usage and was
    a major contributor to hitting Google Sheets' per-minute quota during
    batch runs. We now open it once and reuse it; pass force_refresh=True to
    force a fresh handle (e.g. after an auth-related failure)."""
    global _sheet_cache
    if _sheet_cache is not None and not force_refresh:
        return _sheet_cache

    service_account_info = _load_service_account_info()
    creds = Credentials.from_service_account_info(
        service_account_info,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.readonly",
        ],
    )
    client = gspread.authorize(creds)
    spreadsheet_id = _get_spreadsheet_id()
    if not spreadsheet_id:
        raise RuntimeError("SHEET_ID is not configured.")
    _sheet_cache = client.open_by_key(spreadsheet_id).sheet1
    return _sheet_cache


def _ensure_headers(sheet):
    existing = sheet.row_values(1)
    if existing == HEADERS:
        return

    if not existing:
        sheet.update("A1:G1", [HEADERS])
        return

    merged = list(existing)
    for header in HEADERS:
        if header not in merged:
            merged.append(header)
    sheet.update("A1", [merged])


def _row_from_headers(headers, values_by_header):
    return [str(values_by_header.get(header, "")) for header in headers]


def _find_ticket_row(records, ticket_id):
    for index, record in enumerate(records, start=2):
        if str(record.get("ticket_id", "")).strip() == str(ticket_id):
            return index
    return None


# Serializes writes to the Sheets API across concurrently-running tickets.
# Sending ~20 simultaneous requests at once (one per ticket via
# asyncio.to_thread) was blowing through Google Sheets' per-user/per-100s
# quota; capping concurrency here keeps us under it.
_sheet_write_semaphore = threading.Semaphore(3)


def log_ticket_to_sheet(
    ticket_id,
    customer,
    status,
    confidence,
    query="",
    reply="",
    max_retries=5,
):
    values = {
        "ticket_id": ticket_id,
        "customer": customer,
        "status": status,
        "confidence": confidence,
        "query": query,
        "reply": reply,
        "updated_at": datetime.utcnow().isoformat(),
    }

    last_error = None
    with _sheet_write_semaphore:
        for attempt in range(1, max_retries + 1):
            try:
                sheet = get_sheet(force_refresh=(attempt > 1 and last_error is not None and _looks_like_auth_error(last_error)))
                _ensure_headers(sheet)
                headers = sheet.row_values(1)
                row = _row_from_headers(headers, values)
                existing_row = _find_ticket_row(sheet.get_all_records(), ticket_id)

                if existing_row:
                    end_col = gspread.utils.rowcol_to_a1(existing_row, len(headers))
                    sheet.update(f"A{existing_row}:{end_col}", [row])
                else:
                    sheet.append_row(row)
                return
            except Exception as e:
                last_error = e
                if attempt == max_retries:
                    # IMPORTANT: re-raise instead of swallowing. Previously this
                    # function printed and returned normally on final failure,
                    # so callers had no way to know the Sheets write never
                    # happened -- tickets were marked successful and skipped
                    # the dead-letter queue even though they never landed in
                    # the sheet. Callers must now catch this and route to the
                    # DLQ on failure.
                    print(f"[sheets_sync] Failed to upsert {ticket_id} after {max_retries} attempts: {e}")
                    raise
                # Exponential backoff: quota windows are ~60-100s, so a fixed
                # 1.5s/3s backoff (the old behavior) almost never recovered in
                # time. Back off more aggressively, especially for rate-limit
                # errors.
                delay = min(2 ** attempt, 30)
                time.sleep(delay)


def _looks_like_auth_error(exc) -> bool:
    msg = str(exc).lower()
    return "401" in msg or "403" in msg or "unauthorized" in msg or "permission" in msg
