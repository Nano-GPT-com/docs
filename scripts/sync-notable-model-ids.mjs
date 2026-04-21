#!/usr/bin/env node

import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

const MODELS_URL = 'https://nano-gpt.com/api/v1/models';
const MODELS_DOC_PATH = path.join('api-reference', 'endpoint', 'models.mdx');
const START_MARKER = '<!-- AUTO-GENERATED: notable-model-ids:start -->';
const END_MARKER = '<!-- AUTO-GENERATED: notable-model-ids:end -->';

const FAMILY_CONFIG = [
  {
    label: 'OpenAI',
    ids: ['openai/gpt-5.2', 'openai/gpt-5.2-chat', 'openai/gpt-5.2-codex', 'openai/gpt-5.2-pro'],
  },
  {
    label: 'Anthropic',
    ids: [
      'anthropic/claude-opus-4.6',
      'anthropic/claude-opus-4.6:thinking',
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-sonnet-4.6:thinking',
    ],
  },
  {
    label: 'Google Gemini 3',
    ids: [
      'google/gemini-3-flash-preview',
      'google/gemini-3.1-pro-preview',
      'gemini-3-pro-image-preview',
      'google/gemini-3-flash-preview-thinking',
    ],
  },
  {
    label: 'xAI Grok 4 / 4.1',
    ids: ['x-ai/grok-4-07-09', 'x-ai/grok-4-fast', 'x-ai/grok-4-fast:thinking', 'x-ai/grok-4.1-fast-reasoning'],
  },
  {
    label: 'Moonshot Kimi K2.5',
    ids: ['moonshotai/kimi-k2.5', 'moonshotai/kimi-k2.5:thinking'],
  },
  {
    label: 'Zhipu GLM 4.6 / 4.7',
    ids: ['z-ai/glm-4.6', 'z-ai/glm-4.6:thinking', 'zai-org/glm-4.7', 'zai-org/glm-4.7:thinking'],
  },
  {
    label: 'DeepSeek V3.2',
    ids: ['deepseek/deepseek-v3.2', 'deepseek/deepseek-v3.2:thinking', 'deepseek/deepseek-v3.2-speciale'],
  },
  {
    label: 'Qwen3 Coder',
    ids: ['qwen/qwen3-coder-next', 'qwen/qwen3-coder-plus', 'qwen/qwen3-coder-flash'],
  },
  {
    label: 'NousResearch Hermes 4',
    ids: ['nousresearch/hermes-4-405b', 'nousresearch/hermes-4-405b:thinking', 'nousresearch/hermes-4-70b'],
  },
];

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

function buildGeneratedLines(liveIds) {
  const rows = [];

  for (const family of FAMILY_CONFIG) {
    const kept = family.ids.filter((id) => liveIds.has(id));
    if (kept.length === 0) {
      throw new Error(`No live IDs found for family "${family.label}"`);
    }

    rows.push(`- **${family.label}**: ${kept.map((id) => `\`${id}\``).join(', ')}`);
  }

  return rows;
}

function replaceGeneratedBlock(docText, rows) {
  const block = `${START_MARKER}\n${rows.join('\n')}\n${END_MARKER}`;
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`);

  if (!pattern.test(docText)) {
    throw new Error(`Missing generated block markers in ${MODELS_DOC_PATH}`);
  }

  return docText.replace(pattern, block);
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  const payload = await fetchJson(MODELS_URL);
  const liveIds = new Set((payload?.data || []).map((entry) => entry?.id).filter(Boolean));

  if (liveIds.size === 0) {
    throw new Error('Live catalog is empty; refusing to generate notable model IDs');
  }

  const rows = buildGeneratedLines(liveIds);
  const docText = await fs.readFile(MODELS_DOC_PATH, 'utf8');
  const nextDocText = replaceGeneratedBlock(docText, rows);

  if (checkOnly) {
    if (docText !== nextDocText) {
      console.error(`${MODELS_DOC_PATH} notable IDs are out of date. Run: node scripts/sync-notable-model-ids.mjs`);
      process.exit(1);
    }

    console.log('Notable model IDs block is up to date.');
    return;
  }

  if (docText !== nextDocText) {
    await fs.writeFile(MODELS_DOC_PATH, nextDocText, 'utf8');
    console.log(`Updated ${MODELS_DOC_PATH} from live model catalog.`);
  } else {
    console.log(`${MODELS_DOC_PATH} already matches live model catalog.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
