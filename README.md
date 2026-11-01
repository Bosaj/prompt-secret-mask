# Prompt Mask

> Keeps API keys, tokens and personal data out of AI prompts: replaces them with placeholders before they leave your machine, and puts them back in the reply. A web page, a CLI and a local proxy for LLM SDKs.

**Author:** Oussama Elhadji (`@Bosaj`) <oussousselhadji@gmail.com>.

<p align="center">
  <img src="docs/page.webp" alt="Prompt Mask: a prompt with a database URL, tokens and Moroccan personal data on the left, the same text with placeholders on the right, and the model's reply restored below" width="760" />
</p>

```text
GITHUB_TOKEN=ghp_…                 →  GITHUB_TOKEN=[[GITHUB_TOKEN_1]]
postgres://admin:pass@10.20.0.7/x  →  postgres://admin:[[URL_PASSWORD_1]]@[[IP_1]]/x
CIN: AB123456, +212 661 234 567    →  CIN: [[CIN_1]], [[PHONE_1]]
```

---

## Why

Developers paste keys, logs and customer data into AI chats and agents, and once sent, the provider has them. Secret scanners work on commits, after the fact. Most tools also know nothing about Moroccan data.

## Three ways to use it

**Web page:** paste, copy the safe text, paste the model's reply to restore it. Its security policy (`connect-src 'none'`) stops the page from sending anything anywhere, and a test checks this in a real browser.

**CLI:**

```bash
secret-mask prompt.txt
```

```bash
secret-mask scan logs/*.txt
```

`scan` prints `file:line category rule`, never the value, and exits 1 if anything is found, so it can guard a script.

**Local proxy for SDKs:** set the base URL and your code doesn't change.

```bash
secret-mask proxy
```

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8899 OPENAI_BASE_URL=http://127.0.0.1:8899/v1 node your-app.js
```

Requests are masked before they leave the machine, and replies are restored, including streamed ones where a placeholder arrives split across events. Your API key header passes through, since the provider needs it. It listens on loopback only, refuses other `Host` names, refuses a body it can't inspect rather than forwarding it, and never logs a value.

## What it finds

| Kind | Examples | How it avoids false alarms |
|---|---|---|
| **Keys with a known shape** | GitHub, GitLab, Anthropic, OpenAI, AWS, Stripe, Google, Slack, Hugging Face, npm, SendGrid, Twilio, JWT, private keys | Exact formats |
| **Secrets by position** | `API_KEY=…`, `password = "…"`, `"client_secret": "…"`, passwords in URLs, `Bearer …` | Skips `process.env.X`, `${X}`, `<your-key>`, `changeme`, `token: string`, `max_tokens`, code |
| **Moroccan data** | Phones (`+212`, `06…`, `05…`), RIB, IBAN, CIN, ICE | RIB and IBAN checksums; CIN and ICE only next to words that name them, in French, English or Arabic |
| **Other personal data** | Emails, cards, international phones | Luhn check on cards |
| **Network** | IPv4, IPv6 | Skips loopback, versions, section numbers, netmasks, times |

**The same value always gets the same placeholder**, so a model can still reason about "the same key" across a conversation.

## What it won't do

It finds known formats. **It can miss** a secret with no recognisable shape and no label, and **names or addresses in plain text**: "Ali Benali" stays visible. Read the text before sending it. It reduces mistakes; it isn't a guarantee.

A file saved with `--vault-out` holds the real values in plain text, so treat it like the secrets themselves.

## Testing

- 71 tests, including every point at which a placeholder can be split across stream chunks, and the proxy against a fake provider.
- `e2e/page.mjs`: 28 checks in a real browser, served with the exact headers from `vercel.json`.
- `npm run fp`: scans text that should hold few secrets. On the docs and code of about 600 npm packages (844 files, 12.4 MB): 155 emails and 25 IPs, which are real ones or documentation examples, 17 assigned values, and 1 card (a documented test number). Reading these hits drove the rules: digits inside git hashes, DOIs and RFC section numbers no longer match.
- `tools/rule-timing.mjs`: anyone can paste anything, so no pattern may go quadratic. The first version took 36 s on 200 KB of `aaaa`; the worst case is now 16 ms, and a test enforces a limit.

Fixtures are assembled at runtime from parts and are fake, so that this repo doesn't trip secret scanners.

## Architecture

```
src/rules.ts    what to find, with validators (Luhn, mod 97, entropy)
src/mask.ts     mask(), Vault (in memory), StreamUnmasker
src/proxy.ts    local proxy: JSON and server-sent events
src/cli.ts      the secret-mask command
web/            the page (React), which uses the same src/mask.ts
```

## Development

Node 22 or later.

```bash
npm install
npm test
```

```bash
npm run build
```

```bash
npm run web:dev
```

## Roadmap

- [x] v0.1 — detector with a test corpus, patterns for keys and tokens — [#1](https://github.com/Bosaj/prompt-secret-mask/issues/1), [#8](https://github.com/Bosaj/prompt-secret-mask/issues/8)
- [x] v0.2 — placeholder vault, Moroccan and international personal data — [#2](https://github.com/Bosaj/prompt-secret-mask/issues/2), [#9](https://github.com/Bosaj/prompt-secret-mask/issues/9)
- [x] v0.3 — restore values in replies, local proxy — [#3](https://github.com/Bosaj/prompt-secret-mask/issues/3), [#10](https://github.com/Bosaj/prompt-secret-mask/issues/10)
- [x] v0.4 — streaming through the proxy — [#11](https://github.com/Bosaj/prompt-secret-mask/issues/11)
- [ ] Browser extension for chat UIs — [#4](https://github.com/Bosaj/prompt-secret-mask/issues/4)
- [ ] Try the proxy against the real Anthropic and OpenAI APIs (so far: a fake provider); publish on npm

## For LLM agents & contributors continuing this project

- A value must never reach a log, an error message or the `scan` output.
- Every new rule needs tests for what it must *not* match, and a run of `npm run fp` and `tools/rule-timing.mjs`. Bound every open-ended run in a pattern.
- Keep fixtures assembled from parts. Don't commit a whole secret-shaped string, even a fake one.

## 📄 License
**Proprietary & Commercial Software License** — All Rights Reserved © 2026 Oussama Elhadji (`@Bosaj`) <[oussousselhadji@gmail.com](mailto:oussousselhadji@gmail.com)>.

Unauthorized copying, distribution, resale, or reverse engineering is strictly prohibited. See [LICENSE](LICENSE) for full legal terms.
