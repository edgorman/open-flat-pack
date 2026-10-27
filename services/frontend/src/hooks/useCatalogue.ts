/**
 * The parts catalogue (`GET /catalogue`), fetched once per page load and shared by every caller.
 * It only changes on a backend deploy, so there is nothing to refresh.
 */
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { errorMessage, type Api, type Catalogue } from '../lib/api'

let cached: Promise<Catalogue> | null = null

function load(api: Api): Promise<Catalogue> {
  cached ??= api.getCatalogue().catch((e: unknown) => {
    // Forget a failure, so the next caller tries again.
    cached = null
    throw e
  })
  return cached
}

/** Clears the shared catalogue, for tests. */
export function resetCatalogue() {
  cached = null
}

export function useCatalogue(): { catalogue: Catalogue | null; error: string | null } {
  const { api } = useApp()
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api) return
    let live = true
    load(api).then(
      (c) => live && setCatalogue(c),
      (e: unknown) => live && setError(errorMessage(e, 'Could not load the catalogue.')),
    )
    return () => {
      live = false
    }
  }, [api])

  return { catalogue, error }
}
