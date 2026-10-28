import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppContext, type AppContextValue } from './context/AppContext'

export function fakeAppContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    user: null,
    api: null,
    authError: null,
    authReady: true,
    renderSignInButton: () => {},
    signOut: () => {},
    theme: 'light',
    toggleTheme: () => {},
    profile: null,
    setProfile: () => {},
    config: { siteUrl: 'https://app.example.com', siteName: 'Example App' },
    ...overrides,
  }
}

interface Options {
  context?: Partial<AppContextValue>
  /** The URL to render at. Defaults to '/'. */
  route?: string
  /** The route pattern matched against `route`, for pages that read useParams(). Defaults to `route`. */
  path?: string
  /** History state the page reads from its location, as a link's `state` would set it. */
  state?: unknown
}

/** Renders a page or component inside a fake AppContext and a router, without real auth/fetch wiring. */
export function renderWithApp(ui: ReactElement, { context, route = '/', path = route, state }: Options = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: route, state }]}>
      <AppContext.Provider value={fakeAppContext(context)}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </AppContext.Provider>
    </MemoryRouter>,
  )
}
