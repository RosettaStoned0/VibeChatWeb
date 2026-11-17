# ⚡ Vibe Chat

서버 없이, **API 키만 입력하면 바로 쓸 수 있는 AI 채팅 웹 앱**입니다.
모든 요청은 브라우저에서 선택한 제공자의 API로 직접 전송되고, API 키는 브라우저의 localStorage에만 저장됩니다.

## 실행 방법

별도 빌드/설치가 필요 없습니다. 정적 파일 3개뿐입니다.

```bash
cd ai-chat
python3 -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다.

(providers 대부분이 CORS를 허용하므로 `index.html`을 더블클릭해서 `file://`로 열어도동작합니다. Ollama 로컬 모델은 `http.server`로 실행을 권장합니다.)

## 사용 방법

1. 앱을 열면 설정 창이 자동으로 열립니다 (키가 없을 때).
2. 제공자를 고르고, 해당 제공자의 API 키를 붙여넣습니다.
3. 모델을 선택(또는 직접 입력)하고 **저장**.
4. **연결 테스트**로 키가 맞는지 바로 확인할 수 있습니다.
5. 입력창에 메시지를 입력하고 Enter — 끝.

## 📱 모바일에서 사용
- 설치 없이 휴대폰 브라우저(Safari / Chrome 등)에서 바로 열면 됩니다. 반응형 레이아웃이 적용됩니다.
- 모바일에서는 상단 ☰ 버튼으로 대화 목록 서랍을 열고 닫습니다.
- Safari/Chrome의 **홈 화면에 추가**를 하면 앱처럼 전체 화면으로 실행됩니다 (`manifest.webmanifest` + `icon.svg` 포함).
- API 키는 설정(⚙)에서 한 번만 입력하면 localStorage에 저장되어 계속 유지됩니다.

## 지원 제공자

| 제공자 | 엔드포인트 | 비고 |
|---|---|---|
| OpenAI | api.openai.com | gpt-4o, gpt-4.1, o3 등 |
| Anthropic | api.anthropic.com | 브라우저 직접 호출용 헤더 자동 포함 |
| Google Gemini | generativelanguage.googleapis.com | AI Studio 키 |
| OpenRouter | openrouter.ai | 여러 모델을 하나의 키로 |
| Groq | api.groq.com | 초고속 추론 |
| Mistral | api.mistral.ai | |
| DeepSeek | api.deepseek.com | |
| xAI (Grok) | api.x.ai | |
| Ollama | localhost:11434 | 로컬 모델, **API 키 불필요** |

설정의 **Base URL**을 바꾸면 프록시나 자체 호스팅 엔드포인트도 사용할 수 있습니다.

## 기능

- 실시간 SSE 스트리밍 답변, 생성 중지(■) 버튼
- 마크다운 렌더링 (코드 블록 복사 버튼 포함)
- 대화 목록 (localStorage에 저장, 새 대화/삭제, 제목 자동 생성)
- 시스템 프롬프트 설정
- 마지막 답변 다시 생성, 메시지/코드 복사
- 토큰 사용량 표시 (제공자가 usage를 줄 때)
- 다크 테마 UI, 한국어 인터페이스
- 🎨 React 캔버스: AI가 출력한 jsx/tsx 코드 블록의 "▶ 캔버스" 버튼으로 앱 안 샌드박스 iframe에서 실시간 렌더링 (default export 단일 컴포넌트, import 자동 제거)

## 보안

- **서버가 없습니다.** 코드는 `index.html` / `styles.css` / `app.js` 3개뿐이며어떤 데이터도 외부로 보내지 않습니다.
- API 키는 오직당신의 브라우저 localStorage에 저장되고, 선택한 제공자의 API 엔드포인트로만 HTTPS로 전송됩니다.
- 공용 PC를 쓴다면 설정의 **키 삭제**로 저장된 키를 지우세요.

## 테스트

```bash
node test/run-tests.cjs
```

제공자별 요청 생성, SSE/NDJSON 스트리밍 파싱(실제 로컬 서버 포함), 마크다운 렌더링을 검증합니다.

## 파일구성

```
ai-chat/
├── index.html      # 앱 셸
├── styles.css      # 스타일
├── app.js          # 로직 (제공자 어댑터 + 스트리밍 + UI)
├── test/run-tests.cjs
└── README.md
```
