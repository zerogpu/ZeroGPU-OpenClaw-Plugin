# zerogpu Plugin Spec (MVP)

## Endpoint

- `POST /v1/zerogpu/chat/completions`

## Request (OpenAI-compatible shape)

```json
{
  "model": "auto",
  "messages": [
    { "role": "system", "content": "You are helpful." },
    { "role": "user", "content": "Summarize this transcript in 3 bullets." }
  ],
  "metadata": {
    "taskTypeHint": "summarization"
  }
}
```

## Runtime Behavior

1. infer `taskType` from hint or message content
2. refresh model catalog cache periodically
3. choose cheapest compatible model for task
4. execute completion (MVP currently mocked)
5. estimate `zerogpu` vs LLM cost
6. append tracking event asynchronously

## Supporting Endpoints

- `GET /health`
- `GET /v1/models`
- `GET /dashboard/events?limit=50`
- `GET /dashboard/summary`

## Tracking Event Schema (jsonl)

```json
{
  "timestamp": "2026-04-15T13:40:11.200Z",
  "taskType": "summarization",
  "model": "small-summarize-v1",
  "latencyMs": 3,
  "totalTokens": 124,
  "zerogpuCostUsd": 0.0000558,
  "estimatedLlmCostUsd": 0.00124,
  "savingsUsd": 0.0011842
}
```
