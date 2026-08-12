#!/usr/bin/env node

import fs from 'node:fs/promises';
import https from 'node:https';

const MODELS_URL = 'https://nano-gpt.com/api/v1/models';
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
  if (!liveIds.has(exampleModel)) {
    throw new Error(`docs.json ${MODEL_VARIABLE} is not in GET /api/v1/models: ${exampleModel}`);
  }

  const openApiText = await fs.readFile(OPENAPI_PATH, 'utf8');
  if (!openApiText.includes(exampleModel)) {
    throw new Error(`${OPENAPI_PATH} does not contain the canonical example model: ${exampleModel}`);
  }

  const staleFiles = [];
  const hardCodedCanonicalFiles = [];
  for (const filePath of await listMdxFiles()) {
    const content = await fs.readFile(filePath, 'utf8');
    if (content.includes(LEGACY_EXAMPLE_MODEL)) staleFiles.push(filePath);
    if (content.includes(exampleModel) && filePath !== 'snippets/example-text-model.mdx') {
      hardCodedCanonicalFiles.push(filePath);
    }
    if ((content.includes('{exampleTextModel}') || content.includes('{exampleTextModelName}')) && !content.includes(SHARED_IMPORT)) {
      throw new Error(`${filePath} uses the shared example model without importing it`);
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
