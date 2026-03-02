# Client Migration Note: Usage + Pricing Extensions

As of March 2, 2026, runtime responses may include richer token accounting and pricing metadata than older minimal examples.

## Required Client Behavior

- Do not validate `usage` against a strict minimal schema (`prompt_tokens`, `completion_tokens`, `total_tokens` only).
- Accept nested usage details and cache fields when present.
- Ignore unknown fields in both `usage` and `x_nanogpt_pricing`.
- In streaming, read `usage` and `x_nanogpt_pricing` from the final chunk.
- In non-stream JSON, read `x_nanogpt_pricing` at top-level.

## Pricing Error Handling

`x_nanogpt_pricing.error.message` is sanitized for safe client display/logging. Do not rely on provider-native private billing error payloads or codes from this field.
