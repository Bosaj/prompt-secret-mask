# Prompt Secret Mask

> Detect API keys, tokens and IPs in prompts, replace them with placeholders, and restore them safely outside the model.

**Status:** pre-alpha scaffold (no code yet). **Feasibility rating:** 3/10 as a new idea — a competitive field; correctness and honesty about limits matter most.
**Idea:** #14 in the owner's ideas backlog. **Author:** Oussama Elhadji (`@Bosaj`) <oussousselhadji@gmail.com>.

---

## Problem

Developers paste keys, tokens, IPs and personal data into AI chats and agents. Once sent, the provider has them.

## Why build it (gap analysis)

Masking with *** makes the value unusable by the model. The safer design uses stable placeholders (`{{SECRET_1}}`), keeps the real values in a local vault, and substitutes them back only in tool calls or output on the user side. The model never sees the secret and cannot "use" it — the tool must say so honestly.

## Prior art & open bases to fork

- [SaiTeja-Erukude/promptsanitizer](https://github.com/SaiTeja-Erukude/promptsanitizer) — Prompt sanitization library.
- [microsoft/presidio](https://github.com/microsoft/presidio) — PII detection and anonymization.
- [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) — Secret-detection rules to reuse.
- [trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog) — Secret detectors with verification.

## Proposed architecture

1. Detector: gitleaks-style regex rules + entropy + Presidio for PII.
2. Vault: placeholder to value map, local only, cleared per session.
3. Proxy: local HTTP proxy or SDK wrapper that masks outgoing prompts and restores placeholders in tool-call arguments.
4. UI: browser extension that highlights secrets before you press send.

## Tech stack (proposed)

- TypeScript core library
- Local proxy (Node)
- Browser extension (Manifest V3)

## Roadmap

- v0.1 — Detector library with a labelled test corpus.
- v0.2 — Placeholder vault + restore in tool calls.
- v0.3 — Local proxy for OpenAI/Anthropic-compatible APIs.
- v0.4 — Browser extension for chat UIs.

---

## For LLM agents & contributors continuing this project

This repo is a **scaffold**: README + standard files, no implementation yet. If you are an AI agent asked to "continue developing", read this section first.

- Measure false negatives on a labelled corpus before any claim of safety.
- Never log real values; tests must use synthetic keys.

**Ground rules:** keep this README in sync with reality as you build; prefer forking/reusing the bases above over greenfield code; write tests for anything correctness-critical; never commit secrets (see `.gitignore`); follow Conventional Commits (see `CONTRIBUTING.md`).

## Getting started

```bash
# nothing to run yet — this is a scaffold.
```

## 📄 License
**Proprietary & Commercial Software License** — All Rights Reserved © 2026 Oussama Elhadji (`@Bosaj`) <[oussousselhadji@gmail.com](mailto:oussousselhadji@gmail.com)>.

Unauthorized copying, distribution, resale, or reverse engineering is strictly prohibited. See [LICENSE](LICENSE) for full legal terms.
