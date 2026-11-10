# Verification record

## Local JavaScript checks

Nine tests passed using Node.js 24.19.0. The tests run the source functions and exported n8n Code-node bodies with synthetic inputs.

## n8n runtime checks

The workflow was imported and published in an isolated local n8n 2.47.3 instance. Five HTTP POST scenarios passed against its production-mode webhook on loopback. No Google services or external inboxes were connected. Machine-readable observations are in `runtime-results.json`.

| Scenario | Expected outcome | Runtime result |
| --- | --- | --- |
| Ready to automate | HTTP 200, Priority, score 100, unsent draft | PASS |
| Planning an integration | HTTP 200, Standard, score 65, unsent draft | PASS |
| Exploring options | HTTP 200, Discovery, score 30, unsent draft | PASS |
| Missing or invalid fields | HTTP 422 with errors | PASS |
| Missing processing consent | HTTP 422 with errors | PASS |

No real leads or external-service credentials are used by these fixtures.

## Issue caught by runtime testing

The first generated export omitted the Webhook node's `webhookId`. n8n registered a legacy path containing the workflow ID and encoded node name, so the intended endpoint returned 404. The builder now includes an explicit webhook identifier. A regression assertion checks it, and the five live requests above passed after importing the corrected export. This illustrates why code-only checks are insufficient for an integration workflow.
