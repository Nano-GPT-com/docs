#!/usr/bin/env node

import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

const MODELS_URL = 'https://nano-gpt.com/api/v1/models';
const DOCS_CONFIG_PATH = 'docs.json';
const MODELS_DOC_PATH = path.join('api-reference', 'endpoint', 'models.mdx');
const START_MARKER = '{/* AUTO-GENERATED: notable-model-ids:start */}';
const END_MARKER = '{/* AUTO-GENERATED: notable-model-ids:end */}';

function getFamilyConfig(exampleTextModel) {
  return [
    { label: 'OpenAI', ids: [exampleTextModel, 'openai/gpt-6-astra', 'openai/gpt-latest'] },
    { label: 'Anthropic', ids: ['anthropic/claude-opus-5', 'anthropic/claude-sonnet-5', 'anthropic/claude-fable-5.1'] },
    { label: 'Google Gemini', ids: ['google/gemini-3.7-flash', 'google/gemini-3.5-flash-lite', 'google/gemini-3.1-pro-preview'] },
    { label: 'SpaceXAI Grok', ids: ['x-ai/grok-4.6', 'x-ai/grok-latest'] },
    { label: 'Moonshot Kimi', ids: ['moonshotai/kimi-k3', 'moonshotai/kimi-latest'] },
    { label: 'Z.AI GLM', ids: ['z-ai/glm-5.3', 'z-ai/glm-5.3:thinking', 'z-ai/glm-5.3-flash'] },
    { label: 'DeepSeek V4', ids: ['deepseek/deepseek-v4-pro-0813:thinking', 'deepseek/deepseek-v4-flash', 'deepseek/deepseek-latest'] },
    { label: 'MiniMax', ids: ['minimax/minimax-m3', 'minimax/minimax-latest'] },
    { label: 'Qwen', ids: ['qwen/qwen3.8-max', 'qwen/qwen3-coder-next'] },
  ];
}

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

function buildGeneratedLines(liveIds, familyConfig, exampleTextModel) {
  const rows = [];

  for (const family of familyConfig) {
    const kept = family.ids.filter((id) => liveIds.has(id));
    if (kept.length === 0) {
      throw new Error(`No live IDs found for family "${family.label}"`);
    }

    rows.push(`- **${family.label}**: ${kept.map((id) => id === exampleTextModel ? '<code>{exampleTextModel}</code>' : `\`${id}\``).join(', ')}`);
  }

  return rows;
}

function replaceGeneratedBlock(docText, rows) {
  const block = `${START_MARKER}\n${rows.join('\n')}\n${END_MARKER}`;
  const pattern = new RegExp(`${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`);

  if (!pattern.test(docText)) {
    throw new Error(`Missing generated block markers in ${MODELS_DOC_PATH}`);
  }

  return docText.replace(pattern, block);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  const payload = await fetchJson(MODELS_URL);
  const liveIds = new Set((payload?.data || []).map((entry) => entry?.id).filter(Boolean));

  if (liveIds.size === 0) {
    throw new Error('Live catalog is empty; refusing to generate notable model IDs');
  }

  const docsConfig = JSON.parse(await fs.readFile(DOCS_CONFIG_PATH, 'utf8'));
  const exampleTextModel = docsConfig?.variables?.['example-text-model'];
  if (!exampleTextModel) {
    throw new Error('Missing docs.json variable: example-text-model');
  }

  const rows = buildGeneratedLines(liveIds, getFamilyConfig(exampleTextModel), exampleTextModel);
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
