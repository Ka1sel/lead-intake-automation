# Verification record

## Local JavaScript checks

Nine tests passed using Node.js 24.19.0. The tests run the source functions and exported n8n Code-node bodies with synthetic inputs.

## n8n runtime checks

Pending. Record the actual n8n version, import result, webhook HTTP status, and response for each scenario after execution.

| Scenario | Expected outcome | Runtime result |
| --- | --- | --- |
| Ready to automate | HTTP 200, Priority, score 100, unsent draft | Pending |
| Planning an integration | HTTP 200, Standard, score 65, unsent draft | Pending |
| Exploring options | HTTP 200, Discovery, score 30, unsent draft | Pending |
| Missing or invalid fields | HTTP 422 with errors | Pending |
| Missing processing consent | HTTP 422 with errors | Pending |

No real leads or external-service credentials are used by these fixtures.
