// js/firebase-init.js
(function () {
  if (!window.firebaseConfig) {
    console.error("Thiếu firebaseConfig. Kiểm tra js/firebase-config.js");
    return;
  }

  // Init
  firebase.initializeApp(window.firebaseConfig);

  // Services
  window.fbAuth = firebase.auth();
  window.fbDb = firebase.firestore();

  // Offline cache (web) - nếu trình duyệt hỗ trợ
  try {
    window.fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {}

  console.log("Firebase init OK");
})();
