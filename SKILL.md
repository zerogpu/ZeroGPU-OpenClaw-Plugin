# zerogpu OpenCLAW Skill

## Purpose

Use ZeroGPU for high-volume, well-defined tasks that do not require a large reasoning model:

- summarization
- classification
- extraction
- follow-up question generation
- lightweight routing or labeling

## Provider Contract

Prefer the configured OpenCLAW provider model IDs:

- `zerogpu/auto`
- `zerogpu/summarize`
- `zerogpu/classify`
- `zerogpu/extract`
- `zerogpu/followups`
- `zerogpu/chat`
- `zerogpu/chat-thinking`

OpenCLAW should call the hosted adapter through:

- `POST /v1/chat/completions`

The legacy endpoint remains available only for compatibility:

- `POST /v1/zerogpu/chat/completions`

## Decision Rules

Choose `zerogpu/auto` when the user asks for a small, structured task and no specific alias is needed.

Choose task-specific aliases when intent is clear:

- `zerogpu/summarize` for summaries and bullet compression.
- `zerogpu/classify` for labels, intents, categories, and sentiment-style decisions.
- `zerogpu/extract` for entities, fields, JSON, and structured data.
- `zerogpu/followups` for follow-up question generation.

Avoid ZeroGPU for deep multi-step reasoning, long creative writing, or tasks that require broad synthesis.

## Credentials

Users provide `ZEROGPU_API_KEY` and `ZEROGPU_PROJECT_ID` during setup. The setup script stores an encoded token in OpenCLAW provider config, and the hosted adapter forwards credentials per request. Do not store user ZeroGPU credentials in shared hosting environment variables.
