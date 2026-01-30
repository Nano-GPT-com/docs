---
name: nanogpt
description: Use the NanoGPT API to generate text, images, video, audio, embeddings, and more using 200+ AI models. Pay with Nano cryptocurrency or fiat.
author: NanoGPT
version: 1.0.0
license: MIT
---

# NanoGPT API Skill

NanoGPT is a unified AI API platform that provides access to 500+ models across text, image, video, audio, and embedding generation. It is OpenAI-compatible, meaning any tool or library that works with the OpenAI API works with NanoGPT by changing the base URL. Payments can be made with Nano cryptocurrency, other cryptocurrencies, or fiat (USD via Stripe).

## When to Apply

Use this skill when an agent needs to:
- Generate text, chat completions, or reasoning responses from any major LLM provider
- Generate images from text or transform existing images
- Generate videos from text or images
- Convert text to speech or speech to text
- Create text embeddings for search, RAG, or clustering
- Perform web search via AI models
- Check account balance or manage deposits
- Pay for AI services using Nano or other cryptocurrency

## Base URL

```
https://nano-gpt.com/api/v1
```

Alternative domains (same API, same endpoints):
- `https://ai.bitcoin.com/api/v1`
- `https://bcashgpt.com/api/v1`
- `https://cake.nano-gpt.com/api/v1`

## Authentication

All API requests require an API key passed via header:

```
x-api-key: YOUR_NANOGPT_API_KEY
```

Or using the OpenAI-compatible Bearer format:

```
Authorization: Bearer YOUR_NANOGPT_API_KEY
```

Get an API key at https://nano-gpt.com (sign up, then create one under API Keys in settings).

## Pricing

NanoGPT charges zero platform fees. You pay only the model cost per request. No minimum fee per query, no fee on deposits. See current model prices at https://nano-gpt.com/pricing.

---

## 1. Chat Completions (Text Generation)

**Endpoint:** `POST /v1/chat/completions`

OpenAI-compatible.

### Request

```json
{
  "model": "TEXT_MODEL_ID",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1024
}
```

### cURL Example

```bash
curl -X POST https://nano-gpt.com/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "model": "TEXT_MODEL_ID",
    "messages": [{"role": "user", "content": "What is Nano cryptocurrency?"}],
    "stream": false
  }'
```

### Python Example (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://nano-gpt.com/api/v1",
    api_key="YOUR_NANOGPT_API_KEY"
)

response = client.chat.completions.create(
    model="TEXT_MODEL_ID",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### JavaScript Example

```javascript
const response = await fetch("https://nano-gpt.com/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY"
  },
  body: JSON.stringify({
    model: "TEXT_MODEL_ID",
    messages: [{ role: "user", content: "Hello!" }]
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

### Supported Features
- **Streaming:** Set `"stream": true` for server-sent events
- **Tool/Function Calling:** Full OpenAI-compatible tool use
- **Vision:** Send images in messages for multimodal models
- **Web Search:** Append `:online` to a model name for real-time web access
- **Extended Thinking:** Use thinking model variants when offered by a model

See the current model list at `GET /v1/models`.

---

## 2. Image Generation

**Endpoint:** `POST /v1/images/generations`

OpenAI-compatible image generation with 100+ models.

### Request

```json
{
  "model": "IMAGE_MODEL_ID",
  "prompt": "A futuristic city at sunset, cyberpunk style",
  "n": 1,
  "size": "1024x1024",
  "response_format": "url"
}
```

### cURL Example

```bash
curl -X POST https://nano-gpt.com/api/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "model": "IMAGE_MODEL_ID",
    "prompt": "A futuristic city at sunset",
    "size": "1024x1024"
  }'
```

### Response

```json
{
  "data": [
    {
      "url": "https://...",
      "b64_json": null
    }
  ]
}
```

### Image-to-Image

Send a source image for transformation:

```json
{
  "model": "IMAGE_MODEL_ID",
  "prompt": "Convert to oil painting style",
  "image": "https://example.com/photo.jpg",
  "strength": 0.8
}
```

### Parameters
- `prompt` (required): Text description of the desired image
- `model`: Image model to use (default varies)
- `size`: Output dimensions (e.g., `"1024x1024"`, `"1024x768"`)
- `n`: Number of images to generate (1-4 depending on model)
- `response_format`: `"url"` or `"b64_json"`
- `strength`: Transformation intensity for image-to-image (0.0-1.0)
- `guidance_scale`: Prompt adherence strength (typically 1-20)
- `num_inference_steps`: Quality steps (higher = better but slower)

See the current image model list at `GET /v1/image-models`.

Generated images are hosted for a limited time. Download promptly.

---

## 3. Video Generation

**Endpoint:** `POST /api/generate-video`

Generate videos from text prompts or images. This is an async API.

### Request

```json
{
  "model": "VIDEO_MODEL_ID",
  "prompt": "A cat walking through a garden in slow motion",
  "aspectRatio": "16:9",
  "duration": 5
}
```

### cURL Example

```bash
curl -X POST https://nano-gpt.com/api/generate-video \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "model": "VIDEO_MODEL_ID",
    "prompt": "A cat walking through a garden",
    "aspectRatio": "16:9"
  }'
```

### Response (Async)

```json
{
  "runId": "abc123",
  "status": "processing"
}
```

### Poll for Completion

```bash
curl "https://nano-gpt.com/api/generate-video/status?requestId=abc123" \
  -H "x-api-key: YOUR_API_KEY"
```

### Status Response (Complete)

```json
{
  "status": "completed",
  "videoUrl": "https://..."
}
```

### Image-to-Video

```json
{
  "model": "VIDEO_MODEL_ID",
  "prompt": "The person in the image starts walking",
  "imageUrl": "https://example.com/photo.jpg"
}
```

See the current video model list at `GET /v1/video-models`.

---

## 4. Text-to-Speech (TTS)

**Endpoint:** `POST /v1/audio/speech`

OpenAI-compatible TTS endpoint.

### Request

```json
{
  "model": "TTS_MODEL_ID",
  "input": "Hello, this is a test of the text to speech system.",
  "voice": "VOICE_ID"
}
```

### cURL Example

```bash
curl -X POST https://nano-gpt.com/api/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "model": "TTS_MODEL_ID",
    "input": "Hello world!",
    "voice": "VOICE_ID"
  }' \
  --output speech.mp3
```

### Python Example

```python
client = OpenAI(
    base_url="https://nano-gpt.com/api/v1",
    api_key="YOUR_NANOGPT_API_KEY"
)

response = client.audio.speech.create(
    model="TTS_MODEL_ID",
    input="Hello world!",
    voice="VOICE_ID"
)
response.stream_to_file("output.mp3")
```

### Parameters
- `model`: TTS model (see below)
- `input` (required): Text to synthesize (up to 4,096-10,000 chars depending on model)
- `voice`: Voice ID (model-dependent; see docs)
- `response_format`: `"mp3"`, `"wav"`, `"opus"`, `"flac"`
- `speed`: Playback speed (0.25-4.0)
- `instructions`: Voice style instructions (model-dependent)

See the current audio model list and pricing at `GET /v1/audio-models` and the pricing page.

---

## 5. Speech-to-Text (Transcription)

**Endpoint:** `POST /v1/audio/transcriptions`

OpenAI-compatible transcription.

### cURL Example

```bash
curl -X POST https://nano-gpt.com/api/v1/audio/transcriptions \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@audio.mp3" \
  -F "model=STT_MODEL_ID"
```

### Response

```json
{
  "text": "The transcribed text content..."
}
```

See the current transcription model list and pricing at `GET /v1/audio-models`.

Supported formats: MP3, WAV, M4A, OGG, AAC. Max file size limits vary by model; see docs for current limits and use URL-based submission for larger files.

---

## 6. Embeddings

**Endpoint:** `POST /v1/embeddings`

OpenAI-compatible embeddings for semantic search, RAG, and clustering.

### Request

```json
{
  "model": "EMBEDDING_MODEL_ID",
  "input": "The food was delicious and the waiter was friendly."
}
```

### Python Example

```python
client = OpenAI(
    base_url="https://nano-gpt.com/api/v1",
    api_key="YOUR_NANOGPT_API_KEY"
)

response = client.embeddings.create(
    model="EMBEDDING_MODEL_ID",
    input="Hello world"
)
print(response.data[0].embedding)
```

See the current embedding model list and pricing at `GET /v1/embedding-models`.

Batch processing limits vary by model.

---

## 7. Balance and Payments

### Check Balance

```bash
curl -X POST https://nano-gpt.com/api/check-balance \
  -H "x-api-key: YOUR_API_KEY"
```

Response:
```json
{
  "usd_balance": "129.46",
  "nano_balance": "26.71",
  "nanoDepositAddress": "nano_1gx385..."
}
```

### Deposit with Nano

1. Call check-balance to get your `nanoDepositAddress`
2. Send Nano to that address
3. Balance credits automatically (instant, zero fees)

### Deposit with Other Crypto

```bash
curl -X POST https://nano-gpt.com/api/transaction/create/btc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"amount": 10}'
```

Supported tickers are shown in the API response or docs.

Deposit limits may apply; see docs for current limits.

### Estimate Cost Before Requesting

```bash
curl -X POST https://nano-gpt.com/api/get-completion-cost \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "model": "TEXT_MODEL_ID",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

For images:
```bash
curl -X POST https://nano-gpt.com/api/estimate-image-cost \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"model": "IMAGE_MODEL_ID", "size": "1024x1024"}'
```

---

## 8. Model Discovery

### List All Text Models

```bash
curl https://nano-gpt.com/api/v1/models \
  -H "x-api-key: YOUR_API_KEY"
```

### List Image Models

```bash
curl https://nano-gpt.com/api/v1/image-models \
  -H "x-api-key: YOUR_API_KEY"
```

### List Video Models

```bash
curl https://nano-gpt.com/api/v1/video-models \
  -H "x-api-key: YOUR_API_KEY"
```

### List Audio Models

```bash
curl https://nano-gpt.com/api/v1/audio-models \
  -H "x-api-key: YOUR_API_KEY"
```

### List Embedding Models

```bash
curl https://nano-gpt.com/api/v1/embedding-models \
  -H "x-api-key: YOUR_API_KEY"
```

All model list endpoints return OpenAI-compatible format with model IDs, pricing, and capabilities.

---

## 9. Web Search via AI

Append `:online` to any text model name to enable real-time web search:

```json
{
  "model": "TEXT_MODEL_ID:online",
  "messages": [{"role": "user", "content": "What happened in the news today?"}]
}
```

---

## 10. Rate Limits

Rate limits vary by endpoint, model, and account tier. See the docs or your account dashboard for current limits.

---

## Error Handling

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 202 | Accepted (async, poll for result) |
| 400 | Bad request (invalid params) |
| 401 | Unauthorized (invalid/missing API key) |
| 402 | Payment required (insufficient balance) |
| 429 | Rate limited |
| 500 | Server error |

Error response format:
```json
{
  "error": {
    "message": "Insufficient balance",
    "type": "insufficient_balance",
    "code": 402
  }
}
```

---

## Quick Reference: Common Agent Workflows

### Generate an image and get the URL
1. `POST /v1/images/generations` with model and prompt
2. Read `data[0].url` from response

### Generate text with streaming
1. `POST /v1/chat/completions` with `"stream": true`
2. Read SSE events, each containing a `delta` with content

### Text-to-speech
1. `POST /v1/audio/speech` with model, input text, and voice
2. Save returned audio binary to file

### Generate a video
1. `POST /api/generate-video` with model and prompt
2. Poll `GET /api/generate-video/status?requestId={runId}`
3. When status is `"completed"`, read `videoUrl`

### Check if you can afford a request
1. `POST /api/get-completion-cost` or `/api/estimate-image-cost`
2. `POST /api/check-balance`
3. Compare cost to balance before proceeding

### Deposit Nano to fund account
1. `POST /api/check-balance` to get `nanoDepositAddress`
2. Send Nano to that address
3. Balance updates automatically

---

## Resources

- **Documentation:** https://docs.nano-gpt.com
- **Pricing:** https://nano-gpt.com/pricing
- **MCP Server:** https://github.com/Nano-GPT-com/nanogpt-mcp
- **API Keys:** https://nano-gpt.com (Settings > API Keys)
- **Support:** support@nano-gpt.com or Discord
