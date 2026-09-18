# Puolink — React (Vite) + Java Spring Boot

## Why the "Cannot use import statement outside a module" error goes away

That error had nothing to do with CORS or the backend language — it happens
when a browser is handed raw `import ... from '...'` source without a
bundler in front of it. As long as you start the frontend with `npm run dev`
(Vite's dev server), Vite transforms JSX and resolves every import for you
before the browser ever sees it, so this error simply won't occur. Do not
open `client/index.html` directly or serve `client/src/*.jsx` as static
files — that's what causes it.

## Why the proxy — not CORS headers — is what actually fixes cross-origin

`client/vite.config.js` proxies every `/api/*` request from the Vite dev
server to `http://localhost:8080` **on the server side**. The browser only
ever makes requests to `http://localhost:5173` — it never talks to port 8080
directly — so there is no cross-origin request for the browser to block in
the first place. This is why `client/src/App.jsx`'s `API_BASE_URL` must be
the **relative** path `/api`, not `http://localhost:8080/api`: an absolute
URL would bypass the proxy entirely and hit 8080 directly from the browser,
which brings CORS back into play.

The Spring Boot `CorsConfig` is still included as a second layer, for cases
that don't go through the proxy — e.g. testing `curl`/Postman against 8080
directly, or a future deployment where frontend and backend genuinely sit on
different origins.

## Prerequisites

- Node.js 18+
- JDK 17+ and Maven (or use the Maven wrapper if you generate one)
- A Daily.co account + API key
- A Deepgram account, project ID, and master API key

## Run the backend (Spring Boot, port 8080)

```bash
cd server
export DAILY_API_KEY=your_daily_api_key
export DEEPGRAM_API_KEY=your_deepgram_master_key
export DEEPGRAM_PROJECT_ID=your_deepgram_project_id
mvn spring-boot:run
```

Verify it's up:

```bash
curl http://localhost:8080/api/health
# {"status":"ok","service":"puolink-server"}
```

## Run the frontend (Vite, port 5173)

In a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Requests to `/api/presence-session` and
`/api/deepgram-token` are transparently proxied to the Spring Boot server —
open your browser's Network tab and you'll see them going to `:5173`, not
`:8080`.

## Endpoints (Spring Boot, mapped under `/api`)

| Method | Path                  | Description                                                        |
|--------|-----------------------|----------------------------------------------------------------------------|
| GET    | `/api/health`         | Liveness check                                                      |
| POST   | `/api/presence-session` | Creates a private Daily.co room (1-hour expiry) + provider/patient meeting tokens |
| GET    | `/api/deepgram-token` | Mints a temporary, 1-hour-TTL Deepgram key (`nova-2-medical` transcription happens client-side against this key) |

## Files of note

```
server/
  pom.xml
  src/main/resources/application.properties
  src/main/java/com/puolink/server/
    PuolinkServerApplication.java
    config/RestTemplateConfig.java     RestTemplate bean w/ timeouts
    config/CorsConfig.java             fallback CORS rule for /api/**
    controller/PresenceController.java the three endpoints above
    service/DailyService.java          Daily.co room + token creation
    service/DeepgramService.java       Deepgram temporary key minting
    dto/                               response records
    exception/                         DailyApiException, DeepgramApiException

client/
  vite.config.js                       dev-server proxy config
  .env.example                         VITE_API_BASE_URL=/api
  src/App.jsx                          unchanged except API_BASE_URL default
```

## A note on this sandbox's verification

Every `.java` file here was compiled with `javac` for pure syntax
correctness. This sandbox's network egress does not include Maven Central,
so a full `mvn compile` (which needs to download the actual Spring Boot
jars) could not be run here — run `mvn spring-boot:run` on your machine to
do that final check. If `pom.xml`'s `spring-boot-starter-parent` version
(`3.3.4`) is older than what you have cached locally, bump it — nothing
else in this project depends on that exact patch version.
