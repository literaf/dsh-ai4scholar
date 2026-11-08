# Repository instructions

- Read and follow [RELEASING.md](RELEASING.md) when changing versions, preparing test packages, or publishing releases.
- Do not bump the release version for each routine code, copy, styling, or documentation edit. Record unreleased user-visible changes under `Unreleased` in `CHANGELOG.md`.
- Use prerelease versions such as `0.6.0-beta.1` for distinct test packages. Local installation is not an npm release; public prereleases must not update `latest`.
- Report test coverage accurately. Distinguish mocked checks from real API tests and preserve known limitations in release notes.
