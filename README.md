# quiz-words

A small Quizlet-style studio: type words (or photograph a list), get translations and memory sentences, then flip or write the matching word.

**Stack:** React UI · Bun API · libSQL · OpenRouter (`openai/gpt-5-nano`)

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
libSQL HTTP: http://localhost:8081  
Data is stored in the `libsql-data` volume.

## GitHub Actions

The workflow does **not** run on push or pull request. Start it by hand: **Actions → CI → Run workflow**. That builds and pushes:

- `{DOCKER_USERNAME}/quiz-words-api:latest` (and the commit SHA)
- `{DOCKER_USERNAME}/quiz-words-web:latest` (and the commit SHA)

Same login as hutka: repo secrets `DOCKER_USERNAME` and `DOCKER_PASSWORD`. Forks do not receive these secrets.
