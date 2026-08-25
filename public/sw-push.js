/**
 * Service Worker for Push Notifications & Emergency Alerts
 * Handles push events, notification clicks, and emergency alarm sounds
 */

const CACHE_NAME = 'presence-push-v1';

// Emergency alert configurations
const ALERT_CONFIGS = {
  fire: {
    title: '🔥 FIRE ALARM',
    body: 'Fire emergency! Evacuate immediately via nearest exit.',
    vibrate: [1000, 200, 1000, 200, 1000, 200, 1000],
    tag: 'emergency-fire',
    urgency: 'critical',
  },
  lockdown: {
    title: '🔒 LOCKDOWN ALERT',
    body: 'School lockdown initiated. Stay inside, lock doors, stay quiet.',
    vibrate: [500, 100, 500, 100, 500, 100, 2000],
    tag: 'emergency-lockdown',
    urgency: 'critical',
  },
  evacuation: {
    title: '🚨 EVACUATION ORDER',
    body: 'Immediate evacuation required. Proceed to assembly point.',
    vibrate: [800, 200, 800, 200, 800, 200, 800],
    tag: 'emergency-evacuation',
    urgency: 'critical',
  },
  earthquake: {
    title: '⚠️ EARTHQUAKE ALERT',
    body: 'Drop, Cover, Hold On! Move to safe zones immediately.',
    vibrate: [300, 100, 300, 100, 1500, 200, 300, 100, 300],
    tag: 'emergency-earthquake',
    urgency: 'critical',
  },
  medical: {
    title: '🏥 MEDICAL EMERGENCY',
    body: 'Medical emergency reported. First aid team respond immediately.',
    vibrate: [600, 300, 600, 300, 600],
    tag: 'emergency-medical',
    urgency: 'high',
  },
  intruder: {
    title: '🚫 INTRUDER ALERT',
    body: 'Unknown intruder detected on campus. Initiate safety protocol.',
    vibrate: [200, 100, 200, 100, 200, 100, 2000, 200, 200, 100, 200],
    tag: 'emergency-intruder',
    urgency: 'critical',
  },
  allclear: {
    title: '✅ ALL CLEAR',
    body: 'Emergency resolved. Resume normal activities.',
    vibrate: [200, 100, 200],
    tag: 'emergency-allclear',
    urgency: 'normal',
  },
  custom: {
    title: '📢 SCHOOL ALERT',
    body: 'Important announcement from administration.',
    vibrate: [400, 200, 400],
    tag: 'emergency-custom',
    urgency: 'high',
  },
};

// Install event
self.addEventListener('install', (event) => {
  console.log('Push Service Worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Push Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Push event - receive push notification
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {
    title: 'Presence Notification',
    body: 'New attendance update',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'attendance-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // Check if this is an emergency alert
  const alertType = data.data?.alertType;
  if (alertType && ALERT_CONFIGS[alertType]) {
    const config = ALERT_CONFIGS[alertType];
    data.title = data.title || config.title;
    data.body = data.body || config.body;
    data.vibrate = config.vibrate;
    data.tag = config.tag;
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    renotify: true,
    vibrate: data.vibrate,
    data: data.data,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: true,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'dismiss') {
    return;
  }

  const urlToOpen = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (client.navigate) {
              return client.navigate(urlToOpen);
            }
            return client;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
});

// Background sync for offline notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  console.log('Syncing attendance data...');
}

// Message event for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Handle emergency alert from main thread
  if (event.data && event.data.type === 'EMERGENCY_ALERT') {
    const alertType = event.data.alertType || 'custom';
    const config = ALERT_CONFIGS[alertType] || ALERT_CONFIGS.custom;
    const customMessage = event.data.message;

    self.registration.showNotification(config.title, {
      body: customMessage || config.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: config.tag,
      renotify: true,
      vibrate: config.vibrate,
      requireInteraction: alertType !== 'allclear',
      silent: false,
      data: {
        url: '/admin',
        alertType: alertType,
        emergency: true,
      },
      actions: [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Acknowledge' }
      ],
    });
  }
});
