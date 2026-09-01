# Changelog

All notable changes to `dsh-ai4scholar` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (0.x: minor bumps may change tool schemas).

## [Unreleased]

## [0.3.6] - 2026-09-01

### Fixed
- Reloading the plugin without restarting the host crashed it with `webserver: duplicate exact route "/ai4scholar/balance"`. The web server owns one route table and rejects a duplicate `(kind, path)`; `register()` hands back the disposer that removes the route, and that disposer was discarded. So a hot remount — dshmarket toggling the plugin, a settings change — built the new fiber while the dead one's route was still registered, and the new fiber died on arrival. The disposer now belongs to the fiber, so the route leaves with it.

## [0.3.5] - 2026-09-01

### Fixed
- Saving the API key in DSH Desktop still failed after 0.3.4, now with `保存失败: cannot get property "remote.credentials" without inject`. The alpha credentials service is present on that host; cordis simply refuses the read. `remote` is a cordis `Service` that registers its sub-domains as *flat* store entries under dotted names, so `ctx.remote.credentials` is not an ordinary property access — the traceable proxy rewrites it into a guarded `Reflect.get(ctx, "remote.credentials")`, which throws unless that exact name is in `inject`. The card now resolves the service with `ctx.get('remote.credentials')`, which reads the same store without the inject requirement and returns `undefined` (rather than throwing) on hosts that lack it. Declaring the dotted name in `inject` was rejected as the fix: cordis 4.0.x has no optional inject, so it would withhold `apply()` on every host without the service and the card would vanish silently instead of erroring.

### Changed
- The credentials adapter takes the alpha face already resolved (`remoteCredentials`) instead of taking `ctx.remote` and dotting into it, so no code path can reach the guard. The host-contract and bundle tests now exercise a real cordis `Context` and a `remote` that throws the guard message the way the desktop does; the previous plain-object fakes had no proxy, which is why 0.3.4 passed 85 tests and still broke every save. Reintroducing the dotted read now fails four tests.

## [0.3.4] - 2026-09-01

### Fixed
- Saving the API key in DSH Desktop failed with `保存失败: Cannot read properties of undefined (reading 'credentials')`, and the card reported `未配置` even with a key stored. DSH Desktop 2.0.4 bundles Harness 0.1.2-alpha.1, which removed `ConnectionHandle.api` and moved the credentials domain to `ctx.remote.credentials` — with positional arguments, a bare `{ok, value}` envelope, and `credentials/reference-updated` in place of `credentials/updated`. The card now resolves whichever face the host exposes, per call, so it works on both the hosted web app (≤0.1.1-rc.2, where `connection.api` still exists) and the desktop build. A host with neither face now says so on the card instead of raising a bare `TypeError`.

### Changed
- Built and tested against Harness 0.1.1-rc.2 (was 0.1.0-rc.6). `settings.plugin.item` is a keyed slot on that line, so `key` is now the declared field and the list pair (`id`/`order`) is the one passed through untyped — the registration sends the same fields as before, unchanged at runtime. `peerDependencies` still admit `>=0.1.0-rc.6`: rc.6 hosts remain supported, and the credentials adapter covers every line from rc.6 through 0.1.2-alpha.
- `@deepseek-ai/dsh-client-web-react` dropped from devDependencies. Nothing imports it, its own releases stop at 0.1.0-rc.7, and mixing that line with 0.1.1-rc.2 makes pnpm merge two prerelease peer ranges into `>=0.1.1 <0.2.0-0`, which no published version satisfies. It remains in the bundler's external module table, where no install is needed.

## [0.3.3] - 2026-08-18

### Fixed
- On DeepSeek Harness 0.1.0-rc.7 the web client failed to load with `keyed slot "settings.plugin.item" requires options.key`: rc.7 redeclared that slot keyed by settings namespace where earlier releases declared it as a list. The card now registers with both identity fields (`id` for ≤rc.6, `key` for rc.7), and the host half registers an `ai4scholar` settings namespace so rc.7's namespace-paired tab still dispatches the card. The API key continues to live in the credential store only.

## [0.3.2] - 2026-08-18

### Fixed
- Title de-duplication in `search_papers` now normalizes Unicode (NFKC, any script's letters and digits, sliced by code point). Previously Russian and Greek titles produced no title key at all — they could only ever dedup by DOI — accents were stripped from French and German titles, and the same paper arriving composed from one platform and decomposed from another was listed twice.

### Changed
- Prompt guidance and the `search_papers` description now state the exclusion outright: for a plain topic search, `search_papers` is the only search call — re-running the same query through a per-platform search tool repeats the charge; extra platforms belong in `sources` on the same call. Observed in a real session: `search_papers` (Semantic Scholar + PubMed) plus a parallel `search_semantic` with the same query billed Semantic Scholar twice for the same papers.
- `postpublish` triggers and waits for the npmmirror sync, so installs from the default registry in China see a release within a minute.
- README: complete quick start (Node, pnpm, dsh, plugin, keys) at the top of Install.

## [0.3.1] - 2026-08-16

### Changed
- The repository is now `literaf/dsh-ai4scholar`, matching the npm package name; every link and image URL points at the new name rather than relying on GitHub's rename redirect.

## [0.3.0] - 2026-08-16

### Added
- `search_papers`: one query across several platforms (default Semantic Scholar + PubMed; `sources` may add arXiv and Google Scholar), merged and de-duplicated by DOI / arXiv id / PMID / normalized title; papers found on more than one platform rank first, then each platform's own relevance rank, then citations. Per-platform counts and failures are reported; credits are summed. Config `unifiedSearch`.
- Screenshots in the README.

### Fixed
- Semantic Scholar year filters with an open end (`2022-`, `-2015`) were rejected by the validator.
- Citation/reference/author-paper lists no longer invent a total from the platform's `next` cursor; they report the returned count and a continuation offset.
- PubMed titles, abstracts, and journal names decode HTML entities (`&#x3b2;` → `β`).

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
