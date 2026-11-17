'use strict';

const assert = require('assert');
const http = require('http');
const app = require('../app.js');

const { PROVIDERS, buildRequest, extractDelta, extractUsage, streamChat, renderMarkdown, escapeHtml } = app;

let passed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }

function fakeResponse(chunks, opts) {
  opts = opts || {};
  let i = 0;
  return {
    ok: opts.ok !== false,
    status: opts.status || 200,
    statusText: opts.statusText || '',
    json: async () => (opts.jsonBody || {}),
    text: async () => JSON.stringify(opts.jsonBody || {}),
    body: chunks ? {
      getReader() {
        return {
          async read() {
            if (i < chunks.length) return { done: false, value: new TextEncoder().encode(chunks[i++]) };
            return { done: true, value: undefined };
          },
          releaseLock() {}
        };
      }
    } : null
  };
}

async function collect(provider, settings, history, fetchImpl) {
  const realFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    let text = '';
    let usage = null;
    await streamChat(provider, settings, history, {
      onDelta: d => { text += d; },
      onUsage: u => { usage = Object.assign({}, usage, u); }
    });
    return { text, usage };
  } finally {
    global.fetch = realFetch;
  }
}

async function main() {
  console.log('buildRequest 테스트');
  {
    const s = { provider: 'openai', apiKey: 'sk-test', baseUrl: '', model: 'gpt-4o', systemPrompt: '한국어로' };
    const { url, init } = buildRequest('openai', s, [{ role: 'user', content: 'hi' }]);
    assert.strictEqual(url, 'https://api.openai.com/v1/chat/completions');
    assert.strictEqual(init.headers.Authorization, 'Bearer sk-test');
    const body = JSON.parse(init.body);
    assert.strictEqual(body.model, 'gpt-4o');
    assert.strictEqual(body.stream, true);
    assert.deepStrictEqual(body.messages[0], { role: 'system', content: '한국어로' });
    assert.deepStrictEqual(body.messages[1], { role: 'user', content: 'hi' });
    ok('openai: URL/헤더/바디 정상');
  }
  {
    const s = { provider: 'anthropic', apiKey: 'sk-ant', baseUrl: '', model: 'claude-sonnet-4-5', systemPrompt: 'sys' };
    const { url, init } = buildRequest('anthropic', s, [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'hi' }]);
    assert.strictEqual(url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(init.headers['x-api-key'], 'sk-ant');
    assert.strictEqual(init.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
    const body = JSON.parse(init.body);
    assert.strictEqual(body.system, 'sys');
    assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'hi' }]);
    ok('anthropic: system 분리, 선행 assistant 제거, 브라우저 헤더 포함');
  }
  {
    const s = { provider: 'gemini', apiKey: 'AIza-key', baseUrl: '', model: 'gemini-2.5-flash', systemPrompt: 'sys' };
    const { url, init } = buildRequest('gemini', s, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerate?key=AIza-key'));
    const body = JSON.parse(init.body);
    assert.deepStrictEqual(body.contents[0], { role: 'user', parts: [{ text: 'hi' }] });
    assert.deepStrictEqual(body.contents[1], { role: 'model', parts: [{ text: 'yo' }] });
    assert.deepStrictEqual(body.systemInstruction, { parts: [{ text: 'sys' }] });
    ok('gemini: role=model 변환, key 쿼리, systemInstruction');
  }
  {
    const s = { provider: 'ollama', apiKey: '', baseUrl: '', model: 'llama3.2', systemPrompt: '' };
    const { url, init } = buildRequest('ollama', s, [{ role: 'user', content: 'hi' }]);
    assert.strictEqual(url, 'http://localhost:11434/api/chat');
    assert.strictEqual(init.headers.Authorization, undefined);
    ok('ollama: /api/chat, 인증 헤더 없음');
  }
  {
    const s = { provider: 'openai', apiKey: 'k', baseUrl: 'https://proxy.example.com/v1/', model: 'gpt-4o', systemPrompt: '' };
    const { url } = buildRequest('openai', s, [{ role: 'user', content: 'hi' }]);
    assert.strictEqual(url, 'https://proxy.example.com/v1/chat/completions');
    ok('baseUrl 커스텀 + 후행 슬래시 제거');
  }

  console.log('extractDelta / extractUsage 테스트');
  {
    assert.strictEqual(extractDelta('openai', { choices: [{ delta: { content: 'abc' } }] }), 'abc');
    assert.strictEqual(extractDelta('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }), 'hi');
    assert.strictEqual(extractDelta('anthropic', { type: 'ping' }), '');
    assert.strictEqual(extractDelta('gemini', { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab');
    assert.strictEqual(extractDelta('ollama', { message: { content: 'x' } }), 'x');
    assert.deepStrictEqual(extractUsage('openai', { usage: { prompt_tokens: 3, completion_tokens: 2 } }), { input: 3, output: 2 });
    assert.deepStrictEqual(extractUsage('gemini', { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 } }), { input: 5, output: 7 });
    assert.deepStrictEqual(extractUsage('ollama', { done: true, prompt_eval_count: 4, eval_count: 6 }), { input: 4, output: 6 });
    assert.strictEqual(extractDelta('openai', { choices: [{ delta: { content: [{ type: 'text', text: '안' }, { type: 'text', text: '녕' }] } }] }), '안녕');
    assert.strictEqual(extractDelta('openai', { choices: [{ delta: { content: { text: 'hi' } } }] }), 'hi');
    assert.strictEqual(extractDelta('openai', { choices: [{ delta: { content: 'a', reasoning_content: '생각' } }] }), '생각a');
    assert.strictEqual(extractDelta('openai', { choices: [{ delta: { role: 'assistant' } }] }), '');
    ok('제공자별 델타/사용량 추출 정상');
  }

  console.log('streamChat 테스트 (mock fetch)');
  {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"안녕"}}]}\n',
      'data: {"choices":[{"delta":{"content":", "', // 청크 중간에서 끊긴 SSE 라인
      '}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"반가워요!"}}]}\n\n',
      'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n',
      'data: [DONE]\n\n'
    ];
    const r = await collect('openai', { apiKey: 'k', baseUrl: '', model: 'm', systemPrompt: '' }, [{ role: 'user', content: 'hi' }], async () => fakeResponse(chunks));
    assert.strictEqual(r.text, '안녕, 반가워요!');
    assert.deepStrictEqual(r.usage, { input: 10, output: 5 });
    ok('openai SSE: 청크 분할/빈 줄/[DONE] 처리, usage 수집');
  }
  {
    const chunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":8,"output_tokens":0}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Claude "}}\n\n',
      'data: {"type":"content_block_delta","delta":{"text":"인사합니다."}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    ];
    const r = await collect('anthropic', { apiKey: 'k', baseUrl: '', model: 'claude-sonnet-4-5', systemPrompt: '' }, [{ role: 'user', content: 'hi' }], async () => fakeResponse(chunks));
    assert.strictEqual(r.text, 'Claude 인사합니다.');
    assert.deepStrictEqual(r.usage, { input: 8, output: 4 });
    ok('anthropic SSE: event 라인 무시, message_start/message_delta usage 병합');
  }
  {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}],"role":"model"}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"대답"}],"role":"model"}}],"usageMetadata":{"promptTokenCount":6,"candidatesTokenCount":2}}\n\n'
    ];
    const r = await collect('gemini', { apiKey: 'k', baseUrl: '', model: 'gemini-2.5-flash', systemPrompt: '' }, [{ role: 'user', content: 'hi' }], async () => fakeResponse(chunks));
    assert.strictEqual(r.text, 'Gemini 대답');
    assert.deepStrictEqual(r.usage, { input: 6, output: 2 });
    ok('gemini SSE: parts 결합 + usageMetadata');
  }
  {
    const chunks = [
      '{"message":{"role":"assistant","content":"로컬 "},"done":false}\n',
      '{"message":{"role":"assistant","content":"모델!"},"done":false}\n',
      '{"message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":9,"eval_count":3}\n'
    ];
    const r = await collect('ollama', { apiKey: '', baseUrl: '', model: 'llama3.2', systemPrompt: '' }, [{ role: 'user', content: 'hi' }], async () => fakeResponse(chunks));
    assert.strictEqual(r.text, '로컬 모델!');
    assert.deepStrictEqual(r.usage, { input: 9, output: 3 });
    ok('ollama NDJSON: done 청크에서 usage 추출');
  }
  {
    await assert.rejects(
      collect('openai', { apiKey: 'bad', baseUrl: '', model: 'm', systemPrompt: '' }, [{ role: 'user', content: 'hi' }],
        async () => fakeResponse(null, { ok: false, status: 401, jsonBody: { error: { message: 'Incorrect API key provided' } } })),
      /HTTP 401.*Incorrect API key/
    );
    ok('에러 응답: HTTP 상태 + 제공자 에러 메시지 노출');
  }

  console.log('streamChat 통합 테스트 (실제 로컬 HTTP 서버 + SSE)');
  {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        assert.strictEqual(parsed.model, 'gpt-4o-mini');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
        const lines = [
          'data: {"choices":[{"delta":{"content":"서버"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"에서 "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"옴"}}],"usage":{"prompt_tokens":1,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n'
        ];
        let i = 0;
        const timer = setInterval(() => {
          if (i < lines.length) { res.write(lines[i++]); }
          else { clearInterval(timer); res.end(); }
        }, 10);
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const r = await collect('openai',
      { apiKey: 'k', baseUrl: 'http://127.0.0.1:' + port + '/v1', model: 'gpt-4o-mini', systemPrompt: '' },
      [{ role: 'user', content: '테스트' }],
      global.fetch);
    server.close();
    assert.strictEqual(r.text, '서버에서 옴');
    assert.deepStrictEqual(r.usage, { input: 1, output: 2 });
    ok('실제 fetch + SSE 스트림 종단간 수신 성공');
  }

  console.log('renderMarkdown 테스트');
  {
    const html = renderMarkdown('# 제목\n\n이것은 **굵게** 그리고 *기울임* 그리고 `코드` 입니다.\n\n- 항목1\n- 항목2\n\n1. 하나\n2. 둘\n\n> 인용문\n\n[링크](https://example.com)\n\n```js\nconst x = "<script>alert(1)</script>";\n```\n\n끝 ```미닫힘 코드 ```py\nlet a=1');
    assert.ok(html.includes('<h1>제목</h1>'));
    assert.ok(html.includes('<strong>굵게</strong>'));
    assert.ok(html.includes('<em>기울임</em>'));
    assert.ok(html.includes('<code>코드</code>'));
    assert.ok(html.includes('<ul><li>항목1</li><li>항목2</li></ul>'));
    assert.ok(html.includes('<ol><li>하나</li><li>둘</li></ol>'));
    assert.ok(html.includes('<blockquote>인용문</blockquote>'));
    assert.ok(html.includes('<a href="https://example.com"'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    const mathSrc = '수식: $E=mc^2$ 및 $$\\int_0^1 x\\,dx$$';
    assert.ok(renderMarkdown(mathSrc).includes('$E=mc^2$'));
    assert.ok(renderMarkdown(mathSrc).includes('$$\\int_0^1 x\\,dx$$'));
    assert.ok(html.includes('data-copy="code"'));
    assert.ok(html.includes('let a=1'), '미닫힌 코드 펜스도 렌더링');
    ok('마크다운: 헤딩/강조/리스트/인용/링크/코드(이스케이프) 정상');
  }
  {
    assert.strictEqual(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
    ok('escapeHtml 정상');
  }

  console.log('\n모든 테스트 통과: ' + passed + '개');
}

main().catch(e => { console.error('테스트 실패:', e); process.exit(1); });
