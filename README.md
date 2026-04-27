# Pluto Text

Pluto Text is a Chrome Manifest V3 browser extension for manual long-form draft generation in browser text fields. The current implementation remains explicit-action only: no suggestion-on-focus, no floating UI, and no automatic generation or insertion behavior.

https://youtu.be/FogDwwy2Usg

[![Plulto CLI Demo](https://github.com/user-attachments/assets/21fc3afa-c05f-43da-966c-c70105ab188a)](https://youtu.be/FogDwwy2Usg)


## Tech stack

- TypeScript with strict mode
- React for popup and options
- Zod for schemas and message validation
- Background service worker for orchestration
- Content script for focused-element inspection

## Project structure

```text
public/
  manifest.json
src/
  background/
  content/
  detection/
  mock-api/
  messaging/
  options/
  popup/
  shared/
build.mjs
package.json
tsconfig.json
```

## Run the extension

1. Install dependencies:

```bash
npm install
```

2. Build the extension:

```bash
npm run build
```

3. Load the extension in Chrome:

- Open `chrome://extensions`
- Enable Developer mode
- Click `Load unpacked`
- Select `/Users/pardhuvarma/Documents/Pluto Text/dist`

## Daily dev loop

1. Start the local API:

```bash
npm run mock-api
```

2. Build the extension after code changes:

```bash
npm run build
```

3. In `chrome://extensions`:

- Click the refresh button on the Pluto Text extension
- Refresh the browser tab you are testing

Notes:

- You only need `Load unpacked` the first time, unless Chrome forgets the extension location.
- You only need to restart `npm run mock-api` when the local API code or `.env` values change, or if that process stopped.
- If you want automatic rebuilds while editing, use `npm run dev`, then still refresh the extension in Chrome after rebuild output changes.

## Package the extension

Create a zip for manual distribution or private beta sharing:

```bash
npm run package-extension
```

This writes `artifacts/pluto-text-extension.zip`. Run `npm run build` first.

## Configure the local model endpoint

The local API server keeps the same `POST /generate` contract used by the extension, but it now
routes requests to a real local model provider.

Supported provider today:

- Ollama-compatible local endpoint

Environment variables:

- `OLLAMA_BASE_URL`
  Default: `http://127.0.0.1:11434`
- `OLLAMA_MODEL`
  Default: `minimax-m2.7:cloud`
- `OLLAMA_TEMPERATURE`
  Default: `0.3`
- `OLLAMA_TIMEOUT_MS`
  Default: `45000`
- `OPENAI_API_KEY`
  Optional: enables OpenAI fallback from the local API server
- `OPENAI_BASE_URL`
  Default: `https://api.openai.com/v1`
- `OPENAI_MODEL`
  Default: `gpt-4.1-mini`
- `OPENAI_TIMEOUT_MS`
  Default: `30000`
- `LOCAL_API_TRACE`
  Optional: set to `1` or `true` to print local API request/provider trace lines to the server console

You can create your local env file at `/Users/pardhuvarma/Documents/Pluto Text/.env` based on [`.env.example`](/Users/pardhuvarma/Documents/Pluto%20Text/.env.example).
The repo `.gitignore` excludes `.env`, `dist`, `artifacts`, and `node_modules`.

## Run the local API

Start the local API server in a separate terminal:

```bash
npm run mock-api
```

It listens by default at [http://127.0.0.1:8787](http://127.0.0.1:8787), which matches the extension default `localApiBaseUrl`.
The script name remains `mock-api` for compatibility, but it now runs the real local-model-backed API server.

## Run with Ollama

1. Install and start Ollama.
2. Pull a model, for example:

```bash
ollama pull minimax-m2.7:cloud
```

3. Start the local API with the model you want:

```bash
OLLAMA_MODEL=minimax-m2.7:cloud npm run mock-api
```

4. Keep the extension setting `localApiBaseUrl` pointed at `http://127.0.0.1:8787`.

## Run with OpenAI fallback

1. Copy [`.env.example`](/Users/pardhuvarma/Documents/Pluto%20Text/.env.example) to `/Users/pardhuvarma/Documents/Pluto Text/.env`.
2. Set `OPENAI_API_KEY` in that file.
3. Optionally change `OPENAI_MODEL` if you want a different OpenAI model.
4. Start the local API with:

```bash
npm run mock-api
```

When `OPENAI_API_KEY` is present, the local API can fall back to OpenAI after a local-model failure or timeout while preserving the same extension-facing `/generate` contract.

## Development

Build once:

```bash
npm run build
```

Watch rebuilds while editing:

```bash
npm run dev
```

Type-check:

```bash
npm run typecheck
```

## How focused-field inspection, generation, rewriting, and insertion work

1. Focus a supported editor on a web page.
2. Click the Pluto Text extension action.
3. Click `Check focused field`.
4. The background service worker messages the active tab.
5. The content script resolves `document.activeElement`, including nested editable roots when possible.
6. The detector scores the focused element as a long-form drafting candidate or non-candidate.
7. For supported targets, the extractor gathers a small, trimmed slice of page, field, nearby, and reply-specific context such as Gmail and support thread details.
8. The background script resolves effective site settings and heuristic task classification for the current hostname.
9. When you click `Generate draft`, the background script builds a validated payload and sends it to the local API.
10. You can optionally add your own answer/notes in the popup before generation, and Pluto Text will use that text as the seed for the initial reply draft.
11. When you click a rewrite action such as `Shorter` or `Friendlier`, the popup can send either the current generated draft or the currently focused field text to the same local API.
12. The popup keeps the current draft plus one previous draft version in memory for the current popup session.
13. On Gmail, the popup also exposes quick actions such as `Draft reply` and `Short professional reply`, which map to Gmail-specific task instructions in the payload.
14. The popup shows the returned metadata, effective settings summary, generated drafts, and optional raw JSON payload.
15. When you click `Insert`, `Replace`, or `Append`, the popup sends an insertion command to the background script, which relays it to the content script for the currently focused field.
16. `Copy` writes the primary generated draft to the clipboard from the popup.
17. In generic support tools, Pluto Text can classify `support_reply` and extract visible issue summary, request details, status text, and nearby conversation context to improve first drafts.
18. On long visible Gmail and support reply threads, Pluto Text now prioritizes richer recent thread turns and request details before falling back to generic “missing context” drafts.

## Manual testing

1. Run `npm install`.
2. Run `npm run build`.
3. Run `npm run mock-api` in a separate terminal.
4. Open `chrome://extensions`.
5. Enable Developer mode.
6. Click `Load unpacked` and select `/Users/pardhuvarma/Documents/Pluto Text/dist`.
7. Open the extension options page and confirm you can edit:
   - `enabled`
   - `defaultTone`
   - `defaultLength`
   - `includeGreeting`
   - `includeSignoff`
   - `signoffText`
   - `routingMode`
   - `localApiBaseUrl`
   - `cloudFallbackEnabled`
   - `debugMode`
   - `siteOverrides` JSON keyed by hostname
8. Save settings, reload the page if needed, and confirm they persist.
9. Make sure `localApiBaseUrl` points to `http://127.0.0.1:8787`.
10. Add a site override such as `mail.google.com` or another hostname you can test, then save again.
11. Open a page with each of these focused-field cases:

- A large `textarea`
- A large `input[type="text"]`
- A rich editor backed by `contenteditable`
- A form with visible labels, help text, or validation text near the field
- A password, search, email, tel, or OTP-like field
- A tiny single-line field
- A readonly or disabled field
- Gmail compose or reply on `mail.google.com` if available

12. Open the Pluto Text popup and click `Check focused field`.
13. Confirm the popup shows:

- Whether the extension is enabled for the current site
- The current site hostname
- Effective tone and length for that hostname
- `Supported` or `Unsupported`
- `score`
- `fieldTypeGuess`
- Heuristic task classification including `intent`, `tone`, `length`, and `instructions`
- `reasonCodes`
- Field summary details such as label, placeholder, current text, page title, URL, and headings
- Nearby context such as container text, text before/after, and help or error text when present
- Gmail-only fields for subject, recipients, thread text, and compose mode when testing on Gmail

14. Click `Generate draft`.
15. Optionally enter text in the popup `Your answer` field before generation and confirm the generated draft uses that answer as the basis for the reply.
16. Confirm the popup shows:

- A primary draft
- One or more alternative drafts
- Any warnings returned by the local API

17. Use the rewrite source toggle and confirm both sources work when available:

- `Use current draft`
- `Use focused field text`

18. Click each rewrite action and confirm the local API returns visibly different output:

- `Shorter` produces a noticeably shorter version
- `More professional` produces more formal wording
- `Friendlier` produces warmer wording
- `Expand` produces a longer version

19. If you transformed an existing draft, click `Back to previous draft` and confirm the prior version is restored for the session.
20. With the same supported field still focused, click each draft action and confirm:

- `Insert` places the draft at the caret when possible, otherwise at the end
- `Replace` replaces the current field contents
- `Append` appends the draft with sensible spacing
- `Copy` places the primary draft on the clipboard

21. Repeat insertion tests for:

- A `textarea`
- A supported large text input if applicable
- A `contenteditable` editor

22. Confirm newline formatting is preserved in `textarea` and `contenteditable` targets.
23. Confirm rewrite actions do not use the popup `Your answer` field as a rewrite source; they should still use only the current draft or focused field text.
24. Change focus to an unsupported or different field after generation, then try inserting and confirm the popup shows a friendly error instead of inserting.
25. Confirm no insertion action submits a form, clicks a send button, or triggers message sending.
26. Confirm unsupported, disabled, or non-candidate fields produce a clear error instead of a draft.
27. Stop the local API and confirm `Generate draft` or rewrite actions show a connection or timeout error.
28. Confirm the raw JSON toggle reveals the full local inspection payload, including effective settings, task classification, generation output, and the temporary draft input when present.
29. Turn on `debugMode` in options and confirm the popup now shows:

- Extracted context summary
- Detected task summary
- Effective settings summary
- Recent error details after failed actions

30. Open a restricted or unsupported page/tab scenario and confirm friendly handling for:

- No focused field
- Unsupported field
- Active tab unavailable
- Content script not ready
- Local API unavailable
- Malformed API response
- Focus changed before insertion

31. Run `npm test` to verify the detector, text utility, insertion, settings, request/response validation, task-classification, prompt-builder, and local-generation coverage.

## How To Test Gmail Manually

1. Start the local API with `npm run mock-api`.
2. Open Gmail in Chrome and begin either:
   - A new compose window
   - An inline reply in an existing thread
3. Focus the Gmail message editor before opening the Pluto Text popup.
4. Click `Check focused field` and confirm:
   - Gmail context appears in the popup
   - `subject`, `recipients`, and nearby thread text are populated when visible
   - `composeModeGuess` looks correct for reply vs new message
   - Task classification defaults to `email_reply` when appropriate
5. Use the Gmail quick actions and confirm each produces a plausible variation:
   - `Draft reply`
   - `Short professional reply`
   - `Friendly reply`
   - `Follow-up style draft`
6. Use `Replace` and `Append` in the Gmail editor and confirm:
   - Line breaks are preserved
   - The editor content changes, but Gmail does not send anything
   - No send button is clicked and no message is submitted
7. Change focus away from the Gmail editor and confirm insertion actions fail safely with a friendly message.
8. Add rough reply notes in the popup `Your answer` field and confirm Gmail draft generation turns them into a polished reply.
9. In a long visible Gmail thread, confirm the popup raw/debug output shows richer recent thread turns and request details rather than only a short thread snippet.

## How To Test Support Replies Manually

1. Open a support-style page with a visible reply editor and nearby ticket or conversation context.
2. Focus the reply editor and click `Check focused field`.
3. Confirm the popup detects `support_reply` when the page shows ticket, issue, case, or customer-request cues.
4. Confirm the popup shows support context when available:
   - `Issue summary`
   - `Request details`
   - `Conversation text`
   - `Recent conversation turns`
   - `Status`
5. Click `Generate draft` and confirm the result:
   - acknowledges the issue
   - briefly reflects the visible request
   - proposes next steps in an action-oriented way
6. Use rewrite actions on the support draft and confirm they still transform the generated text rather than switching to an unrelated draft.
7. Use `Insert`, `Replace`, or `Append` and confirm the reply is added to the support editor without submission behavior.
8. In a long visible support thread, confirm the generated draft is more specific and less likely to say the full request details are missing when those details are visibly present.

## Troubleshooting

- `The local draft API is unavailable`
  Start the local API with `npm run mock-api` and confirm `localApiBaseUrl` is `http://127.0.0.1:8787`.
- `The ollama request failed`
  Make sure Ollama is running locally and `OLLAMA_BASE_URL` points to the correct host and port.
- `The OpenAI endpoint returned an error`
  Confirm `OPENAI_API_KEY` is set in `/Users/pardhuvarma/Documents/Pluto Text/.env` and that the selected `OPENAI_MODEL` is available for your account.
- `The Ollama endpoint returned an empty response`
  Confirm the selected model exists and can answer prompts directly in Ollama.
- `The local model did not return valid JSON`
  Try a more capable instruction-following model or reduce custom model settings.
- `Draft generation took longer than expected`
  Use a smaller/faster local model, increase `OLLAMA_TIMEOUT_MS` or `OPENAI_TIMEOUT_MS`, or enable the env-based OpenAI fallback.
- `I want to inspect what the local API is doing`
  Start the server with `LOCAL_API_TRACE=1 npm run mock-api` to log request acceptance, provider timing, and response summary details.
