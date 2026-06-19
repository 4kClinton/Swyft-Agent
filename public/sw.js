// Kill-switch service worker.
//
// The previous service worker used a cache-first strategy that precached "/"
// and static assets and never revalidated — so once a broken/empty stylesheet
// was cached it kept serving an unstyled page forever. This version unregisters
// itself and deletes every cache on the next visit, restoring normal behaviour.
// (A proper network-first PWA worker can be reintroduced later via Workbox.)

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete all caches left by the old worker.
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))

      // Unregister this worker so it stops intercepting fetches.
      await self.registration.unregister()

      // Reload any open tabs so they fetch assets straight from the network.
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.navigate(client.url)
      }
    })(),
  )
})

// No fetch handler — let everything go to the network.
