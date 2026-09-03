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

The workflow does **not** run on push or pull request. Start it by hand: **Actions → CI → Run workflow**. Check **Push Docker images to the registry** only when you want a publish.

Images (when that box is checked):

- `{registry}/{username}/quiz-words-api`
- `{registry}/{username}/quiz-words-web`

Add these in the repo **Settings → Secrets and variables → Actions**:

| Name | Where | Purpose |
| --- | --- | --- |
| `USERNAME` | Secret or variable | Registry username |
| `PASSWORD` | Secret | Registry password or access token |
| `REGISTRY` | Variable (optional) | Defaults to `docker.io` |

Secrets stay on this repository. A public fork does not get `USERNAME`/`PASSWORD`, so fork CI cannot log in to your registry or push there. If someone runs Actions on their fork, they only push if they add their own credentials — those go to *their* account, not yours.

Docker Hub example: `USERNAME` = hub user, `PASSWORD` = [access token](https://hub.docker.com/settings/security).  
GHCR example: `REGISTRY` = `ghcr.io`, `USERNAME` = GitHub user, `PASSWORD` = PAT with `write:packages`.
