/**
 * Client for the backend API (see /services/backend). Callers pass the header map from
 * useGoogleAuth, so this module knows nothing about any auth provider.
 *
 * Wire types come from `src/gen` rather than being declared here - see packages/protos/AGENTS.md's
 * "Contract Layer". This file declares no `export interface` of its own, and CI fails a PR that
 * adds one (`root:wire-types`).
 */
import type { CurrentUser, UpdateCurrentUserRequest, User } from '../gen/app/v1/user'
import type { ErrorResponse } from '../gen/app/v1/error'
import type { Catalogue } from '../gen/app/v1/catalogue'
import type { CreateLayoutRequest, CreateLayoutResponse } from '../gen/app/v1/layout'
import type { CreateDesignRequest, Design, DesignPage, ListDesignsParams } from '../gen/app/v1/design'

export type { User, CurrentUser } from '../gen/app/v1/user'
export type { Catalogue, Part } from '../gen/app/v1/catalogue'
export type { Layout, LayoutPart, Validation } from '../gen/app/v1/layout'
export type { Design, DesignPage } from '../gen/app/v1/design'

/**
 * Thrown for any non-2xx response, carrying the status so callers can treat 404 as "absent", and
 * the parsed body for the few that carry more than an ErrorResponse (a 422's Validation).
 */
export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Message to show for a rejected request, falling back when it isn't an Error. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** The path a design lives at, in the app and the API alike. The id is escaped: it arrives from the API. */
export function designPath(id: string): string {
  return `/designs/${encodeURIComponent(id)}`
}

/**
 * Whether the signed-in caller wrote something attributed to username. Usernames are unique and a
 * design resolves its author's on every read, so this is the "is it mine" check the wire leaves a
 * client - it is never sent a uid to compare. Only for what to show: the backend decides every
 * write itself.
 */
export function isAuthor(profile: CurrentUser | null, username: string): boolean {
  return !!profile && !!username && profile.username === username
}

export type AuthHeaders = Record<string, string>

/** What a request carrying a credential the backend rejected tells its caller. */
export const SESSION_EXPIRED = 'Your sign-in has expired. Sign in again to carry on.'

async function send<T>(
  baseUrl: string,
  authHeaders: AuthHeaders,
  method: string,
  path: string,
  body?: unknown,
  onUnauthorized?: () => void,
): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      ...authHeaders,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // A 401 with a credential attached means the credential itself was refused - in practice, that
  // it expired - so the caller hears that rather than a raw status, and the session is ended.
  if (response.status === 401 && authHeaders.Authorization) {
    onUnauthorized?.()
    throw new ApiError(401, SESSION_EXPIRED)
  }

  if (!response.ok) {
    // Every non-2xx response is an ErrorResponse, but fall back to the status if parsing it fails.
    const body: unknown = await response.json().catch(() => undefined)
    const message = (body as ErrorResponse | undefined)?.error
    throw new ApiError(response.status, message ?? `Request failed with ${response.status}`, body)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

/** The API path for a page of a newest-first list, carrying only the params a caller actually set. */
function listPath(path: string, params: ListDesignsParams = {}): string {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.startAfter) query.set('startAfter', params.startAfter)

  const search = query.toString()
  return search ? `${path}?${search}` : path
}

export function createApi(baseUrl: string, authHeaders: AuthHeaders, onUnauthorized?: () => void) {
  // Every call below goes through this, so each one ends the session on a refused credential.
  function request<T>(method: string, path: string, body?: unknown) {
    return send<T>(baseUrl, authHeaders, method, path, body, onUnauthorized)
  }
  return {
    // A profile is addressed by its username; the Google sub it is keyed by is never a URL.
    getUser: (username: string) => request<User>('GET', `/users/${encodeURIComponent(username)}`),
    // The caller's own profile needs no name: the backend takes the owner from the credential,
    // which is also how a client discovers the username it was given at sign-up.
    getCurrentUser: () => request<CurrentUser>('GET', '/users/me'),
    putUser: (user: Partial<UpdateCurrentUserRequest>) => request<CurrentUser>('PUT', '/users/me', user),
    deleteUser: () => request<void>('DELETE', '/users/me'),

    getCatalogue: () => request<Catalogue>('GET', '/catalogue'),
    // Can take several seconds: the model may be called up to three times. A 422 carries the
    // remaining errors as a Validation in ApiError.body.
    createLayout: (req: CreateLayoutRequest) => request<CreateLayoutResponse>('POST', '/layouts', req),

    listDesigns: (params?: ListDesignsParams) => request<DesignPage>('GET', listPath('/designs', params)),
    getDesign: (id: string) => request<Design>('GET', designPath(id)),
    // A 422 carries the layout's Validation, as createLayout's does.
    createDesign: (req: CreateDesignRequest) => request<Design>('POST', '/designs', req),
    deleteDesign: (id: string) => request<void>('DELETE', designPath(id)),
  }
}

export type Api = ReturnType<typeof createApi>
