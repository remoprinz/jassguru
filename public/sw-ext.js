// Lightweight SW-Extension for controlled updates
// This file MUST live at /public/sw-ext.js and survive clean scripts

self.addEventListener('message', (event) => {
	try {
		const data = event && event.data;
		if (!data || typeof data !== 'object') return;
		if (data.type === 'SKIP_WAITING') {
			Promise.resolve(self.skipWaiting()).then(() => {
				self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
					for (const client of clientList) {
						try { client.postMessage({ type: 'SW_ACTIVATED' }); } catch {}
					}
				});
			});
		}
	} catch (_e) {
		// never crash the SW
	}
});


