# HelveX OS — Full Platform Rebuild Proposal

> A complete re-architecture of the HelveX client platform into a premium,
> AI-first workspace. The result should feel like *"Claude + ChatGPT + Vercel
> had a child"* — not a traditional SaaS dashboard.

**Status:** working foundation shipped under `/os/` (runs in parallel with the
legacy platform). Nothing in the current platform was modified, so cutover is
risk-free and reversible.

---

## 0. What was actually built alongside this document

This is not just a spec. A clickable, dark-first reference implementation lives in `/os/`:

| File | Purpose |
|------|---------|
| `os/os.css` | The new design system — tokens, components, shell, responsive rules |
| `os/os.js` | The shared shell — desktop icon rail, mobile bottom nav, ⌘K palette, theme |
| `os/index.html` | **Chat** — the homepage, with conversation list, model picker, simulated streaming, artifacts |
| `os/projects.html` | **Projects** — the operating system; every tool belongs to a project |
| `os/agents.html` | **Agents** — the agent/AI-employee builder |
| `os/knowledge.html` | **Knowledge** — upload + auto-indexed, AI-organised sources |
| `os/deploy.html` | **Deploy** — Vercel-style history, rollback, env vars, domains |
| `os/settings.html` | **Settings** — everything advanced, tucked away (billing, keys, team, security…) |

Open `os/index.html` to start. It reuses the existing Supabase auth (`auth.js`)
that was just restored.

---

## 1. Information Architecture

### Principle
Everything revolves around **conversations** and **projects**. The old platform
exposed ~30 top-level destinations across 7 nav groups (Workspace, Toolkit,
Build, Observability, Developer, Billing, Account). That is the cognitive-load
problem. The rebuild collapses all of it into **6 destinations**.

### Before → After

| Legacy (obsolete as top-level) | Where it goes in HelveX OS |
|---|---|
| Overview / Dashboard | **Removed.** Chat is the homepage. |
| HeliX (chat) | **Chat** (now primary) |
| Workbench, Memory | Folded into **Chat** (memory) + **Agents** (workbench → agent tools) |
| Projects | **Projects** (now the spine of everything) |
| Deployments | **Deploy** |
| Services, CRM, Marketing, Automation, Workflows | **Project-level modules** (contextual tools inside a project), or **Agents** |
| Activity, Usage, Logs | **Settings → Usage** + per-project activity; deploy logs in **Deploy** |
| API Keys, Integrations, Domains | **Settings** (Developer) + Domains in **Deploy** |
| Sessions, Audit log, Team, Connected accounts, Security, Notifications, Profile, Billing, Preferences, Support | **Settings** |

Net effect: **30 → 6** primary destinations. ~80% reduction in top-level surface.

### The six sections

1. **Chat** — where 80% of time is spent. The home screen.
2. **Projects** — the container for everything (chats, files, agents, knowledge, deployments, automations).
3. **Agents** — build AI employees with tools, memory, knowledge, permissions.
4. **Knowledge** — upload anything; AI indexes and organises it.
5. **Deploy** — ship websites, apps, agents and automations.
6. **Settings** — all advanced/admin functionality, never in primary nav.

---

## 2. Navigation System

### Desktop — slim icon rail (Linear/Cursor pattern)
- A **68px left rail** holds the 6 section icons + brand + account avatar.
- Each section that needs context (Chat, Agents, Knowledge, Settings) renders a
  **contextual second column** (~280px): conversation list, agent list, sources,
  settings categories.
- Sections that are gallery-style (Projects, Deploy) skip the panel and use the
  full width (`data-no-panel`).
- **No persistent mega-menu, no nested trees.** Depth lives *inside* a section,
  not in the chrome.

### Mobile — bottom tab bar (native-app pattern)
- 5 thumb-reachable tabs: **Chat · Projects · Agents · Deploy · Settings**.
- Knowledge is reached from inside Projects/Agents on mobile (it is a supporting
  surface, not a daily destination), keeping the bar to 5.
- The contextual column becomes a **slide-in drawer** triggered by a hamburger
  in the page header.

### Everywhere — ⌘K command palette
- Jump to any section, start a new chat, search conversations — one shortcut.
- This is the "power user" escape hatch that lets the visible UI stay minimal.

---

## 3. Core User Flows

1. **Start working (cold open).** Land on Chat → empty state asks *"What should
   we build today?"* with 4 suggestion cards → type → streamed answer. Zero
   navigation required.
2. **Create something durable.** From a chat, "Save to project" → the chat,
   its files and generated artifacts now live in a Project.
3. **Automate a recurring job.** Projects → Agents → build agent (instructions,
   model, tools, knowledge, permissions) → Test → Save & deploy.
4. **Ground the AI in your data.** Knowledge → drop files / connect a site →
   auto-indexed into collections → available to chats and agents.
5. **Ship it.** Deploy → one-click Deploy → watch build → Visit / Rollback.
6. **Administer (rarely).** Settings → billing, keys, team, security. Out of the
   daily path by design.

---

## 4. Complete Page Map

```
/os
├── index.html        Chat            (home; conversation list + thread + composer)
│     ?new=1            → new chat
│     ?c=<id>           → open conversation
├── projects.html     Projects        (grid of project cards; "+ New project")
│     → project detail  (chats · files · agents · knowledge · deploy · automations)
├── agents.html       Agents          (agent list + builder)
├── knowledge.html    Knowledge       (upload/connect + indexed sources + collections)
├── deploy.html       Deploy          (production card + history + env vars + domains)
├── settings.html     Settings        (general · billing · api keys · team · integrations · security/audit)
│
└── (shared) os.css · os.js · reuses ../auth.js, ../helvex-logo.png
```

Secondary surfaces (modals/drawers, not pages): model picker, ⌘K palette,
project switcher, agent test panel, deployment logs, audit log viewer.

---

## 5. Design System Specification

Implemented in `os/os.css`. Dark-mode first; light is an opt-in override.

- **Surfaces (dark):** page `#0A0A0A`, rail `#050505`, panels `#0F0F0F`,
  cards/inputs `#161616`, raised `#1C1C1C`, code well `#080808`.
- **Borders:** `#232323` / soft `#1A1A1A` / strong `#2E2E2E`.
- **Text:** `#F5F5F5` / mid `#A8A8A8` / dim `#6E6E6E` / faint `#4A4A4A`.
- **Accent:** HelveX brass `#D4B445` — the *only* brand colour, used sparingly
  (active states, primary buttons, focus). A cool violet `#8B7FE8` is reserved
  strictly for AI surfaces.
- **Semantic:** ok `#3FB950`, warn `#D29922`, danger `#F85149`.
- **Type:** Inter (UI), JetBrains Mono (numerals/code). Tight tracking
  (`-0.006em`), 14px base, 1.55 line-height.
- **Radii:** 6 / 8 / 12 / 16 / 22 / pill — soft and premium.
- **Shadows:** restrained, true-black-friendly (no glow, no heavy elevation).
- **Motion:** 120ms/220ms with a single shared easing curve; everything
  feels instant.
- **Components:** `.btn` (+ primary/ghost/sm/icon), `.field`, `.card`
  (+ hover), `.chip` (+ accent/ok/ai), list links, segmented control, toggles.

Design rules enforced visually: **no excessive cards, no nested borders, no
dashboard grids of stat tiles, generous whitespace, one accent.**

---

## 6. Mobile Layouts

- **Single column.** The icon rail and contextual panel disappear.
- **Bottom nav** (5 tabs) is fixed, blurred, safe-area-aware, single-thumb.
- **Chat** is full-screen thread + sticky composer; conversation list is a
  left drawer.
- Cards reflow to one column; the Deploy two-column section stacks.
- Tap targets ≥ 44px; type scales down gracefully; `viewport-fit=cover` +
  `env(safe-area-inset-*)` for notch/home-bar.

## 7. Desktop Layouts

`grid-template-columns: [rail 68px] [panel 280px] [main 1fr]`. Pages without a
panel collapse to `[rail] [main]`. Main content is capped at ~1180px and
centred for readability. The composer and thread are capped at 740px (optimal
reading measure), exactly like Claude/ChatGPT.

## 8. Component Library

All composable, theme-driven (CSS variables), framework-agnostic (works in the
current static-HTML stack and ports cleanly to React later):

`Rail` · `BottomNav` · `Topbar` · `ContextPanel` · `ListLink` · `Button` ·
`Field` · `Card` · `Chip/Badge` · `SegmentedControl` · `Toggle` ·
`ModelPicker` · `CommandPalette` · `MessageBubble` · `CodeBlock` ·
`Composer` · `DropZone` · `KeyValueRow` · `DeploymentRow`.

Each is demonstrated live in the `/os/` pages.

---

## 9. Migration Strategy (from current HelveX)

**Parallel-build, then cutover — zero big-bang risk.**

1. **Phase 0 — Foundation (done).** `/os/` design system, shell and the 6
   reference pages exist next to the legacy app. No legacy file touched.
2. **Phase 1 — Wire the backend.** Connect `os/index.html` to the existing
   `api/assistant-chat.js` / Supabase functions for real streaming; load
   `../auth.js` for the session guard so `/os/` is behind login.
3. **Phase 2 — Data model.** Introduce a `projects` table and make chats,
   files, agents, deployments foreign-key to a project. Backfill existing
   data into a default "Personal" project per user.
4. **Phase 3 — Port features as project modules.** Re-home CRM, Marketing,
   Automation, Workflows, Memory as contextual tools *inside* a project rather
   than standalone pages.
5. **Phase 4 — Settings consolidation.** Fold profile, billing, API keys,
   integrations, domains, team, sessions, security, audit, notifications,
   preferences into `os/settings.html` panes.
6. **Phase 5 — Cutover.** Point `/dashboard` → `/os/index.html`, add a
   redirect layer mapping legacy URLs to their new homes, keep legacy pages
   reachable for one release as a fallback, then retire.
7. **Phase 6 — Cleanup.** Delete legacy `platform.*`, `sidebar.js` and the
   ~30 orphaned pages once analytics confirm no traffic.

Redirect map (examples): `/workbench → /os/agents`, `/memory → /os/index`,
`/usage,/logs,/activity → /os/settings#usage`, `/api-keys,/integrations →
/os/settings#developer`, `/deployments → /os/deploy`.

---

## 10. Rationale for Every Major Decision

- **Chat as homepage** — the brief's "80% of time" target. The first thing a
  user sees should be a cursor, not a dashboard. Matches ChatGPT/Claude muscle
  memory.
- **Six sections, hard stop** — every extra nav item taxes every decision. 30→6
  is the single biggest cognitive-load win, satisfying the "reduce by 70%" goal.
- **Projects as the spine** — kills "disconnected tools." A CRM with no home is
  clutter; a CRM *inside the Acme project* is context. Everything inherits the
  project's knowledge, agents and permissions.
- **Slim icon rail + contextual panel** (vs. fat sidebar) — keeps the chrome to
  ~68px, puts depth inside sections, and reads as premium (Linear/Cursor) rather
  than enterprise (legacy).
- **Dark-first** — the brief's explicit requirement and the expectation for
  developer/AI tooling. Light remains a first-class opt-in.
- **One accent colour** — restraint signals premium. Brass is the HelveX
  signature; violet is fenced off for AI so "AI is happening" is legible at a
  glance without decoration.
- **Bottom nav on mobile** — the only ergonomic pattern for one-thumb use; the
  legacy hamburger-everything mobile nav was the stated pain point.
- **Command palette** — lets the *visible* UI stay minimal while keeping every
  action one shortcut away (the Vercel/Linear power-user contract).
- **Parallel `/os/` build** — de-risks an "entire platform rebuild." Ship,
  review and cut over incrementally instead of betting the product on one merge.
- **Reuse existing auth + APIs** — the Supabase auth and `api/*` functions are
  solid; the rebuild is a UI/IA re-architecture, not a backend rewrite. Lower
  risk, faster to production.

### Every-feature test applied
For each legacy surface we asked the brief's four questions — *Is it necessary?
Can it be hidden? Can AI do it automatically? Can it merge into another flow?* —
which is exactly how 30 destinations became 6 + a settings drawer + project
modules.

---

*Next step: approve direction → Phase 1 (wire `os/index.html` to live streaming
+ put `/os/` behind `auth.js`).*
