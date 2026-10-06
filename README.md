# quiz-words

A vocabulary studio: create or import a set, then study with Flashcards, Learn, and Test. Type words, photograph a list, or paste a set link / JSON export. Share sets by username.

**Stack:** React UI · Bun API · MongoDB · OpenRouter (`openai/gpt-5-nano`)

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
API: http://localhost:3000  
Data is stored in MongoDB (`mongo-data` volume). Local `bun run dev` expects MongoDB at `mongodb://127.0.0.1:27017`.

Nginx serves the UI. Set **`API_URL`** to the public API origin (for example `https://api.example.com/quiz`). Local Vite can leave it empty and use the `/api` proxy.

On Portainer, deploy **`docker-compose.stack.yml`**. Set:

- `DOCKER_USERNAME`
- `OPENROUTER_API_KEY`
- `API_URL` — public API origin, e.g. `https://api.example.com/quiz`

## GitHub Actions

The workflow does **not** run on push or pull request. Start it by hand: **Actions → CI → Run workflow**. That builds and pushes:

- `{DOCKER_USERNAME}/quiz-words-api:latest` (and the commit SHA)
- `{DOCKER_USERNAME}/quiz-words-web:latest` (and the commit SHA)

Same login as hutka: repo secrets `DOCKER_USERNAME` and `DOCKER_PASSWORD`. Forks do not receive these secrets.
