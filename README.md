# Nodex

## Project Overview
Nodex is a Nostr-native task and discussion app. It combines lightweight project/task management with Nostr publishing, so items can be created locally and published to selected relays while remaining filterable by channels (hashtags), relays, and people.

The UI supports multiple task views (tree/feed/calendar/table), nested subtasks, comments, channel-based filtering, and mobile-first compose/search controls.

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

## Tech Stack
- Vite
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
