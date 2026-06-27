# Agentico — Autonomous Support Resolution Agent

Agentico is a ticket-resolution agent that ingests support requests from multiple
real channels — a public submission form and WhatsApp chat exports — triages them
with a Gemini-assisted ReAct reasoning loop, and logs every decision to both an
internal audit trail and a live Google Sheet, so non-technical stakeholders can
monitor outcomes without touching code.

The demo dataset represents a fictitious e-commerce business ("ShopWave") so the
agent has realistic customer, order, and product data to reason over — the product
itself is channel- and business-agnostic.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python, FastAPI, asyncio, Pydantic |
| Agent loop | Custom ReAct orchestration (reason → act → validate → observe) |
| LLM | Gemini-assisted planning and confidence scoring, with deterministic fallback |
| Persistence | JSON-based audit trail and dead-letter queue; Google Sheets sync for external visibility |
| Frontend | Next.js 16, React 19, custom design system |
| Design system | Storybook 10 |
| Packaging | Docker + docker-compose |

## What is implemented

### Agent core
- Concurrent ticket processing with `asyncio.gather`
- Minimum 3 tool calls enforced per reasoning chain
- Gemini-assisted planner and confidence scorer when `GEMINI_API_KEY` is present
- Deterministic fallback planning if the model is unavailable
- Deliberate failure injection for resilience testing:
  - timeout on one `get_customer` call
  - malformed `get_order` response on one call
  - partial `search_knowledge_base` response on one call
- Retry budgets with exponential backoff
- Schema validation before any agent action
- Dead-letter queue persistence for unrecoverable failures
- Confidence scoring with automatic escalation below `0.6`
- Structured, queryable audit log for every ticket

### Multi-channel intake
- Public ticket submission endpoint and form — real outside users can file tickets
  without needing the dashboard
- WhatsApp chat export ingestion — parses real `.txt` exports to surface
  last-contact times and message activity per conversation

### External visibility
- Every ticket outcome (decision, confidence, customer) syncs to a live Google
  Sheet with retry-on-failure, so a non-technical stakeholder can monitor results
  without ever opening the dashboard

### Frontend
- Responsive dashboard with live job status, analytics, and ticket drill-down
- Per-customer view showing all related tickets and the agent's reasoning trace
- Storybook component coverage for the underlying design system

## Project structure

```text
backend/
  agent/                  # planner, evaluator, loop, executor
  api/                    # FastAPI routes (run, tickets, submit, whatsapp ingest, analytics)
  core/                   # logger, retries, validator, state manager, DLQ, LLM client, sheets sync
  data/                   # customers, orders, products, tickets, knowledge base
  tools/                  # read tools, write tools, WhatsApp export parser
  audit_log.json
  dead_letter_queue.json
frontend/
  src/app/                # dashboard, analytics, ticket detail, submission form, WhatsApp audit
  src/components/         # design-system components
  src/stories/            # Storybook documentation
architecture.md
failure_modes.md
docker-compose.yml
```

## Run locally

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Gemini setup

Create `backend/.env`:

```text
GEMINI_API_KEY=your_key_here
SHEET_ID=your_google_sheet_id_here
```

Important:

- `backend/.env` and `backend/service_account.json` are ignored by `.gitignore`
- never commit real API keys or service account credentials to the public repo
- if a secret is ever accidentally committed, rotating it is mandatory — deleting
  the file in a later commit does not remove it from git history

If the Gemini key is missing or the API call fails, the agent still runs end-to-end
using deterministic fallback logic for both planning and confidence scoring.

## Google Sheets sync

1. Enable the Google Sheets API in Google Cloud Console
2. Create a service account, download its JSON key as `backend/service_account.json`
3. Share your target Sheet with the service account's email as Editor
4. Set `SHEET_ID` (found in the Sheet's URL between `/d/` and `/edit`) in `.env`

Every ticket resolution or escalation appends a row with ticket ID, customer,
decision, confidence score, and timestamp — with automatic retry if the write fails.

## Storybook

```bash
cd frontend
npm run storybook
```

## Docker

```bash
docker-compose up --build
```

Frontend runs on `http://localhost:3000` and backend on `http://localhost:8000`.

## Demo run

### UI flow

1. Start backend and frontend, or run Docker.
2. Open `http://localhost:3000`.
3. Click `Run Agent`.
4. In `Ticket Queue`, click a customer name to see their full case history.
5. Visit `/submit` to file a real ticket through the public form.
6. Visit `/whatsapp` to upload a WhatsApp `.txt` export and see contact-level audit data.
7. Review outcomes and trends under `Analytics`.

### API flow

```bash
curl -X POST http://localhost:8000/api/run
curl http://localhost:8000/api/status
curl http://localhost:8000/api/audit-log
curl -X POST http://localhost:8000/api/tickets/submit -H "Content-Type: application/json" -d "{\"name\":\"Test User\",\"email\":\"test@example.com\",\"issue\":\"Order not received\"}"
curl -X POST http://localhost:8000/api/ingest-whatsapp -F "file=@/path/to/export.txt"
```

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/run` | POST | Start processing all tickets |
| `/api/status` | GET | Job status and ticket states |
| `/api/tickets` | GET | Ticket summaries |
| `/api/tickets/{ticket_id}` | GET | Full audit trail |
| `/api/tickets/submit` | POST | Public ticket submission (real users) |
| `/api/ingest-whatsapp` | POST | Upload a WhatsApp `.txt` export for contact-level audit |
| `/api/customers` | GET | Customer directory (name/email/tier) |
| `/api/customers/{customer_email}` | GET | Customer profile + all related queries |
| `/api/analytics` | GET | Aggregate metrics |
| `/api/audit-log` | GET | Full audit log |
| `/api/dead-letters` | GET | Dead-letter queue contents |

Note: `customer_email` in `/api/customers/{customer_email}` should be URL encoded.
Example: `alice.turner@email.com` → `alice.turner%40email.com`.

## Roadmap

The current version is single-business, single-tenant. A multi-tenant SaaS version
— organization accounts, JWT-based login, isolated lead/ticket data per business,
and scheduled automated reporting — is the next planned phase.

## Deliverables included

- `README.md`
- `architecture.md`
- `failure_modes.md`
- `backend/audit_log.json`
- `backend/dead_letter_queue.json`
- Storybook stories in `frontend/src/stories`
