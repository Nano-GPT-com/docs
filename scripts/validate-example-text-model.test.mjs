import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const modelId = 'openai/gpt-6.1-sol';
const validator = new URL('./validate-example-text-model.mjs', import.meta.url);

function runFixture({ cacheRead = 0.1, clientHost = 'https://nano-gpt.com', openApiHost = 'https://nano-gpt.com', mintlifyHost = 'https://nano-gpt.com', clientModel = '{{example-text-model}}', embeddedHostNotice = false, mediaHost = 'https://api.nano-gpt.com', omitMediaServer = false, mediaOperationHost, rootHost = 'https://api.nano-gpt.com', mediaOverrides = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'nanogpt-doc-model-guard-'));
  try {
    mkdirSync(join(directory, 'api-reference'));
    mkdirSync(join(directory, 'integrations'));
    writeFileSync(join(directory, 'docs.json'), JSON.stringify({ variables: { 'example-text-model': modelId }, api: { baseUrl: `${mintlifyHost}/api` } }));
    const mediaPath = {
      ...(omitMediaServer ? {} : { servers: [{ url: `${mediaHost}/api` }] }),
      post: mediaOperationHost ? { servers: [{ url: `${mediaOperationHost}/api` }] } : {},
    };
    const textPaths = ['/v1/chat/completions', '/v1/completions', '/talk-to-gpt', '/v1/messages', '/v1/responses'];
    const mediaPaths = ['/generate-video', '/v1/images/edits', '/v1/moderations', '/v1/embeddings'];
    writeFileSync(join(directory, 'api-reference/openapi.json'), JSON.stringify({
      servers: [{ url: `${rootHost}/api` }], example: modelId,
      paths: {
        ...Object.fromEntries(textPaths.map((path) => [path, { servers: [{ url: `${openApiHost}/api` }], post: {} }])),
        ...Object.fromEntries(mediaPaths.map((path) => [path, mediaOverrides[path] || mediaPath])),
      },
    }));
    const cost = { input: 2, output: 10, cacheWrite: 2.5 };
    if (cacheRead !== null) cost.cacheRead = cacheRead;
    const config = { models: { providers: { nanogpt: { baseUrl: `${clientHost}/api/v1`, models: [{ id: clientModel, cost }] } } } };
    for (const name of ['clawdbot', 'openclaw']) {
      const embeddedCode = embeddedHostNotice ? "\x60\x60\x60javascript\nimport ExampleModelHostNotice from '/snippets/example-model-host-notice.mdx';\n<ExampleModelHostNotice />\n\x60\x60\x60\n" : '';
      writeFileSync(join(directory, `integrations/${name}.mdx`), `\x60\x60\x60json\n${JSON.stringify(config)}\n\x60\x60\x60\n${embeddedCode}`);
    }
    copyFileSync(validator, join(directory, 'validate.mjs'));
    writeFileSync(join(directory, 'catalog.cjs'), `
const https = require('node:https');
const { EventEmitter } = require('node:events');
https.get = (url, options, callback) => {
  const request = new EventEmitter();
  request.destroy = () => {};
  setImmediate(() => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.setEncoding = () => {};
    response.resume = () => {};
    callback(response);
    const data = new URL(url).hostname === 'nano-gpt.com'
      ? [{ id: '${modelId}', pricing: { prompt: 2, completion: 10, cacheReadInputPer1kTokens: 0.0001, cacheWriteInputPer1kTokens: 0.0025 } }]
      : [{ id: 'openai/gpt-5.6-sol' }];
    response.emit('data', JSON.stringify({ data }));
    response.emit('end');
  });
  return request;
};
`);
    const result = spawnSync(process.execPath, ['--require', './catalog.cjs', './validate.mjs'], { cwd: directory, encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts matching model, host, and copied client prices', () => {
  assert.equal(runFixture().status, 0);
});

test('rejects the older model cache price after updating the shared model', () => {
  const result = runFixture({ cacheRead: 0.2 });
  assert.equal(result.status, 1);
  assert.match(result.output, /cost.cacheRead must match the catalog rate 0.1/);
});

test('rejects missing copied client prices', () => {
  const result = runFixture({ cacheRead: null });
  assert.equal(result.status, 1);
  assert.match(result.output, /cost.cacheRead must match the catalog rate/);
});

test('rejects a client host that has not received the recommended model', () => {
  const result = runFixture({ clientHost: 'https://api.nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /direct API host, which does not list/);
});

test('rejects an OpenAPI text host that has not received the recommended model', () => {
  const result = runFixture({ openApiHost: 'https://api.nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /unavailable on the OpenAPI text host/);
});

test('rejects a copied client model absent from the live catalog', () => {
  const result = runFixture({ clientModel: 'retired-model' });
  assert.equal(result.status, 1);
  assert.match(result.output, /configures an unavailable model: retired-model/);
});

test('rejects a Mintlify playground host that has not received the recommended model', () => {
  const result = runFixture({ mintlifyHost: 'https://api.nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /unavailable on the Mintlify API host/);
});

test('rejects documentation components embedded in executable SDK examples', () => {
  const result = runFixture({ embeddedHostNotice: true });
  assert.equal(result.status, 1);
  assert.match(result.output, /embeds a documentation host notice in executable sample code/);
});

test('rejects moving media path defaults to the website host', () => {
  const result = runFixture({ mediaHost: 'https://nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /must default to the direct media API host/);
});

test('rejects media operations inheriting the website text default', () => {
  const result = runFixture({ omitMediaServer: true, rootHost: 'https://nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /must default to the direct media API host/);
});

test('rejects website operation overrides of direct media path defaults', () => {
  const result = runFixture({ mediaOperationHost: 'https://nano-gpt.com' });
  assert.equal(result.status, 1);
  assert.match(result.output, /must default to the direct media API host/);
});

test('accepts media operations inheriting the direct root host', () => {
  assert.equal(runFixture({ omitMediaServer: true }).status, 0);
});

for (const path of ['/v1/moderations', '/v1/embeddings']) {
  test(`rejects website defaults for inline uploads to ${path}`, () => {
    const result = runFixture({ mediaOverrides: { [path]: { servers: [{ url: 'https://nano-gpt.com/api' }], post: {} } } });
    assert.equal(result.status, 1);
    assert.match(result.output, /must default to the direct media API host/);
    assert.ok(result.output.includes(path));
  });
}
