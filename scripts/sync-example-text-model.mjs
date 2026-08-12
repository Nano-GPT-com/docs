#!/usr/bin/env node

import fs from 'node:fs/promises';

const DOCS_CONFIG_PATH = 'docs.json';
const OPENAPI_PATH = 'api-reference/openapi.json';
const MODEL_SNIPPET_PATH = 'snippets/example-text-model.mdx';

const OPENAPI_TARGETS = [
  ['components', 'schemas', 'ChatCompletionRequest', 'properties', 'model', 'examples', 3],
  ['components', 'schemas', 'ChatCompletionRequest', 'properties', 'model', 'examples', 4],
  ['components', 'schemas', 'CompletionRequest', 'properties', 'model', 'examples', 3],
  ['components', 'schemas', 'CompletionRequest', 'properties', 'model', 'examples', 4],
  ['components', 'schemas', 'TalkToGptRequest', 'properties', 'model', 'examples', 3],
  ['components', 'schemas', 'ModelsResponse', 'properties', 'data', 'items', 'properties', 'id', 'example'],
  ['components', 'schemas', 'ModelsLegacyResponse', 'properties', 'models', 'items', 'example'],
];

function getAtPath(value, path) {
  return path.reduce((current, segment) => current?.[segment], value);
}

function expectedValue(exampleModel, currentValue) {
  const onlineSuffix = typeof currentValue === 'string' ? currentValue.match(/:online\/[a-z0-9-]+$/)?.[0] : undefined;
  return `${exampleModel}${onlineSuffix || ''}`;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const docsConfig = JSON.parse(await fs.readFile(DOCS_CONFIG_PATH, 'utf8'));
  const exampleModel = docsConfig?.variables?.['example-text-model'];
  const exampleModelName = docsConfig?.variables?.['example-text-model-name'];

  if (!exampleModel || !exampleModelName) {
    throw new Error('Missing docs.json example-text-model or example-text-model-name variable');
  }

  const expectedSnippet = `export const exampleTextModel = ${JSON.stringify(exampleModel)};\nexport const exampleTextModelName = ${JSON.stringify(exampleModelName)};\n`;
  const currentSnippet = await fs.readFile(MODEL_SNIPPET_PATH, 'utf8').catch(() => '');

  const openApiText = await fs.readFile(OPENAPI_PATH, 'utf8');
  const openApi = JSON.parse(openApiText);
  const failures = [];
  let nextOpenApiText = openApiText;

  for (const targetPath of OPENAPI_TARGETS) {
    const current = getAtPath(openApi, targetPath);
    const expected = expectedValue(exampleModel, current);
    if (current !== expected) {
      failures.push({ targetPath, current, expected });
      nextOpenApiText = nextOpenApiText.replaceAll(JSON.stringify(current), JSON.stringify(expected));
    }
  }

  if (failures.length === 0 && currentSnippet === expectedSnippet) {
    console.log(`OpenAPI examples match docs.json example-text-model: ${exampleModel}`);
    return;
  }

  if (failures.length > 0) {
    console.error('OpenAPI example model fields are out of sync with docs.json:');
    for (const failure of failures) {
      console.error(`- ${failure.targetPath.join('.')}: ${failure.current} (expected ${failure.expected})`);
    }
  }
  if (currentSnippet !== expectedSnippet) {
    console.error(`${MODEL_SNIPPET_PATH} is out of sync with docs.json.`);
  }
  if (checkOnly) {
    console.error('Run: node scripts/sync-example-text-model.mjs');
    process.exit(1);
  }

  if (failures.length > 0) await fs.writeFile(OPENAPI_PATH, nextOpenApiText);
  await fs.writeFile(MODEL_SNIPPET_PATH, expectedSnippet);
  console.log(`Updated derived examples from docs.json example-text-model.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
