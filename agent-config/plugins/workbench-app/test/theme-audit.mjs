// Offline light-theme contract used by the browser fixture.
export const forceLightPalette = `
html,body{
 color-scheme:light !important;
 background:#fff;
 color:#1d2129;
}
`

// Check the resolver itself rather than auditing a dark palette. The host may
// briefly request dark, but the plugin must synchronously restore these values.
export async function auditLightPage(page, name) {
  const state = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-dsh-theme'),
    rootDark: document.documentElement.hasAttribute('data-ds-dark-theme') || document.documentElement.classList.contains('dark'),
    bodyDark: Boolean(document.body && (document.body.hasAttribute('data-ds-dark-theme') || document.body.classList.contains('dark'))),
    rootScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyScheme: document.body ? getComputedStyle(document.body).colorScheme : '',
  }))
  return {
    name,
    state,
    failures: [
      ...(state.theme === 'light' ? [] : [{ kind: 'theme', actual: state.theme }]),
      ...(state.rootDark ? [{ kind: 'root-dark' }] : []),
      ...(state.bodyDark ? [{ kind: 'body-dark' }] : []),
      ...(state.rootScheme === 'light' ? [] : [{ kind: 'root-color-scheme', actual: state.rootScheme }]),
      ...(state.bodyScheme === 'light' ? [] : [{ kind: 'body-color-scheme', actual: state.bodyScheme }]),
    ],
  }
}
