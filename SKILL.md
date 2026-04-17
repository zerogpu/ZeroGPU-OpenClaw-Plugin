# zerogpu Skill

## Purpose

Use `zerogpu` for lightweight AI tasks that do not require expensive large-model reasoning.

Route to `zerogpu` when the user asks for:

- classification
- summarization
- extraction
- follow-up question generation

## Decision Rules

Prefer `zerogpu` when the request is structured, repetitive, or low-complexity.

Avoid `zerogpu` for:

- deep multi-step reasoning
- long-form creative writing with nuanced style constraints
- tasks requiring high uncertainty handling or broad world knowledge synthesis

## Invocation Contract (OpenAI-compatible)

Use a chat-completions style payload:

```json
{
  "model": "auto",
  "messages": [
    { "role": "system", "content": "You are a task assistant." },
    { "role": "user", "content": "Summarize this text in 3 bullets..." }
  ],
  "metadata": {
    "taskTypeHint": "summarization"
  }
}
```

Send this payload to the `zerogpu` plugin endpoint:

- `POST /v1/zerogpu/chat/completions`

## Important Boundary

This skill does not execute requests, choose models dynamically, or track savings. It only helps the agent decide when to invoke the plugin.
