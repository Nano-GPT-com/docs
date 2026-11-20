"""Execute published Python examples against deterministic HTTP/SSE fixtures."""
import contextlib
import io
import json
from pathlib import Path
import re
import unittest
from unittest.mock import patch
import httpx
import openai

ROOT = Path(__file__).resolve().parents[1]

def blocks(page):
    return re.findall(r'```python\n(.*?)```', (ROOT / page).read_text(), re.S)

class QuickstartTest(unittest.TestCase):
    def run_example(self, code, *, frames=None, status=200, read_timeout=False):
        requests = []
        closed = []
        class Body(httpx.SyncByteStream):
            def __iter__(self):
                for frame in frames or []:
                    # Exercise transport fragmentation as well as SSE boundaries.
                    data = ('data: ' + json.dumps(frame) + '\n\n').encode()
                    yield data[:7]
                    yield data[7:]
                if read_timeout:
                    raise httpx.ReadTimeout('fixture timeout')
                yield b'data: [DONE]\n\n'
            def close(self):
                closed.append(True)
        def handler(request):
            requests.append(request)
            self.assertEqual(str(request.url), 'https://api.nano-gpt.com/api/v1/chat/completions')
            self.assertEqual(request.headers['authorization'], 'Bearer fixture-key')
            self.assertEqual(request.extensions['timeout']['read'], 60)
            if status != 200:
                return httpx.Response(status, headers={'x-request-id': 'req-error'}, json={'error': {'message': 'fixture failure', 'type': 'invalid_request_error'}})
            if frames is not None:
                return httpx.Response(200, headers={'x-request-id': 'req-stream', 'content-type': 'text/event-stream'}, stream=Body())
            return httpx.Response(200, headers={'x-request-id': 'req-complete'}, json={
                'id': 'chat-fixture', 'object': 'chat.completion', 'created': 1, 'model': 'openai/gpt-4o-mini',
                'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'Hello'}, 'finish_reason': 'stop'}],
            })
        real_client = openai.OpenAI
        def client(**kwargs):
            self.assertEqual(kwargs['max_retries'], 0)
            return real_client(**kwargs, http_client=httpx.Client(transport=httpx.MockTransport(handler)))
        stdout, stderr = io.StringIO(), io.StringIO()
        error = None
        with patch.dict('os.environ', {'NANOGPT_API_KEY': 'fixture-key'}), patch('openai.OpenAI', client), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                exec(compile(code, '<published quickstart>', 'exec'), {})
            except Exception as exc:
                error = exc
        self.assertEqual(len(requests), 1)
        return stdout.getvalue(), stderr.getvalue(), closed, error

    def test_complete_examples(self):
        self.assertEqual(blocks('introduction.mdx')[0], blocks('quickstart.mdx')[0])
        for page in ['introduction.mdx', 'quickstart.mdx']:
            out, _, _, error = self.run_example(blocks(page)[0])
            self.assertIsNone(error)
            self.assertIn('req-complete', out)
            self.assertIn('Hello', out)

    def test_stream_mixed_frames(self):
        def chunk(delta, index=0):
            return {'id': 'c', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'fixture', 'choices': [{'index': index, 'delta': delta, 'finish_reason': None}]}
        frames = [chunk({}), chunk({'reasoning_content': 'Thinking'}), chunk({'content': 'Hello'}),
                  chunk({'tool_calls': [{'index': 0, 'id': 'call-1', 'type': 'function', 'function': {'name': 'weather', 'arguments': '{"city":'}}]}),
                  chunk({'tool_calls': [{'index': 0, 'function': {'arguments': '"Paris"}'}}]}),
                  {'id': 'c', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'fixture', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'tool_calls'}]},
                  {'id': 'c', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'fixture', 'choices': [], 'usage': {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3}}]
        out, err, closed, error = self.run_example(blocks('quickstart.mdx')[1], frames=frames)
        self.assertIsNone(error)
        self.assertIn('req-stream', out)
        self.assertIn('Hello', out)
        self.assertIn('Thinking', err)
        self.assertIn('Usage:', err)
        self.assertIn('weather', err)
        tool = json.loads(err.split('Tool call: ', 1)[1].strip())
        self.assertEqual(tool, {'id': 'call-1', 'name': 'weather', 'arguments': '{"city":"Paris"}'})
        self.assertEqual(closed, [True])

    def test_http_error_body_and_request_id(self):
        _, err, _, error = self.run_example(blocks('quickstart.mdx')[1], status=400)
        self.assertIsInstance(error, openai.APIStatusError)
        self.assertIn('fixture failure', err)
        self.assertIn('req-error', err)

    def test_in_stream_error_closes_connection(self):
        _, err, closed, error = self.run_example(blocks('quickstart.mdx')[1], frames=[{'error': {'message': 'stream failed'}}])
        self.assertIsInstance(error, openai.APIError)
        self.assertIn('stream failed', err)
        self.assertEqual(closed, [True])

    def test_premature_end_is_not_success(self):
        out, err, closed, error = self.run_example(blocks('quickstart.mdx')[1], frames=[])
        self.assertIsInstance(error, RuntimeError)
        self.assertIn('Stream ended before completion', err)
        self.assertIn('req-stream', out)
        self.assertEqual(closed, [True])

    def test_mid_stream_timeout_is_reported_and_closed(self):
        out, err, closed, error = self.run_example(blocks('quickstart.mdx')[1], frames=[], read_timeout=True)
        self.assertIsInstance(error, httpx.ReadTimeout)
        self.assertIn('fixture timeout', err)
        self.assertIn('req-stream', out)
        self.assertEqual(closed, [True])

if __name__ == '__main__':
    unittest.main()
