# Nodex

## Project Overview
Nodex is a Nostr-native task and discussion app. It combines lightweight project/task management with Nostr publishing, so items can be created locally and published to selected relays while remaining filterable by channels (hashtags), relays, and people.

The UI supports multiple task views (status, tree, feed, list, kanban, and calendar), nested subtasks, comments, channel-based filtering, and mobile-first compose/search controls.

## Core Concepts
- Tasks and comments are represented as Nostr-compatible events.
- Channels are hashtag-driven (`#channel`) and used for both filtering and compose defaults.
- Relay selection controls where new events are published.
- People and channel filters can narrow visible content across views.

## Local Development
Requirements:
- Node.js 18+
- npm

Run locally:

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

Build:

```sh
npm run build
```

## Docker + rnostr
Create a local env file and start both services:

```sh
cp .env.example .env
docker compose up --build
```

Key env values:
- `RNOSTR_WS_PORT`: websocket port exposed by `rnostr` (default `7447`).
- `VITE_DEFAULT_RELAYS`: comma-separated relay WebSocket URLs (e.g. `ws://localhost:7447` for a local relay).
- `VITE_NIP96_UPLOAD_URL`: NIP-96 upload endpoint used by attachment buttons.
- `VITE_NODEX_MOTD`: optional message-of-the-day text shown as a dismissible top banner.
- `VITE_CORE_CHANNELS`: optional comma-separated channels that every root post must include;
  core channels stay pinned and bolded in channel surfaces.

## Attachment Upload Setup
Nodex attachment uploads use a NIP-96-compatible HTTP endpoint.

Public endpoint option:
- `VITE_NIP96_UPLOAD_URL=https://nostr.build/api/v2/upload/files`
- Some public providers may return `401` depending on policy/rate limits.

Self-hosted option:
- Use the included Route96 compose overlay:
```sh
docker compose -f docker-compose.yml -f docker-compose.upload.yml --profile upload up --build
```
- Default local upload URL:
  - `VITE_NIP96_UPLOAD_URL=http://localhost:8096/api/v1/upload`
- Route96 template config is in `docker/route96.yaml` and may require adjustments for your Route96 version/deployment policy.

## Tech Stack
- Vite
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
