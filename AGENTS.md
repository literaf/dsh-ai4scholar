# Repository instructions

- Read and follow [RELEASING.md](RELEASING.md) when changing versions, preparing test packages, or publishing releases.
- Do not bump the release version for each routine code, copy, styling, or documentation edit. Record unreleased user-visible changes under `Unreleased` in `CHANGELOG.md`.
- Use prerelease versions such as `0.6.0-beta.1` for distinct test packages. Local installation is not an npm release; public prereleases must not update `latest`.
- Report test coverage accurately. Distinguish mocked checks from real API tests and preserve known limitations in release notes.

## Licensing

- Current AI4Scholar-authored releases use `AGPL-3.0-only`; commercial terms require a separate written agreement. Follow `LICENSING.md` and `COMMERCIAL-LICENSE.md`. Do not describe AGPL as prohibiting commercial use.
- Preserve earlier MIT grants, immutable historical releases, third-party copyright notices and per-asset provenance. Do not blanket-relicense third-party files.
- Keep package license metadata, bilingual README notices, Corresponding Source links and the npm legal-file allowlist consistent. Review dependency notices when runtime or bundled components change.
- A normal external pull request does not automatically grant commercial relicensing rights. Follow `CONTRIBUTING.md` before merging outside contributions.
