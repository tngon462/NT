// js/firebase-sync.js
(function () {
  function requireLogin() {
    const user = window.fbAuth?.currentUser;
    if (!user) throw new Error("Chưa đăng nhập Firebase");
    return user;
  }

  function docRefForUser(uid) {
    // users/{uid}/appState/main
    return window.fbDb.collection("users").doc(uid).collection("appState").doc("main");
  }

  // Lấy payload từ localStorage (đúng key app đang dùng)
  function getLocalPayload() {
    const raw = localStorage.getItem("nhatro_app_state_v1");
    return raw ? JSON.parse(raw) : null;
  }

  function setLocalPayload(payload) {
    localStorage.setItem("nhatro_app_state_v1", JSON.stringify(payload || {}));
  }

  // ⬆️ Upload local -> Cloud
  window.cloudSave = async function cloudSave() {
    const user = requireLogin();
    const payload = getLocalPayload() || {};
    await docRefForUser(user.uid).set(
      {
        payload,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtClient: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  };

  // ⬇️ Download Cloud -> local (ghi đè local)
  window.cloudLoad = async function cloudLoad() {
    const user = requireLogin();
    const snap = await docRefForUser(user.uid).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const payload = data.payload || {};
    setLocalPayload(payload);
    return payload;
  };

  // Auto-sync (debounce)
  let autoSyncEnabled = false;
  let t = null;

  window.setAutoSync = function setAutoSync(v) {
    autoSyncEnabled = !!v;
  };

  window.scheduleAutoSync = function scheduleAutoSync() {
    if (!autoSyncEnabled) return;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      window.cloudSave().catch(() => {});
    }, 1500);
  };
})();
