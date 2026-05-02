<div align="center">

<img src="public/logo.svg" alt="ldinvihub" width="120" height="120" />

# ldinvihub

**An AI-gated, community-driven invitation sharing hub for [linux.do](https://linux.do/).**

[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Workers AI](https://img.shields.io/badge/Workers_AI-qwen-1F6FEB?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers-ai/)
[![D1](https://img.shields.io/badge/Cloudflare-D1-0051C3?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## What is this?

`ldinvihub` is a small, opinionated web app where the [linux.do](https://linux.do/)
community can **donate** their unused Discourse invitation links and where newcomers
can **request** one by writing a real, thoughtful application.

Every application is graded on a 0–100 scale by **Cloudflare Workers AI** (qwen) against a
plain-Markdown rule book, and only applications scoring ≥ 75 receive a link. Lazy "I want
to learn linux"-style requests, AI-generated boilerplate, and obvious copy-paste duplicates
are filtered out before they ever burn a precious one-shot invite.

> Discourse invite links self-destruct on first click. The server therefore **never** probes
> them — handing one out is the only way to know it works, and an atomic D1 `UPDATE … RETURNING`
> guarantees the same link is never given to two people.

---

## Features

- **AI review** — qwen-1.5-14b on Workers AI scores each application against rules in
  [`rules.md`](./rules.md) and returns structured JSON (`score`, `reason`, `violations`).
- **Two-layer bot defense** — Cloudflare Turnstile (interactive) + reCAPTCHA v3 (invisible
  background scoring).
- **Plagiarism guard** — character trigram Jaccard similarity against the last 8 hours of
  approved applications; anything ≥ 80% is auto-rejected without spending an AI call.
- **Atomic invite claim** — single-statement `UPDATE invites SET used=1 WHERE id=(SELECT id …)
  RETURNING url` prevents double-spend on D1.
- **Rate limited** — 5 contributions / 24 h and 3 requests / 24 h per cookie fingerprint;
  successful requesters get a 7-day cooldown so invites get distributed widely.
- **Plain-Markdown rule book** — `rules.md` is bundled into the system prompt at build time.
  Edit, push, redeploy — that's the whole moderation workflow.
- **Edge-native** — every API route runs on the edge runtime; cold starts measured in
  milliseconds.

---

## Tech stack

| Layer       | Choice                                                                 |
|-------------|------------------------------------------------------------------------|
| Hosting     | Cloudflare Pages + Pages Functions                                     |
| Framework   | Next.js 15 (App Router) via `@cloudflare/next-on-pages`                |
| UI          | [Fluent UI v9](https://react.fluentui.dev/) + [Lucide](https://lucide.dev/) |
| Database    | Cloudflare D1 (SQLite)                                                 |
| LLM         | Cloudflare Workers AI — `@cf/qwen/qwen1.5-14b-chat-awq`                |
| Bot defense | Cloudflare Turnstile + Google reCAPTCHA v3 invisible                   |

---

## Architecture

```
                          ┌─────────────────────────────────┐
   Browser ──────────────▶│  Next.js App Router (edge)      │
   (Fluent UI +           │  /  /contribute  /request       │
    Turnstile +           └────────────────┬────────────────┘
    reCAPTCHA v3)                          │
                                           │  POST /api/{contribute,request}
                                           ▼
                          ┌─────────────────────────────────┐
                          │  Pages Functions (edge runtime) │
                          │  ─ Turnstile siteverify         │
                          │  ─ reCAPTCHA v3 siteverify      │
                          │  ─ rate limit (D1)              │
                          │  ─ trigram Jaccard dedup        │
                          │  ─ Workers AI judge (qwen)      │
                          │  ─ atomic invite claim          │
                          └────────────┬────────────┬───────┘
                                       │            │
                                       ▼            ▼
                                  ┌─────────┐  ┌─────────┐
                                  │   D1    │  │   AI    │
                                  └─────────┘  └─────────┘
```

---

## Project layout

```
.
├── app/
│   ├── api/
│   │   ├── contribute/route.ts   # POST: validate + UNIQUE de-dup + insert
│   │   ├── request/route.ts      # POST: rate-limit → dedup → AI → atomic claim
│   │   └── stats/route.ts        # GET: stock counters + public site keys
│   ├── contribute/page.tsx       # Donation form
│   ├── request/page.tsx          # Application form (≥ 50 chars)
│   ├── page.tsx                  # Landing
│   ├── providers.tsx             # FluentProvider (auto light/dark)
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── ai.ts                     # Workers AI call + JSON parser
│   ├── db.ts                     # D1 / AI binding accessors
│   ├── fingerprint.ts            # HttpOnly cookie UUID
│   ├── prompt.ts                 # System prompt assembled with rules.md
│   ├── ratelimit.ts              # Per-fingerprint daily / weekly limits
│   ├── recaptcha.ts              # reCAPTCHA v3 server verify
│   ├── similarity.ts             # Trigram Jaccard plagiarism check
│   ├── turnstile.ts              # Turnstile server verify
│   ├── useRecaptcha.ts           # Client hook for grecaptcha
│   └── validate.ts               # linux.do invite URL regex
├── public/
│   ├── favicon.svg
│   └── logo.svg
├── rules.md                      # The rule book — edit me!
├── schema.sql                    # D1 schema
├── wrangler.toml                 # Bindings + non-secret vars
├── next.config.mjs
├── tsconfig.json
└── package.json
```

---

## Getting started

### Prerequisites

- Node.js ≥ 20
- A Cloudflare account with Pages, D1 and Workers AI enabled
- (optional) Turnstile and reCAPTCHA v3 keys

### 1. Install

```bash
npm install
```

### 2. Provision the database

```bash
# create the D1 database (note the database_id it prints)
wrangler d1 create ldinvihub

# paste the database_id into wrangler.toml, then
npm run db:init:remote   # apply schema.sql to the cloud DB
npm run db:init:local    # also apply locally for `pages dev`
```

### 3. Configure secrets

```bash
# required for production
wrangler pages secret put TURNSTILE_SECRET --project-name=ldinvihub

# optional second layer
wrangler pages secret put RECAPTCHA_SECRET --project-name=ldinvihub
```

Public site keys live in `wrangler.toml` under `[vars]`:

```toml
TURNSTILE_SITE_KEY = "0x..."
# RECAPTCHA_SITE_KEY = "6L..."
```

### 4. Run locally

```bash
npm run pages:build
npm run pages:dev
# → http://localhost:8788
```

> **Windows note**: `@cloudflare/next-on-pages` invokes `vercel build` internally, which
> needs symlink permission and shells through `npx`. If you hit `EPERM: symlink` or
> `spawn npx ENOENT`, run the build inside WSL or use Cloudflare's Git integration —
> the Linux CI environment has neither problem.

### 5. Deploy

```bash
npm run pages:deploy
```

Or connect the repo to Cloudflare Pages and use:

- **Build command**: `npm run pages:build`
- **Build output directory**: `.vercel/output/static`

---

## Tuning the rule book

`rules.md` is pulled into the qwen system prompt at build time. To change moderation
policy:

1. Edit `rules.md`.
2. `git push` → Cloudflare Pages rebuilds automatically.

That's it — no admin panel, no database migrations, no flags. Just words.

---

## API reference

| Route               | Method | Body                                                          | Notes                              |
|---------------------|:------:|---------------------------------------------------------------|------------------------------------|
| `/api/stats`        | GET    | —                                                             | Stock counters & public site keys  |
| `/api/contribute`   | POST   | `{ url, turnstileToken, recaptchaToken? }`                    | Donates a link                     |
| `/api/request`      | POST   | `{ text, turnstileToken, recaptchaToken? }`                   | Requests an invite (≥ 50 chars)    |

---

## Friend links

> The community this project exists for. Go say hi.

- 🌟 **[linux.do](https://linux.do/)** — a comfy, all-around tech & life community in
  Chinese, built on Discourse. Despite the name it is **not** a Linux-tutorial site.

---

## Contributing

Issues and pull requests are welcome. If you want to propose a rule change, edit
`rules.md` and explain the rationale in your PR description.

## License

MIT — see [LICENSE](LICENSE).
