// Service Worker tối giản để kích hoạt tính năng cài đặt App (PWA) ngoài hiện trường
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Giữ luồng trống để đáp ứng tiêu chuẩn cài đặt của Chrome/Safari
});