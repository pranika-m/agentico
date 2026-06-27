import json
import os
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


def get_sheet():
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
    return client.open_by_key(spreadsheet_id).sheet1


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


def log_ticket_to_sheet(
    ticket_id,
    customer,
    status,
    confidence,
    query="",
    reply="",
    max_retries=3,
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

    for attempt in range(1, max_retries + 1):
        try:
            sheet = get_sheet()
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
            if attempt == max_retries:
                print(f"[sheets_sync] Failed to upsert {ticket_id} after {max_retries} attempts: {e}")
            else:
                time.sleep(1.5 * attempt)
