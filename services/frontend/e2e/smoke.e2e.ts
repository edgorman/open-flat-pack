import { expect, test } from '@playwright/test'

const galleryRows = (page: import('@playwright/test').Page) => page.locator('a.feed-row')

test('the gallery loads', async ({ page }) => {
  await page.goto('/designs')
  await expect(page.getByRole('heading', { name: 'Recent designs' })).toBeVisible()
  // A fresh deployment may hold no designs yet; either a row or the empty state proves the backend
  // answered through CORS and config.json.
  await expect(galleryRows(page).first().or(page.getByText(/No designs yet/))).toBeVisible()
})

test('opening a design renders it', async ({ page }) => {
  await page.goto('/designs')
  const first = galleryRows(page).first()
  test.skip(!(await first.isVisible()), 'no designs on this deployment')
  await first.click()
  await expect(page).toHaveURL(/\/designs\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('the sign-in button renders', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account' }).click()
  const panel = page.getByRole('dialog', { name: 'Account' })
  await expect(panel.getByRole('alert')).toHaveCount(0)
  // Google Identity Services draws the button into an iframe of its own.
  await expect(panel.locator('iframe[src*="accounts.google.com"]')).toBeVisible()
})

test('/robots.txt and /sitemap.xml answer', async ({ page, request }) => {
  expect((await request.get('/robots.txt')).ok()).toBe(true)

  const response = await request.get('/sitemap.xml')
  expect(response.ok()).toBe(true)
  const xml = await response.text()
  const root = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    return doc.querySelector('parsererror') ? null : doc.documentElement.localName
  }, xml)
  expect(root).toBe('urlset')
  expect(xml).toContain('<loc>')
})
