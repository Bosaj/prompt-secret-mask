# 1. Architecture

1. Detector: gitleaks-style regex rules + entropy + Presidio for PII.
2. Vault: placeholder to value map, local only, cleared per session.
3. Proxy: local HTTP proxy or SDK wrapper that masks outgoing prompts and restores placeholders in tool-call arguments.
4. UI: browser extension that highlights secrets before you press send.

## Proposed stack
- TypeScript core library
- Local proxy (Node)
- Browser extension (Manifest V3)

## Open bases to fork
- [SaiTeja-Erukude/promptsanitizer](https://github.com/SaiTeja-Erukude/promptsanitizer) — Prompt sanitization library.
- [microsoft/presidio](https://github.com/microsoft/presidio) — PII detection and anonymization.
- [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) — Secret-detection rules to reuse.
- [trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog) — Secret detectors with verification.
