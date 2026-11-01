# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-11-01
### Added
- Masking of keys, tokens, passwords, personal data (including Moroccan phones, RIB, IBAN, CIN and ICE) and IP addresses, with placeholders that stay the same for the same value.
- A vault that restores values in replies, including in streams where a placeholder arrives split.
- `secret-mask`: a CLI to mask text, `scan` files without printing values, and run a local proxy for LLM SDKs.
- A web page that works entirely in the browser, with a security policy that forbids it from sending anything.

### Security
- Every pattern is bounded, after profiling found 36 s on a hostile 200 KB input. The worst case is now under 20 ms, and a test enforces a limit.

## [0.1.0] - 2026-10-18
### Added
- Initial repository scaffold: README (with architecture, roadmap and an LLM-handoff section), LICENSE, .gitignore, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates, and wiki pages.
