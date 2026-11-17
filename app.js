'use strict';

const PROVIDERS = {
  openai: {
    name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o3', 'o4-mini']
  },
  anthropic: {
    name: 'Anthropic (Claude)', type: 'anthropic', baseUrl: 'https://api.anthropic.com', needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5']
  },
  gemini: {
    name: 'Google Gemini', type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
  },
  openrouter: {
    name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'x-ai/grok-4', 'deepseek/deepseek-chat-v3.1', 'qwen/qwen3-235b']
  },
  groq: {
    name: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant']
  },
  mistral: {
    name: 'Mistral', type: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys/',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest']
  },
  deepseek: {
    name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com', needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  xai: {
    name: 'xAI (Grok)', type: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true,
    keyUrl: 'https://console.x.ai/',
    models: ['grok-4', 'grok-3-mini', 'grok-code-fast-1']
  },
  ollama: {
    name: 'Ollama (로컬)', type: 'ollama', baseUrl: 'http://localhost:11434', needsKey: false,
    keyUrl: '',
    models: ['llama3.2', 'qwen3', 'deepseek-r1', 'gemma3']
  }
};

const DEFAULT_SETTINGS = { provider: 'openai', apiKey: '', baseUrl: '', model: '', systemPrompt: '' };

function buildRequest(provider, settings, history) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('알 수 없는 제공자: ' + provider);
  const base = (settings.baseUrl || p.baseUrl).replace(/\/+$/, '');
  const model = settings.model;
  if (!model) throw new Error('모델을 선택하세요.');

  if (p.type === 'openai') {
    const messages = [];
    if (settings.systemPrompt) messages.push({ role: 'system', content: settings.systemPrompt });
    messages.push(...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })));
    while (messages.length && messages[0].role !== 'user' && messages[0].role !== 'system') messages.shift();
    return {
      url: base + '/chat/completions',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: 'Bearer ' + settings.apiKey } : {})
        },
        body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } })
      }
    };
  }

  if (p.type === 'anthropic') {
    const messages = history
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      .filter(m => m.content);
    while (messages.length && messages[0].role !== 'user') messages.shift();
    return {
      url: base + '/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          ...(settings.systemPrompt ? { system: settings.systemPrompt } : {}),
          messages,
          stream: true
        })
      }
    };
  }

  if (p.type === 'gemini') {
    const contents = history
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
      .filter(c => c.parts[0].text);
    while (contents.length && contents[0].role !== 'user') contents.shift();
    const body = { contents };
    if (settings.systemPrompt) body.systemInstruction = { parts: [{ text: settings.systemPrompt }] };
    return {
      url: base + '/models/' + encodeURIComponent(model) + ':streamGenerate?key=' + encodeURIComponent(settings.apiKey),
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    };
  }

  if (p.type === 'ollama') {
    const messages = [];
    if (settings.systemPrompt) messages.push({ role: 'system', content: settings.systemPrompt });
    messages.push(...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })));
    return {
      url: base + '/api/chat',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true })
      }
    };
  }

  throw new Error('지원하지 않는 제공자 타입: ' + p.type);
}

function contentToText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(p => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
  }
  if (typeof content === 'object') return content.text || '';
  return String(content);
}

function extractDelta(provider, obj) {
  const t = PROVIDERS[provider].type;
  if (t === 'openai') {
    const c = obj && obj.choices && obj.choices[0];
    if (!c || !c.delta) return '';
    const reasoning = typeof c.delta.reasoning_content === 'string' ? c.delta.reasoning_content
      : (typeof c.delta.reasoning === 'string' ? c.delta.reasoning : '');
    return reasoning + contentToText(c.delta.content);
  }
  if (t === 'anthropic') {
    if (obj.type === 'content_block_delta' && obj.delta) return obj.delta.text || '';
    return '';
  }
  if (t === 'gemini') {
    const cand = obj && obj.candidates && obj.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) return '';
    return cand.content.parts.map(pt => pt.text || '').join('');
  }
  if (t === 'ollama') {
    return (obj && obj.message && obj.message.content) || '';
  }
  return '';
}

function extractUsage(provider, obj) {
  const t = PROVIDERS[provider].type;
  if (t === 'openai') {
    return obj.usage ? { input: obj.usage.prompt_tokens, output: obj.usage.completion_tokens } : null;
  }
  if (t === 'anthropic') {
    if (obj.type === 'message_start' && obj.message && obj.message.usage) {
      return { input: obj.message.usage.input_tokens, output: obj.message.usage.output_tokens };
    }
    if (obj.type === 'message_delta' && obj.usage) return { output: obj.usage.output_tokens };
    return null;
  }
  if (t === 'gemini') {
    return obj.usageMetadata ? { input: obj.usageMetadata.promptTokenCount, output: obj.usageMetadata.candidatesTokenCount } : null;
  }
  if (t === 'ollama') {
    return obj.done ? { input: obj.prompt_eval_count, output: obj.eval_count } : null;
  }
  return null;
}

async function streamChat(provider, settings, history, handlers) {
  const onDelta = (handlers && handlers.onDelta) || function () {};
  const onUsage = (handlers && handlers.onUsage) || function () {};
  const signal = handlers && handlers.signal;
  const { url, init } = buildRequest(provider, settings, history);
  const res = await fetch(url, Object.assign({}, init, { signal }));

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j && j.error && (j.error.message || j.error)) || JSON.stringify(j);
    } catch (e) {
      try { detail = await res.text(); } catch (e2) { detail = ''; }
    }
    throw new Error('요청 실패 (HTTP ' + res.status + '): ' + (detail || res.statusText || '알 수 없는 오류'));
  }

  const isNdjson = PROVIDERS[provider].type === 'ollama';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '').trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      if (isNdjson) {
        try {
          const o = JSON.parse(line);
          const d = extractDelta(provider, o);
          onDelta(typeof d === 'string' ? d : contentToText(d));
          const u = extractUsage(provider, o);
          if (u) onUsage(u);
        } catch (e) { /* 부분 JSON 무시 */ }
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const o = JSON.parse(data);
        const d = extractDelta(provider, o);
        onDelta(typeof d === 'string' ? d : contentToText(d));
        const u = extractUsage(provider, o);
        if (u) onUsage(u);
      } catch (e) { /* 부분 JSON 무시 */ }
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(escaped) {
  let s = escaped;
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function renderMarkdown(src) {
  const lines = String(src).split('\n');
  let html = '';
  let i = 0;
  let inCode = false, codeLang = '', codeLines = [];
  let list = null;

  const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
  const flushCode = () => {
    html += '<div class="code-block"><div class="code-head"><span>' + escapeHtml(codeLang || 'code') +
      '</span><button class="copy-btn" type="button" data-copy="code">복사</button></div><pre><code>' +
      escapeHtml(codeLines.join('\n')) + '</code></pre></div>';
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inCode) { flushCode(); inCode = false; codeLines = []; codeLang = ''; }
      else { closeList(); inCode = true; codeLang = fence[1]; codeLines = []; }
      i++;
      continue;
    }
    if (inCode) { codeLines.push(line); i++; continue; }
    if (/^\s*$/.test(line)) { closeList(); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lv = h[1].length; html += '<h' + lv + '>' + renderInline(escapeHtml(h[2])) + '</h' + lv + '>'; i++; continue; }

    const q = line.match(/^&gt;\s?(.*)$/) || line.match(/^>\s?(.*)$/);
    if (q) { closeList(); html += '<blockquote>' + renderInline(escapeHtml(q[1])) + '</blockquote>'; i++; continue; }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += '<li>' + renderInline(escapeHtml(ul[1])) + '</li>'; i++; continue; }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += '<li>' + renderInline(escapeHtml(ol[1])) + '</li>'; i++; continue; }

    let para = line;
    i++;
    while (i < lines.length &&
           !/^\s*$/.test(lines[i]) &&
           !/^```/.test(lines[i]) &&
           !/^(#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
      para += '\n' + lines[i];
      i++;
    }
    closeList();
    html += '<p>' + renderInline(escapeHtml(para)).replace(/\n/g, '<br>') + '</p>';
  }
  if (inCode) flushCode();
  closeList();
  return html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PROVIDERS, DEFAULT_SETTINGS, buildRequest, extractDelta, extractUsage, streamChat, escapeHtml, renderMarkdown, contentToText };
}

if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}

function init() {
  const $ = sel => document.querySelector(sel);
  const els = {
    convList: $('#conversation-list'),
    newChat: $('#new-chat-btn'),
    settingsBtn: $('#settings-btn'),
    menuBtn: $('#menu-btn'),
    sidebar: $('#sidebar'),
    sidebarBackdrop: $('#sidebar-backdrop'),
    messages: $('#messages'),
    input: $('#input'),
    sendBtn: $('#send-btn'),
    stopBtn: $('#stop-btn'),
    suggestions: $('#suggestions'),
    providerBadge: $('#provider-badge'),
    modelName: $('#model-name'),
    modal: $('#settings-modal'),
    setProvider: $('#set-provider'),
    setApiKey: $('#set-apikey'),
    toggleKey: $('#toggle-key'),
    setModel: $('#set-model'),
    modelList: $('#model-list'),
    setBaseUrl: $('#set-baseurl'),
    setSystem: $('#set-system'),
    keyLink: $('#key-link'),
    testConn: $('#test-conn'),
    clearKey: $('#clear-key'),
    saveSettings: $('#save-settings'),
    closeSettings: $('#close-settings'),
    status: $('#settings-status')
  };

  const SUGGESTIONS = ['코드 설명해줘', '영어 이메일 초안 써줘', '파이썬 예제 코드 짜줘', '긴 글을 요약해줘', '면접 질문 준비해줘' ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem('vibechat.settings');
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }

  function loadConversations() {
    try {
      const raw = localStorage.getItem('vibechat.conversations');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  const state = {
    settings: loadSettings(),
    conversations: loadConversations(),
    currentId: localStorage.getItem('vibechat.currentId') || null,
    streaming: false,
    abort: null
  };

  if (!state.conversations.length) {
    const conv = newConversation();
    state.conversations.push(conv);
    state.currentId = conv.id;
    saveConversations();
  }
  if (!state.conversations.some(c => c.id === state.currentId)) {
    state.currentId = state.conversations[0].id;
  }

  function saveSettings() { localStorage.setItem('vibechat.settings', JSON.stringify(state.settings)); }
  function saveConversations() { localStorage.setItem('vibechat.conversations', JSON.stringify(state.conversations)); }
  function saveCurrent() { localStorage.setItem('vibechat.currentId', state.currentId || ''); }

  function newConversation() {
    return { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), title: '새 대화', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  }

  function currentConv() { return state.conversations.find(c => c.id === state.currentId); }

  function providerDef() { return PROVIDERS[state.settings.provider] || PROVIDERS.openai; }

  function updateHeader() {
    const p = providerDef();
    els.providerBadge.textContent = p.name;
    els.modelName.textContent = state.settings.model ? '모델: ' + state.settings.model : '모델 미선택 — 설정에서 모델을 선택하세요';
  }

  function renderSidebar() {
    const sorted = state.conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    els.convList.innerHTML = '';
    for (const c of sorted) {
      const item = document.createElement('div');
      item.className = 'conv-item' + (c.id === state.currentId ? ' active' : '');
      const title = document.createElement('span');
      title.className = 'conv-title';
      title.textContent = c.title || '새 대화';
      const del = document.createElement('button');
      del.className = 'conv-del';
      del.textContent = '🗑';
      del.title = '대화 삭제';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.conversations = state.conversations.filter(x => x.id !== c.id);
        if (state.currentId === c.id) {
          if (state.conversations.length) state.currentId = state.conversations[0].id;
          else { const nc = newConversation(); state.conversations.push(nc); state.currentId = nc.id; }
        }
        saveConversations(); saveCurrent();
        renderSidebar(); renderMessages();
      });
      item.appendChild(title); item.appendChild(del);
      item.addEventListener('click', () => {
        state.currentId = c.id; saveCurrent(); renderSidebar(); renderMessages(); scrollBottom(); closeSidebar();
      });
      els.convList.appendChild(item);
    }
  }

  function messageHtml(m) {
    if (m.role === 'user') {
      return '<div class="msg user"><div class="bubble">' + escapeHtml(m.content) + '</div></div>';
    }
    let actions = '<div class="msg-actions">' +
      '<button class="mini-btn" type="button" data-copy="msg">복사</button>' +
      '<button class="mini-btn" type="button" data-regen="1">다시 생성</button></div>';
    let usage = '';
    if (m.usage && (m.usage.input != null || m.usage.output != null)) {
      usage = '<div class="usage">토큰 — 입력: ' + (m.usage.input ?? '?') + ' · 출력: ' + (m.usage.output ?? '?') + '</div>';
    }
    const body = m.streaming && !m.content
      ? '<span class="typing">생각 중…</span>'
      : renderMarkdown(m.content);
    return '<div class="msg assistant"><div class="avatar">🤖</div><div><div class="bubble markdown">' + body + '</div>' + actions + usage + '</div></div>';
  }

  function renderMessages() {
    const conv = currentConv();
    els.messages.innerHTML = '';
    if (!conv || !conv.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<h1>무엇을 도와드릴까요?</h1><p>왼쪽 상단 <b>+ 새 대화</b>로 시작하거나, 오른쪽(아래) 입력창에 메시지를 입력하세요.<br>처음이라면 ⚙ 설정에서 제공자와 API 키를 먼저 입력하면 됩니다.</p>';
      els.messages.appendChild(empty);
      renderSuggestions();
      return;
    }
    els.suggestions.innerHTML = '';
    for (const m of conv.messages) {
      const wrap = document.createElement('div');
      wrap.innerHTML = messageHtml(m);
      const node = wrap.firstElementChild;
      if (m.error) {
        const err = document.createElement('div');
        err.className = 'msg-error';
        err.textContent = '⚠ ' + m.error;
        els.messages.appendChild(err);
      }
      els.messages.appendChild(node);
    }
    scrollBottom();
  }

  function renderSuggestions() {
    els.suggestions.innerHTML = '';
    for (const s of SUGGESTIONS) {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.type = 'button';
      chip.textContent = s;
      chip.addEventListener('click', () => { els.input.value = s; autosize(); els.input.focus(); });
      els.suggestions.appendChild(chip);
    }
  }

  function scrollBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  }

  function toggleButtons() {
    els.sendBtn.classList.toggle('hidden', state.streaming);
    els.stopBtn.classList.toggle('hidden', !state.streaming);
    els.sendBtn.disabled = state.streaming;
  }

  function ensureTitle(conv) {
    if (conv.title === '새 대화') {
      const first = conv.messages.find(m => m.role === 'user');
      if (first) conv.title = first.content.replace(/\s+/g, ' ').trim().slice(0, 30);
    }
  }

  async function send(presetText) {
    const text = (presetText != null ? presetText : els.input.value).trim();
    if (!text || state.streaming) return;
    const p = providerDef();
    if (p.needsKey && !state.settings.apiKey) {
      setStatus('먼저 설정에서 API 키를 입력하세요.', 'err');
      openSettings();
      return;
    }
    if (!state.settings.model) {
      setStatus('먼저 설정에서 모델을 선택하세요.', 'err');
      openSettings();
      return;
    }

    let conv = currentConv();
    if (!conv) { conv = newConversation(); state.conversations.push(conv); state.currentId = conv.id; }

    conv.messages.push({ role: 'user', content: text });
    conv.messages.push({ role: 'assistant', content: '', streaming: true });
    if (presetText == null) { els.input.value = ''; autosize(); }

    state.streaming = true;
    state.abort = new AbortController();
    toggleButtons();
    renderSidebar();
    renderMessages();

    const history = conv.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const assistantMsg = conv.messages[conv.messages.length - 1];
    let raf = null;
    const scheduleUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const bubbles = els.messages.querySelectorAll('.msg.assistant .bubble');
        const b = bubbles[bubbles.length - 1];
        if (b) b.innerHTML = assistantMsg.content ? renderMarkdown(assistantMsg.content) : '<span class="typing">생각 중…</span>';
        scrollBottom();
      });
    };

    try {
      await streamChat(state.settings.provider, state.settings, history, {
        signal: state.abort.signal,
        onDelta: d => { assistantMsg.content += d; scheduleUpdate(); },
        onUsage: u => { assistantMsg.usage = Object.assign({}, assistantMsg.usage, u); scheduleUpdate(); }
      });
    } catch (e) {
      if (state.abort.signal.aborted) assistantMsg.stopped = true;
      else assistantMsg.error = e.message;
    } finally {
      assistantMsg.streaming = false;
      state.streaming = false;
      state.abort = null;
      conv.updatedAt = Date.now();
      ensureTitle(conv);
      saveConversations();
      toggleButtons();
      renderSidebar();
      renderMessages();
    }
  }

  function stop() { if (state.abort) state.abort.abort(); }

  function regenerate() {
    const conv = currentConv();
    if (!conv || state.streaming) return;
    while (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'assistant') conv.messages.pop();
    const lastUser = conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
    if (!lastUser || lastUser.role !== 'user') return;
    send(lastUser.content);
  }

  function openSettings() {
    els.setProvider.innerHTML = '';
    for (const key of Object.keys(PROVIDERS)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = PROVIDERS[key].name;
      els.setProvider.appendChild(opt);
    }
    els.setProvider.value = state.settings.provider in PROVIDERS ? state.settings.provider : 'openai';
    fillProviderDefaults(false);
    els.setApiKey.value = state.settings.apiKey;
    els.setApiKey.type = 'password';
    els.setModel.value = state.settings.model;
    els.setBaseUrl.value = state.settings.baseUrl;
    els.setSystem.value = state.settings.systemPrompt;
    setStatus('', '');
    els.modal.classList.remove('hidden');
  }

  function fillProviderDefaults(overwriteModel) {
    const p = PROVIDERS[els.setProvider.value];
    els.modelList.innerHTML = '';
    for (const m of p.models) {
      const opt = document.createElement('option');
      opt.value = m;
      els.modelList.appendChild(opt);
    }
    els.setBaseUrl.placeholder = p.baseUrl;
    if (p.needsKey) {
      els.keyLink.textContent = '키 발급받기 ↗';
      els.keyLink.href = p.keyUrl;
      els.keyLink.style.display = '';
      els.setApiKey.disabled = false;
    } else {
      els.keyLink.style.display = 'none';
      els.setApiKey.disabled = true;
      els.setApiKey.placeholder = '로컬 모델은 API 키가 필요 없습니다';
    }
    if (overwriteModel || !els.setModel.value || !p.models.includes(els.setModel.value)) {
      els.setModel.value = p.models[0];
    }
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg;
    els.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function saveSettingsFromModal() {
    const p = PROVIDERS[els.setProvider.value];
    state.settings = {
      provider: els.setProvider.value,
      apiKey: els.setApiKey.value.trim(),
      baseUrl: els.setBaseUrl.value.trim(),
      model: els.setModel.value.trim(),
      systemPrompt: els.setSystem.value
    };
    if (p.needsKey && !state.settings.apiKey) {
      setStatus('API 키를 입력하세요.', 'err');
      return;
    }
    if (!state.settings.model) {
      setStatus('모델을 입력하세요.', 'err');
      return;
    }
    saveSettings();
    setStatus('저장했습니다.', 'ok');
    updateHeader();
    setTimeout(() => els.modal.classList.add('hidden'), 350);
  }

  async function testConnection() {
    const p = PROVIDERS[els.setProvider.value];
    const settings = {
      provider: els.setProvider.value,
      apiKey: els.setApiKey.value.trim(),
      baseUrl: els.setBaseUrl.value.trim(),
      model: els.setModel.value.trim(),
      systemPrompt: ''
    };
    if (p.needsKey && !settings.apiKey) { setStatus('API 키를 먼저 입력하세요.', 'err'); return; }
    if (!settings.model) { setStatus('모델을 먼저 입력하세요.', 'err'); return; }
    setStatus('연결 테스트 중…', '');
    els.testConn.disabled = true;
    try {
      let got = '';
      await streamChat(settings.provider, settings, [{ role: 'user', content: '안녕' }], {
        onDelta: d => { got += d; }
      });
      setStatus(got ? '✅ 연결 성공! 응답: ' + got.slice(0, 60) : '✅ 연결 성공 (빈 응답)', 'ok');
    } catch (e) {
      setStatus('❌ 실패: ' + e.message, 'err');
    } finally {
      els.testConn.disabled = false;
    }
  }

  els.newChat.addEventListener('click', () => {
    const conv = newConversation();
    state.conversations.push(conv);
    state.currentId = conv.id;
    saveConversations(); saveCurrent();
    renderSidebar(); renderMessages(); closeSidebar();
    els.input.focus();
  });

  els.settingsBtn.addEventListener('click', openSettings);

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarBackdrop.classList.remove('show');
  }
  els.menuBtn.addEventListener('click', () => {
    const open = els.sidebar.classList.toggle('open');
    els.sidebarBackdrop.classList.toggle('show', open);
  });
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.closeSettings.addEventListener('click', () => els.modal.classList.add('hidden'));
  els.modal.addEventListener('click', (ev) => { if (ev.target === els.modal) els.modal.classList.add('hidden'); });
  els.saveSettings.addEventListener('click', saveSettingsFromModal);
  els.clearKey.addEventListener('click', () => { els.setApiKey.value = ''; els.setApiKey.focus(); });
  els.testConn.addEventListener('click', testConnection);
  els.setProvider.addEventListener('change', () => fillProviderDefaults(true));
  els.toggleKey.addEventListener('click', () => {
    els.setApiKey.type = els.setApiKey.type === 'password' ? 'text' : 'password';
    els.toggleKey.textContent = els.setApiKey.type === 'password' ? '보기' : '숨기기';
  });

  els.sendBtn.addEventListener('click', () => send());
  els.stopBtn.addEventListener('click', stop);

  els.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
  });
  els.input.addEventListener('input', autosize);

  els.messages.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.copy === 'msg') {
      const bubble = btn.closest('.msg').querySelector('.bubble');
      copyText(bubble.innerText);
    } else if (btn.dataset.copy === 'code') {
      const pre = btn.closest('.code-block').querySelector('pre');
      copyText(pre.innerText);
    } else if (btn.dataset.regen) {
      regenerate();
    }
  });

  function copyText(text) {
    const done = () => {
      const old = els.sendBtn.textContent;
      els.sendBtn.textContent = '✓';
      setTimeout(() => { els.sendBtn.textContent = old; }, 900);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  updateHeader();
  renderSidebar();
  renderMessages();

  if (providerDef().needsKey && !state.settings.apiKey) openSettings();
}
