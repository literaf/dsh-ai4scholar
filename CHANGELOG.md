# Changelog

All notable changes to `dsh-ai4scholar` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/) (0.x: minor bumps may change tool schemas).

## [Unreleased]

### Added
- An AI4Scholar sidebar workbench with a search start page, source-specific filters, paginated results, and a paper/detail split view. It reuses the existing search tools and shared API key/settings; the Settings and plugin-detail entrances remain available.
- Direct searches for Semantic Scholar, full-text excerpts, Google Scholar, PubMed, patents, Chinese literature, and preprints. Search results and recent queries stay in memory during the session; previously loaded pages do not trigger another paid request.
- An authenticated owner-only workbench API. Hosts without this channel retain their existing tools and settings.

### Changed
- Refined the workbench using the website's search layouts: a compact search toolbar, staged filter and history popovers, denser result rows, independently scrolling panes, and resizable/collapsible paper details. Narrow windows use a result-to-detail flow that preserves the list position.

### Fixed
- Wait for shared search defaults to refresh when returning from Settings, so an immediate search cannot use the old result count.
- Corrected the workbench sidebar name to `Ai4Scholar` and replaced the generic search icon with the bundled brand logo.

### Documentation
- Added a repository release policy and agent instructions covering version bumps, prerelease packages, release notes, and publication verification. Linked the policy from both READMEs and included it in future packages.

## [0.5.2] - 2026-11-08

### Changed
- The `/ai4s-author` default example and documentation examples now use Semantic Scholar and confirm author identity before retrieving a profile or publications. No separate Google Scholar author command is added.

### Known limitations
- Google Scholar author search may return no candidates. Use `/ai4s-author` with its default Semantic Scholar source; no dedicated Google Scholar author slash command is provided.

## [0.5.1] - 2026-11-08

### Fixed
- Convert plain arXiv keywords to explicit `all:` terms joined with `AND`, while preserving quoted phrases and native advanced queries. Date filters now wrap the normalized query. Real multi-word searches previously returned an overly broad result set.

## [0.5.0] - 2026-11-08

### Added
- Seven direct commands: `/ai4s-snippets`, `/ai4s-references`, `/ai4s-citations`, `/ai4s-read`, `/ai4s-pdf`, `/ai4s-related`, and `/ai4s-export`. The menu now has 20 research entries in five rows on wide screens, plus the account-status command; the 43 underlying tools are unchanged.
- Primary-capability checks hide an operation when only its lookup helpers are enabled. Execution guards distinguish snippets from ordinary search, outgoing references from incoming citations, full-text reading from PDF links, and export from prose citation insertion.

### Changed
- Paper result buttons now prepare the specific operation command with the selected paper's exact identifiers. Existing saved `/ai4s-paper` prompts remain supported; PDF URLs still open directly and drafts are never sent automatically.

### Fixed
- Snippet results expose a graph-ready `CorpusId:` identifier in both structured output and model-visible text, preventing follow-up graph queries from confusing numeric corpus IDs with paper IDs.

## [0.4.5] - 2026-11-08

### Changed
- Command help uses four columns on wide conversation panels, two on medium panels, and one on narrow panels, reducing the expanded menu from seven rows to four on desktop.

## [0.4.4] - 2026-11-08

### Changed
- Aligned logo, brand, balance, spending, and key status on a shared center line with consistent header line heights.
- Command help now uses two columns, with each command name above its purpose. Narrow cards switch to one column.

## [0.4.3] - 2026-11-08

### Changed
- Combined account branding, balance, spending, and key status into one desktop row. Added the existing Ai4 logo and corrected visible client branding to “Ai4Scholar”; narrower cards wrap the account metrics below the brand.

## [0.4.2] - 2026-11-08

### Changed
- Account status now follows the conversation width, with smaller balance typography, inline spending metrics, and a single compact utility row. Reduced spacing and surface contrast; narrow containers wrap without truncating values or hiding help.

## [0.4.1] - 2026-11-08

### Changed
- Compact account card with a prominent balance, session/key spending, readable search defaults, and collapsed command help. Removed obsolete membership and duplicate permanent-credit display; legacy API fields remain compatible.

### Fixed
- Billed empty Google Scholar author responses now update the session ledger before reporting the missing profile. Disabling credit display no longer disables session accounting.

## [0.4.0] - 2026-11-08

### Added
- Four native tools: Google Patents search, Google Scholar author search, author profiles/articles, and reference-format exports. Default tool count is now 43. Patents have an independent `googlePatents` feature toggle and remain outside unified paper search.
- Fourteen main slash commands: `/ai4s` for status/help and thirteen `/ai4s-*` research entries. Users describe criteria in natural language; research commands queue a normal model turn, retain attachments for drawing, and preserve tool results for follow-ups. Empty commands show examples without searching. Disabled capabilities are absent from discovery; `/ai4scholar` remains compatible.
- Source checks at tool execution for source-specific commands, activated only when the queued request enters a model step and released for ordinary follow-ups or idle agents. Invocation IDs prevent duplicate queueing.
- Replayable paper, author and patent result cards on current Harness, with applicable actions, exact identifiers and credit totals. Follow-up buttons fill an editable composer draft without overwriting existing text; PDF/source links open directly. Older hosts retain readable standard results.
- `/ai4s` and `/ai4scholar` report default search sources, per-source counts and available command help alongside key status and credits.

### Changed
- Google Scholar retains native paper, cited-by and version IDs as strings and supports review/language/date-sort/cites/cluster filters. Author profiles keep their source-specific identity and available article list; missing metrics and identifiers are not invented.
- Guides and plugin-page examples use natural-language requests after the slash command. Citation formats for a known paper are distinct from adding references to prose.

### Fixed
- Semantic Scholar bulk search now returns the unshown rows of the current API page before advancing upstream. Conversation/query-scoped cursors expire after 15 minutes, can be replayed without a new charge, and are included in the model-facing result. The cache is bounded and is not a persistent paper library.

## [0.3.10] - 2026-11-07

### Added
- Saved-key row with a show/hide control and right-aligned configuration status. Explicit reveal uses the host’s authenticated owner-only channel, disables caching, and clears the displayed value on hide, window blur, page exit, or credential updates.
- `search_chinese` for Chinese-language journal articles, theses, and conference papers: metadata and available abstracts, year/type filters, sorting, and offset pagination (up to 100 records per request). The public source is `chinese`, also available in `search_papers` and the settings page, unchecked by default. Optional `chinese_query` lets a combined search use Chinese keywords alongside the main query. Result cursors are preserved per source.
- Persistent API-key configuration status beneath the input, including an explicit unsaved-key state. Pagination and per-request billing are now explained for every source.
- Settings on the plugin page, below the API key. **Search**: the platforms `search_papers` queries by default (any mix of Semantic Scholar, PubMed, arXiv, Google Scholar, and Chinese literature) and a result count for each, up to what that platform serves per search (Semantic Scholar, PubMed, arXiv, Chinese literature 100; Google Scholar 10 — one billed page per call). **Results**: abstract length, full-text slice length, and the credit line. **Citations and figures**: `auto_cite` reference style and whether to leave out preprints, `sci_draw` model and resolution. Saving writes them into the profile's `cordis.patch.yml` through the Host's configuration forms (DeepSeek Harness 0.2.1 and later), and the plugin reloads so tool descriptions and the prompt quote the new values. **Restore defaults** removes the overrides. On older hosts the section explains which file to edit.
- Config fields `searchSources`, `resultsPerSource`, `citeStyle`, `citeExcludePreprints`, `drawModel`, and `drawImageSize`; `readMaxChars` is now editable on the page too. A per-platform count is also that platform's default for its own search tool (`search_semantic`, `search_pubmed`, `search_arxiv`, `search_google_scholar`). The model can still pass its own values for one call.
- `searchSources` (default `[semantic-scholar]`). With several platforms selected, the `search_papers` description and the prompt guidance tell the model to search them together instead of steering it back to one.

- Localized package title and description (`locale/en.json`, `locale/zh.json`), so the plugin list and the plugin page show Chinese text in the Chinese UI.

### Changed
- Clarified the API-key heading and the Ai4Scholar link, with a short invitation to claim 100 credits on the official site.
- Simplified settings copy: one persistent key status, compact pricing notes, and expandable search details for pagination and billing. Removed repeated helper text across the settings page.
- `search_google_scholar` now returns one page of up to 10 results per call (one credit) and reports `nextOffset`; it takes an `offset` parameter so the model pages for more on request, rather than the tool fanning out across pages on its own. This makes its per-call cap consistent with the other platforms (each "max N" is what one billed request returns). A 503 `UPSTREAM_UNAVAILABLE` response (not billed) carries a warning: it can mean an empty page or a temporary upstream outage. Configured counts and explicit `max_results` both apply to the request; pagination keeps that page size and rejects misaligned offsets. `PLATFORM_CAP['google-scholar']` is now 10.
- Redesigned the plugin page to match the host's own settings pages: an API key group (persistent status, one row with the input and its buttons, the balance below) and a search group (platform tiles with their cost, number fields with units, a switch for the credit line), each in one bordered panel.
- `maxResultsCap` now defaults to 100, so Semantic Scholar, PubMed, and arXiv searches can return up to 100 results per call; each platform still applies its own maximum.
- `defaultMaxResults`, `abstractMaxChars`, and `readMaxChars` must now be whole numbers; the schema rejects fractions.

### Fixed
- Chinese document identifiers participate in de-duplication. Short Chinese titles require matching year and first author; title matches cannot merge conflicting DOIs. Records without public links render without fabricated article URLs.
- Preserve untouched per-platform counts when another settings surface updates them while a draft is open.
- DOI downloads and full-text reads try the publisher's `citation_pdf_url` metadata before URL templates, including relative links and directory-shaped Copernicus article pages (issue #1). Failures distinguish missing PDF links from failed requests and include the attempted URLs and HTTP statuses.
- Keep client slot/store types and JSON metadata compatible with Harness 0.2.2 while retaining the older host UI. Update the credentials contract probe and runtime smoke composition for its generated endpoints and separate native executor.

## [0.3.9] - 2026-11-04

### Changed
- `search_papers` now searches only Semantic Scholar by default, avoiding an automatic PubMed charge on every topic search. Explicit `sources` still supports single-platform selection and cross-platform merging; when Semantic Scholar is disabled, the default remains one enabled platform.
- Tool descriptions and model guidance now favor one relevant source, suggest PubMed alone for biomedical or clinical topics, and reserve multiple sources for explicit coverage requests or insufficient results. Guidance also avoids repeating a query on platforms already searched.

## [0.3.8] - 2026-10-21

### Fixed
- Restore API-key configuration after newer Harness versions removed `settings.plugin.item`: opening Plugins → Installed → dsh-ai4scholar now shows the key form directly, with an additional Settings → AI4Scholar entrance. The old card remains available on older hosts; every entrance shares the existing credentials controller and store.
- Skip the legacy settings namespace registration on hosts that no longer expose `settings.register`, so the plugin still loads.

### Added
- A configure entry for the bundle’s `ai4scholar` row, including key status, save/remove, and balance checks.

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
