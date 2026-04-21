#!/usr/bin/env node

import fs from 'node:fs/promises';
import https from 'node:https';

const MODELS_URL = 'https://nano-gpt.com/api/v1/models';

// Scope this guardrail to public text-model docs where IDs must match /api/v1/models.
const DOC_FILES = [
  'api-reference/endpoint/models.mdx',
  'api-reference/endpoint/chat-completion.mdx',
  'api-reference/endpoint/messages.mdx',
  'api-reference/miscellaneous/extended-thinking.mdx',
  'api-reference/miscellaneous/provider-selection.mdx',
  'api-reference/miscellaneous/pricing.mdx',
];

const MODEL_FAMILY_RE = /(gpt|claude|gemini|grok|kimi|glm|deepseek|qwen|hermes)/i;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Failed to fetch ${url}: HTTP ${res.statusCode || 'unknown'}`));
        res.resume();
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timed out fetching ${url}`));
    });

    req.on('error', reject);
  });
}

function normalizeLookupId(input) {
  let value = input.trim().replace(/[),.]+$/g, '');

  // Public routing/output suffixes documented by NanoGPT; strip before lookup.
  value = value.replace(/:reasoning-exclude(?=[:]|$)/gi, '');
  value = value.replace(/:online(?:\/[a-z0-9-]+)?(?=[:]|$)/gi, '');
  value = value.replace(/:memory(?:-\d+)?(?=[:]|$)/gi, '');

  // Budgeted thinking syntax examples map to base thinking ID.
  value = value.replace(/:thinking:\d+(?=[:]|$)/gi, ':thinking');
  value = value.replace(/-thinking:\d+(?=[:]|$)/gi, '-thinking');

  // Collapse accidental duplicate separators introduced by stripping.
  value = value.replace(/::+/g, ':').replace(/:+$/g, '');

  return value;
}

function looksLikeModelId(token) {
  if (!token) return false;
  if (token.length < 3 || token.length > 120) return false;
  if (/\s/.test(token)) return false;
  if (token.startsWith('http://') || token.startsWith('https://')) return false;
  if (token.startsWith('/')) return false;
  if (!MODEL_FAMILY_RE.test(token)) return false;
  if (!(/[/:-]/.test(token) || /\d/.test(token))) return false;
  return true;
}

function extractInlineCodeSpans(markdownText) {
  const spans = [];
  const lines = markdownText.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      spans.push(match[1]);
    }
  }

  return spans;
}

function extractModelCandidatesFromSpan(span) {
  const candidates = new Set();

  for (const token of span.split(/[\s,()\[\]]+/)) {
    const cleaned = token.trim();
    if (!looksLikeModelId(cleaned)) continue;
    candidates.add(cleaned);
  }

  return [...candidates];
}

async function main() {
  const payload = await fetchJson(MODELS_URL);
  const liveIdSet = new Set((payload?.data || []).map((entry) => String(entry?.id || '').toLowerCase()).filter(Boolean));

  if (liveIdSet.size === 0) {
    throw new Error('Live catalog is empty; cannot validate docs model IDs.');
  }

  const failures = [];

  for (const filePath of DOC_FILES) {
    const fileText = await fs.readFile(filePath, 'utf8');
    const spans = extractInlineCodeSpans(fileText);

    for (const span of spans) {
      const candidates = extractModelCandidatesFromSpan(span);
      for (const candidate of candidates) {
        const normalized = normalizeLookupId(candidate);
        if (!normalized) continue;

        if (!liveIdSet.has(normalized.toLowerCase())) {
          failures.push({ filePath, candidate, normalized });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Found model IDs in docs that are not in GET /api/v1/models:');
    for (const failure of failures) {
      console.error(`- ${failure.filePath}: \`${failure.candidate}\` (lookup: \`${failure.normalized}\`)`);
    }
    process.exit(1);
  }

  console.log('All model-like IDs in scoped docs code spans resolve to live /api/v1/models IDs.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
