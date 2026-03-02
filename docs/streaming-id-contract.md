# Streaming ID Contract

This document describes contract expectations for `/v1/chat/completions` streaming chunks.

## Final Chunk Metadata

- `usage` appears on the final chunk when `stream_options.include_usage` is enabled.
- `x_nanogpt_pricing` appears on the final chunk only for streaming.
- For non-streaming JSON responses, `x_nanogpt_pricing` is top-level on the response object.

## `usage` Shape

`usage` is provider-dependent and can include more than basic token counters. Common fields include:

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `prompt_tokens_details.cached_tokens`
- `prompt_tokens_details.audio_tokens`
- `completion_tokens_details.reasoning_tokens`
- `completion_tokens_details.audio_tokens`
- `completion_tokens_details.accepted_prediction_tokens`
- `completion_tokens_details.rejected_prediction_tokens`
- `reasoning_tokens`
- `citation_tokens`
- `num_search_queries`
- `cache_creation_input_tokens`
- `cache_read_input_tokens`
- `input_tokens`

If provider usage is missing or zero, server normalization may backfill final usage from `x_nanogpt_pricing.inputTokens` and `x_nanogpt_pricing.outputTokens`.

## `x_nanogpt_pricing` Shape

`x_nanogpt_pricing` is an extension object with stable core fields plus optional metadata.

Stable/core fields:

- `amount?: number`
- `currency?: string`
- `error?: { status?: number; message: string }` (`message` is sanitized)

Common optional fields:

- `cost?: number`
- `paymentSource?: string`
- `inputTokens?: number`
- `outputTokens?: number`
- `cacheCost?: number`
- `billedToTeam?: boolean`
- `billedTeamId?: number | null`
- `billedTeamName?: string | null`

Compatibility rule: clients must tolerate additional keys and ignore unknown fields.

## Example Final Chunk

```json
{
  "id": "chatcmpl_x",
  "object": "chat.completion.chunk",
  "created": 1772346058,
  "model": "gpt-5.1",
  "choices": [{ "index": 0, "delta": {}, "finish_reason": "stop" }],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 20,
    "total_tokens": 143,
    "prompt_tokens_details": { "cached_tokens": 123, "audio_tokens": 0 },
    "completion_tokens_details": {
      "reasoning_tokens": 12,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    },
    "cache_creation_input_tokens": 123,
    "cache_read_input_tokens": 123
  },
  "x_nanogpt_pricing": {
    "cost": 0.000169,
    "inputTokens": 9,
    "outputTokens": 20,
    "cacheCost": 0,
    "paymentSource": "USD",
    "billedToTeam": false,
    "billedTeamId": null,
    "billedTeamName": null
  }
}
```
