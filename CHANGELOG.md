# Changelog

All notable changes to `dsh-ai4scholar` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (0.x: minor bumps may change tool schemas).

## [0.2.0] - 2026-08-16

### Added
- OpenClaw parity — 37 tools: full Semantic Scholar family (bulk search, citations/references, authors, recommendations, batch, open-access download/read), PubMed batch/citations/related, arXiv, bioRxiv/medRxiv, DOI download/read (publisher PDF patterns incl. PLOS, Frontiers, Springer/Nature, Wiley, Elsevier, IEEE, ACM, ACS, RSC, MDPI, arXiv, bioRxiv), `auto_cite` (SSE), `sci_draw`, `get_ai4scholar_credits`.
- Full-text tools return PDF text in slices (`offset` / `max_chars`, default 60,000 characters) via in-process `pdf-parse`.
- Credits: every billed result carries `credits` (charged, remaining, session total) from the API's `X-Credits-*` headers; the model-facing text ends with a credit line; billed tool cards show the charge in their title; the prompt asks the model to close billed turns with a one-line credit note.
- `/ai4scholar` slash command with its own balance card in the chat (keyed `conversation.chat.commandview` renderer).
- Settings card tests the key after saving and on demand through the plugin's host route `GET /ai4scholar/balance` (the browser never sees the key).
- Family toggles (`arxiv`, `biorxiv`, `doi`, `fullText`, `autoCite`, `sciDraw`, `creditsTool`, `command`, `balanceRoute`, `showCredits`) and timeouts (`pdfTimeoutMs`, `generationTimeoutMs`, `readMaxChars`).

### Changed
- `get_semantic_paper_detail` / `get_pubmed_paper_detail` now return `{ paper, credits? }` instead of the bare paper.
- Paper records gained optional `categories` and `extra` (citation contexts/intents on graph results).

## [0.1.0] - 2026-08-16

### Added
- First release: `search_semantic`, `search_semantic_snippets`, `search_semantic_paper_match`, `get_semantic_paper_detail`, `search_pubmed`, `get_pubmed_paper_detail`, `search_google_scholar` as native dsh tools with a shared normalized paper record, Web UI citation cards, system-prompt guidance, per-call credential resolution through `ctx.credentials`, and a Settings → Plugins card that stores the API key.
