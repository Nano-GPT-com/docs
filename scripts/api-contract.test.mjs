import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

// Run from a NanoGPT checkout (which supplies Ajv):
// node --test public-docs/scripts/api-contract.test.mjs
const require = createRequire(resolve(process.cwd(), 'package.json'));
const Ajv2020 = require('ajv/dist/2020').default;
const spec = JSON.parse(readFileSync(new URL('../api-reference/openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, validateFormats: false });
ajv.addSchema({ ...spec, $id: 'urn:nanogpt:docs' });
const schema = name => ajv.compile({ $ref: `urn:nanogpt:docs#/components/schemas/${name}` });
const guide = name => readFileSync(new URL(`../api-reference/endpoint/${name}.mdx`, import.meta.url), 'utf8');

test('chat tools validate through request, response, and replay', () => {
  const request = schema('ChatCompletionRequest');
  const response = schema('ChatCompletionResponse');
  const properties = spec.components.schemas.ChatCompletionRequest.properties;
  for (const name of ['tools', 'tool_choice', 'parallel_tool_calls']) assert.ok(properties[name], name);
  assert.ok(properties.tools.items.properties.function.properties.parameters);
  assert.ok(properties.tool_choice.oneOf.some(option => option.enum?.includes('required')));
  const call = { id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{}' } };
  for (const content of [null, undefined]) {
    const assistant = { role: 'assistant', content, tool_calls: [call] };
    assert.equal(request({ model: 'test', tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }], tool_choice: 'required', parallel_tool_calls: false, messages: [
      { role: 'user', content: 'Look it up' }, assistant,
      { role: 'tool', tool_call_id: 'call_1', content: 'result' },
    ] }), true, JSON.stringify(request.errors));
    assert.equal(response({ id: 'chatcmpl-test', object: 'chat.completion', created: 1800000000,
      model: 'test', choices: [{ index: 0, message: assistant, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), true, JSON.stringify(response.errors));
  }
  assert.equal(request({ model: 'test', messages: [{ role: 'user', content: null }] }), false);
  assert.equal(request({ model: 'test', messages: [{ role: 'tool', content: 'missing id' }] }), false);
  assert.equal(request({ model: 'test', messages: [{ role: 'developer', configuration_update: { reasoning: { effort: 'high' } } }] }), true);
});

test('legacy completions advertise supported controls only', () => {
  const props = spec.components.schemas.CompletionRequest.properties;
  assert.match(props.model.description, /not supported on this endpoint; use \/v1\/chat\/completions/);
  assert.ok(props.model.examples.every(model => !/:online|:memory/.test(model)));
  for (const key of ['mirostat_mode', 'mirostat_tau', 'mirostat_eta']) assert.equal(props[key], undefined);
});

test('transcription guide documents async status and run-id translation', () => {
  const text = guide('audio-transcriptions');
  for (const required of ['HTTP 202', 'run_id', 'runId', '/api/transcribe/status', 'result["transcription"]', 'headers=headers', 'do not resubmit']) {
    assert.ok(text.includes(required), required);
  }
});

test('media guides use their own discovery catalogs', () => {
  assert.ok(guide('audio-transcriptions').includes('/api/v1/models?output_modalities=transcription&detailed=true'));
  assert.ok(guide('video-generation').includes('/api/v1/video-models'));
  for (const name of ['audio-transcriptions', 'video-generation']) assert.ok(!guide(name).includes('/api/v1/models?detailed=true'));
});

// Execute the published Python example with mocked HTTP and time; no network.
test('async polling example handles nested failures, pending delay and retryable 503', () => {
  const source = guide('audio-transcriptions').match(/```python\n([\s\S]*?)```/)[1];
  const harness = `
import builtins, contextlib, io, os, sys, time, types
source, mode = sys.argv[1:]
os.environ['NANOGPT_API_KEY'] = 'fixture-key'
clock = [0]
waits = []
time.monotonic = lambda: clock[0]
def sleep(seconds):
    waits.append(seconds)
    clock[0] += seconds
time.sleep = sleep
original_open = builtins.open
builtins.open = lambda name, *a, **kw: io.BytesIO(b'audio') if name == 'audio.mp3' else original_open(name, *a, **kw)
class Response:
    def __init__(self, code, body, headers=None):
        self.status_code, self.body, self.headers = code, body, headers or {}
    def json(self): return self.body
    def raise_for_status(self):
        if self.status_code >= 400: raise RuntimeError('HTTP failure')
responses = [Response(202, {'status': 'pending', 'run_id': 'job-1', 'request_id': 'job-1'})]
if mode == 'success':
    responses += [Response(503, {}, {'Retry-After': '7'}), Response(200, {'data': {'status': 'IN_PROGRESS'}}, {'X-Poll-After': '5'}), Response(200, {'status': 'completed', 'transcription': 'hello'})]
else:
    responses += [Response(200, {'data': {'status': 'FAILED', 'error': 'No speech detected in audio'}})]
count = [0]
def post(url, **kwargs):
    assert kwargs['headers'] == {'Authorization': 'Bearer fixture-key'}
    if count[0] > 0:
        assert url.endswith('/api/transcribe/status')
        assert kwargs['json'] == {'runId': 'job-1'}
    count[0] += 1
    return responses.pop(0)
sys.modules['requests'] = types.SimpleNamespace(post=post)
out = io.StringIO()
try:
    with contextlib.redirect_stdout(out): exec(source, {})
except RuntimeError as error:
    assert mode == 'failure' and str(error) == 'No speech detected in audio', str(error)
else:
    assert mode == 'success' and out.getvalue().strip() == 'hello'
assert not responses
assert waits == ([7.0, 5.0] if mode == 'success' else [])
`;
  for (const mode of ['success', 'failure']) {
    const result = spawnSync('python3', ['-c', harness, source, mode], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
