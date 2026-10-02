#!/usr/bin/env node

import fs from 'node:fs/promises';
import https from 'node:https';

const MODELS_URL = 'https://nano-gpt.com/api/v1/models?detailed=true';
const DOCS_CONFIG_PATH = 'docs.json';
const OPENAPI_PATH = 'api-reference/openapi.json';
const MODEL_VARIABLE = 'example-text-model';
const LEGACY_EXAMPLE_MODEL = 'openai/gpt-5.2';
const EXPECTED_PLACEHOLDER = `{{${MODEL_VARIABLE}}}`;
const SHARED_IMPORT = "import { exampleTextModel, exampleTextModelName } from '/snippets/example-text-model.mdx';";

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

async function listMdxFiles(directory = '.') {
  const files = [];

  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const entryPath = directory === '.' ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await listMdxFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const config = JSON.parse(await fs.readFile(DOCS_CONFIG_PATH, 'utf8'));
  const exampleModel = config?.variables?.[MODEL_VARIABLE];

  if (typeof exampleModel !== 'string' || exampleModel.length === 0) {
    throw new Error(`Missing docs.json variable: ${MODEL_VARIABLE}`);
  }

  const payload = await fetchJson(MODELS_URL);
  const liveIds = new Set((payload?.data || []).map((entry) => entry?.id).filter(Boolean));
  const liveModels = new Map((payload?.data || []).map((entry) => [entry.id, entry]));
  if (!liveIds.has(exampleModel)) {
    throw new Error(`docs.json ${MODEL_VARIABLE} is not in GET /api/v1/models: ${exampleModel}`);
  }

  const openApiText = await fs.readFile(OPENAPI_PATH, 'utf8');
  const openApi = JSON.parse(openApiText);
  const textPaths = ['/v1/chat/completions', '/v1/completions', '/talk-to-gpt', '/v1/messages', '/v1/responses'];
  const exampleHosts = textPaths.map((path) => {
    const pathItem = openApi.paths[path];
    const servers = pathItem?.post?.servers || pathItem?.servers || openApi.servers;
    return [`OpenAPI text host for ${path}`, new URL(servers[0].url).origin];
  });
  if (config.api?.baseUrl) exampleHosts.push(['Mintlify API host', new URL(config.api.baseUrl).origin]);
  const checkedHosts = new Set([new URL(MODELS_URL).origin]);
  for (const [label, exampleHost] of exampleHosts) {
    if (checkedHosts.has(exampleHost)) continue;
    const hostCatalog = await fetchJson(`${exampleHost}/api/v1/models`);
    if (!(hostCatalog?.data || []).some((entry) => entry.id === exampleModel)) {
      throw new Error(`Canonical example model ${exampleModel} is unavailable on the ${label} ${exampleHost}`);
    }
    checkedHosts.add(exampleHost);
  }
  if (!openApiText.includes(exampleModel)) {
    throw new Error(`${OPENAPI_PATH} does not contain the canonical example model: ${exampleModel}`);
  }

  // Text recommendations must not lower upload/runtime limits for media operations.
  const mediaPathPattern = /^\/(?:check-midjourney-status$|nsfw\/image$|generate-video(?:\/|$)|(?:v1\/)?video\/|v1\/(?:images\/edits|moderations|embeddings)$|transcribe(?:\/|$)|youtube-transcribe$|tts$|voice-clone\/)/;
  for (const [path, pathItem] of Object.entries(openApi.paths || {})) {
    if (!mediaPathPattern.test(path)) continue;
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const operation = pathItem[method];
      if (!operation) continue;
      const servers = operation.servers || pathItem.servers || openApi.servers;
      if (servers?.[0]?.url !== 'https://api.nano-gpt.com/api') {
        throw new Error(`${method.toUpperCase()} ${path} must default to the direct media API host`);
      }
    }
  }

  const staleFiles = [];
  const hardCodedCanonicalFiles = [];
  let directHostIds;
  for (const filePath of await listMdxFiles()) {
    const content = await fs.readFile(filePath, 'utf8');
    const codeBlocks = [...content.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
    if (codeBlocks.some((match) => match[1].includes('ExampleModelHostNotice'))) {
      throw new Error(`${filePath} embeds a documentation host notice in executable sample code`);
    }
    if (content.includes(LEGACY_EXAMPLE_MODEL)) staleFiles.push(filePath);
    if (content.includes(exampleModel) && filePath !== 'snippets/example-text-model.mdx') {
      hardCodedCanonicalFiles.push(filePath);
    }
    if ((content.includes('{exampleTextModel}') || content.includes('{exampleTextModelName}')) && !content.includes(SHARED_IMPORT)) {
      throw new Error(`${filePath} uses the shared example model without importing it`);
    }
    if (content.includes(EXPECTED_PLACEHOLDER) && codeBlocks.some((match) => match[1].includes('https://api.nano-gpt.com'))) {
      if (!directHostIds) {
        const directCatalog = await fetchJson('https://api.nano-gpt.com/api/v1/models');
        directHostIds = new Set((directCatalog?.data || []).map((entry) => entry.id));
      }
      if (!directHostIds.has(exampleModel)) {
        throw new Error(`${filePath} configures the direct API host, which does not list ${exampleModel}`);
      }
    }
  }

  // Updating the shared example ID must also update copied client cost metadata.
  for (const filePath of ['integrations/clawdbot.mdx', 'integrations/openclaw.mdx']) {
    const content = (await fs.readFile(filePath, 'utf8'))
      .replaceAll(EXPECTED_PLACEHOLDER, exampleModel);
    for (const match of content.matchAll(/```json\n([\s\S]*?)```/g)) {
      const config = JSON.parse(match[1]);
      for (const model of config?.models?.providers?.nanogpt?.models || []) {
        const liveModel = liveModels.get(model.id);
        if (!liveModel) throw new Error(`${filePath} configures an unavailable model: ${model.id}`);
        const pricing = liveModel.pricing;
        if (!model.cost || !pricing) continue;
        const expected = {
          input: pricing.prompt,
          output: pricing.completion,
          cacheRead: pricing.cacheReadInputPer1kTokens === undefined ? undefined : pricing.cacheReadInputPer1kTokens * 1000,
          cacheWrite: pricing.cacheWriteInputPer1kTokens === undefined ? undefined : pricing.cacheWriteInputPer1kTokens * 1000,
        };
        for (const [field, value] of Object.entries(expected)) {
          if (value !== undefined && (!Number.isFinite(model.cost[field]) || Math.abs(model.cost[field] - value) > 0.000001)) {
            throw new Error(`${filePath} ${model.id} cost.${field} must match the catalog rate ${value}`);
          }
        }
      }
    }
  }

  if (staleFiles.length > 0) {
    throw new Error(`Legacy example model ${LEGACY_EXAMPLE_MODEL} remains in:\n- ${staleFiles.join('\n- ')}`);
  }

  if (hardCodedCanonicalFiles.length > 0) {
    throw new Error(`Canonical example model must use ${EXPECTED_PLACEHOLDER} in MDX:\n- ${hardCodedCanonicalFiles.join('\n- ')}`);
  }

  console.log(`Canonical example model is live and legacy MDX examples are absent: ${exampleModel}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
