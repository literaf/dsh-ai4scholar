# dsh-ai4scholar 0.6.6 verification

Date: 2026-11-16

Seedream 5.5 (`seedream55`) is exposed by the tool schema, plugin configuration and English/Chinese settings. Settings and inherited defaults support 1K/2K; switching from 4K chooses 2K. Explicit unsupported resolution, quality, thinking level and more than ten references fail before an API request. SVG/vectorize keep their existing processing paths.

## Local validation

- `DSH_COMPAT_ROOT=/private/tmp/dsh-ui pnpm run prepublishOnly`: passed type checking, clean build and all 23 test files; 226 tests passed, 2 skipped.
- The two skipped cases require credentials packages at the optional `/Applications/DSH Desktop.app` path, which was not present. Published Harness UI 0.2.2-rc.1 compatibility tests ran and passed; the npm `latest` Harness version was checked on the same date.
- New tests exercise tool discovery, generation/edit/style/compose payloads with mocked responses, credit/result rendering, ten-reference boundary, invalid options without requests, configured/default resolution conversion, rendered settings and saving model/resolution together.
- `pnpm pack --pack-destination /private/tmp`: produced `dsh-ai4scholar-0.6.6.tgz`. Its extracted plugin registered with the real Cordis/ToolRuntime services; a packaged Seedream tool made the expected mocked request and rejected explicit 4K without another request.
- Package SHA-512 (base64): `SiDDk2vv6WhRq2Alg/5qPM3nimygslUyyZfa4uClfz4bgGkVh8DJIQC69s0N0d0l//pqs2LynLM7zBxj/YyQug==`.
- `git diff --check`: passed.

## Limits

No new paid image-generation request was made. Tests establish plugin wiring and parameter handling, not upstream model availability or every generated image's quality. Reference images must already be accessible HTTP(S) URLs or valid image data URIs; local-file uploading is outside this change.

The GitHub Release records the final commit, remote CI result and publication checks after completion.
