# quiz-words

A small Quizlet-style studio: type words (or photograph a list), get translations and memory sentences, then flip or write the matching word.

**Stack:** React UI · Bun API · SQLite · OpenRouter (`openai/gpt-5-nano`)

## Setup

1. Copy env and add your [OpenRouter](https://openrouter.ai/) key:

```bash
cp .env.example .env
```

2. Install and run both apps:

```bash
bun install --cwd server
bun install --cwd web
bun run dev
```

- UI: http://localhost:5173
- API: http://localhost:3000

Enter a username (creates a profile if it is new, otherwise opens the existing one). Create a deck, paste words or upload a photo, then study.

## Docker

```bash
cp .env.example .env   # set OPENROUTER_API_KEY
docker compose up --build
```

App: http://localhost:8080  
SQLite is stored in the `quiz-data` volume.

## GitHub Actions

`.github/workflows/ci.yml` runs on push and pull request:

- install with Bun, typecheck, and build the web app
- `docker compose build` for the API and nginx images
