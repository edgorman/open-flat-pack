# backend

Go API service, packaged as a Docker container and deployed to GCP Cloud Run (see the repository
root `AGENTS.md` for the full deployment architecture). It serves sign-in, profiles, the parts
catalogue, prompt-to-layout generation, and the **designs** published to the gallery.

It implements the Debug Endpoint Contract: `/health` and `/debug` both return system status, a
timestamp, the deployment environment, and the git commit SHA the running image was built from, as
JSON:

```json
{
  "status": "ok",
  "timestamp": "2026-08-22T12:00:00Z",
  "environment": "stag",
  "commit": "abc1234"
}
```

## API

| Route                    | Auth     | What                                                          |
| ------------------------ | -------- | ------------------------------------------------------------- |
| `GET /health`, `/debug`  | none     | The Debug Endpoint Contract above                             |
| `GET /catalogue`         | none     | Every part a design may use; cacheable for an hour            |
| `POST /layouts`          | required | Turn a prompt into a buildable layout; 422 with the errors if the model can't, 503 past the daily call limit |
| `POST /layouts/check`    | none     | Validate a hand-edited layout; always 200 with its errors and build notes |
| `GET /designs`           | none     | One page of designs, newest first, each with its build notes  |
| `GET /designs/{id}`      | none     | One design                                                    |
| `POST /designs`          | required | Publish a layout as a design; 422 with the errors if it isn't buildable |
| `DELETE /designs/{id}`   | required | Delete a design (owner only); designs are never updated       |
| `GET /users/me`          | required | The caller's own profile                                      |
| `PUT /users/me`          | required | Create or update it; a profile with no username is given one  |
| `DELETE /users/me`       | required | Erase the account: its designs, then the profile              |
| `GET /users/{username}`  | optional | Anybody's public profile                                      |

Request and response bodies are the messages in `packages/protos/app/v1`, as protojson. Every
non-2xx response is an `ErrorResponse`. `GET /designs` takes `limit` and `startAfter` (the
`createdAt` of the last entry on the previous page) and answers `hasMore`.

## Layout

```
cmd/backend/          Entrypoint: reads config, builds adapters, hands them to the service
definitions/
  catalogue/          The parts catalogue, one YYYY-MM-DD.json per scrape (the newest is used)
internal/
  catalogue/          Loads and checks the embedded catalogue at startup
  entity/             Domain types and their rules - no I/O, no HTTP, no persistence tags
  feasibility/        Checks a layout against the catalogue: errors and build notes
  model/              One conversation with the design model on Vertex AI, and its system prompt
  repository/         Interfaces for everything external, plus ErrNotFound
    devauth/          Development-token TokenVerifier for running locally (ENVIRONMENT=local only)
    firestore/        Firestore implementations of the repositories (designs, users, model calls)
    google/           Google Identity Services implementation of TokenVerifier
  service/            HTTP server: routes, middleware, and logic spanning more than one entity
scripts/
  scrape-catalogue/   Dev-time helper: prints candidate catalogue entries from IKEA UK's search
```

Dependencies point inward: `service` and `repository` both know `entity`, `entity` knows nothing
else, and only `cmd/backend` knows which concrete adapters exist. Swapping Firestore for another
store means adding a folder under `repository/` and changing one line in `cmd/backend`.

Validation lives on the entities as setters (`SetUsername`, `SetPrompt`, ...) that trim,
check, and only then apply, so a rejected value is never half-written. The HTTP layer decodes into
a request message holding only the client-settable fields and applies it through those setters -
which is why `ownerId` and `createdAt` cannot be spoofed: they are not part of the request shape at
all. `Validate` runs the same setters against a copy and additionally requires the server-set
identity (`Design.OwnerID`, `User.ID`); repositories call it before every write.

Firestore's field names live on separate document structs in `repository/firestore`, which also
keeps the document body free of the id that Firestore already stores as the document key.

## Access control

Every gate in this service is one question asked of one model (`internal/entity/access.go`):

- A **resource** is a kind of thing the service holds (`user`, `design`).
- An **action** is one thing that can be done to it: `read`, `create`, `update`, `delete` - the
  same four verbs the routes are registered under.
- An **access** mode is how wide the audience for that pair is: **public** (everybody, signed in
  or not) or **private** (the owner alone).

The `policy` table declares a mode for every (resource, action) pair that exists. A pair it does
not name carries no mode and is refused, so a feature added without a line in the table is closed
rather than open. An entity turns the declared mode into a `Permission` narrowed to one thing (who
owns it), and `Permission.Allows(uid)` answers. The zero uid is the anonymous caller and holds
nothing but public access. There are deliberately no roles.

Every design is public to read, and only its owner may delete it. `requireDesignPermission`
(`internal/service/design.go`) answers a missing design with a `404` and a refused action with a
`403`.

## Adding a resource

Copy the designs slice end to end:

1. `packages/protos/app/v1/<thing>.proto`: the wire message, a page, and a request. Run `buf generate`.
2. `internal/entity/<thing>.go`: the type, its setters, `Validate` and `Permission`, plus a
   `Resource` constant and a line per action in `access.go`'s `policy` table.
3. `internal/repository/<thing>.go`: the interface. `internal/repository/firestore/<thing>.go`:
   the Firestore implementation, plus any composite index in `infrastructure/env/firestore.tf`.
4. `internal/service/<thing>.go`: the handlers, registered in `service.go`'s `Handler`.
5. If accounts own it, erase it in `DeleteUser` (`internal/service/user.go`).

## Rate limiting

Every request is metered by a token bucket before it reaches a handler
(`internal/service/ratelimit.go`). Two budgets apply, outermost first:

| Budget      | Keyed on                    | Allowance                    | Covers                                            |
| ----------- | --------------------------- | ---------------------------- | ------------------------------------------------- |
| Per client  | client address              | 60 at once, +1 per second    | every route, signed in or not                     |
| Per account | the uid in a verified token | 20 at once, +1 per 3 seconds | every route behind `requireAuth` - so every write |
| Layouts     | the uid in a verified token | 5 at once, +1 per minute     | `POST /layouts`, which calls the model            |

Only the address is known before a credential has been checked, so it is the only thing that can
bound an anonymous flood; only the account survives a caller changing address. A route that calls
something expensive gets a tighter budget of its own, wrapped inside `authed` the same way.

The client address is the **rightmost** `X-Forwarded-For` entry: anything to the left of it is
whatever the client chose to send, so metering the leftmost entry would let a caller dodge the
limit with a random header per request. A refused request is a `429` with a `Retry-After` header.

Buckets live in the memory of one process, so these are per-*instance* budgets: revisit them before
running more than one instance.

## Development

```sh
go mod download                        # install
gofmt -l . && go vet ./...             # lint
go test ./... -cover                   # test
go build -o bin/backend ./cmd/backend  # build
```

CI runs the same checks via moon (see `.github/AGENTS.md`'s "Building with moon").

### Running locally

`moon run services/backend:dev` talks to real Firestore and verifies real Google ID tokens, so it
needs GCP credentials. `dev-local` needs none: Firestore is the emulator and sign-in is a fixed
development token. With the pinned toolchain plus the emulator
(`gcloud components install cloud-firestore-emulator`, which needs Java 21):

```sh
gcloud emulators firestore start --host-port=127.0.0.1:8081   # terminal 1
moon run services/backend:dev-local                            # terminal 2, serves :8080
```

Then sign in with `Authorization: Bearer dev` and `Authorization-Provider: google` (the development
verifier stands in for Google's); `Bearer dev:<uid>` signs in as another account:

```sh
auth=(-H 'Authorization: Bearer dev' -H 'Authorization-Provider: google' -H 'Content-Type: application/json')
curl "${auth[@]}" -X PUT -d '{"username":"dev"}' localhost:8080/users/me
curl localhost:8080/catalogue
curl localhost:8080/designs
```

The emulator keeps data in memory, so restarting it starts empty. `DEV_AUTH=true` is what enables
the development token, and `cmd/backend` refuses to start with it unless `ENVIRONMENT=local`.

### Firestore adapter tests

`internal/repository/firestore` has tests that run against the emulator and skip without it, so
`go test ./...` passes either way. CI's `test` job starts the emulator for them. Locally, with the
emulator from above running:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 go test ./internal/repository/firestore -cover
```

The emulator doesn't enforce composite indexes, so a query missing one still only fails in staging.

## Configuration

| Env var               | Description                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `PORT`                | Port to listen on. Defaults to `8080` (Cloud Run sets this itself).         |
| `ENVIRONMENT`         | Deployment environment reported by `/debug` (e.g. `stag`, `prod`). Defaults to `development`. |
| `DEV_AUTH`            | `true` accepts the development token instead of Google ID tokens. Refused unless `ENVIRONMENT=local`. |
| `CORS_ALLOWED_ORIGIN` | Origin allowed to call this API from a browser (the frontend's URL). Unset disables CORS headers entirely. |
| `GOOGLE_CLIENT_ID`    | OAuth 2.0 client ID that ID tokens must be minted for. Set by Terraform from the `GOOGLE_CLIENT_ID` GitHub Actions variable; unset means no request can authenticate. |
| `MODEL_NAME`          | Vertex AI model `POST /layouts` calls, as `publisher/model`. Unset turns designing off (503), so running locally needs no Vertex credentials. Set by Terraform. |
| `MODEL_LOCATION`      | Vertex AI location `MODEL_NAME` is served from. Defaults to `global`. |
| `MODEL_DAILY_CALL_LIMIT` | Most model calls per UTC day, counted in Firestore (`modelCalls/<day>`); past it `POST /layouts` answers 503 until midnight. Defaults to `0`. |

`commit` is not an env var — it's baked into the binary at build time via
`-ldflags "-X main.commit=..."` (see `Dockerfile`), since the same image is promoted unmodified
from staging to production.
