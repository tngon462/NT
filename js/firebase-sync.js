// js/firebase-sync.js
(function () {
  // ===== LS keys =====
  const STORAGE_KEY = "nhatro_app_state_v1";
  const AUTO_KEY = "nhatro_cloud_autosync_v1";            // "1" | "0"
  const BASELINE_KEY = "nhatro_cloud_baseline_v1";        // last synced payload (string)
  const PENDING_KEY = "nhatro_cloud_pending_v1";          // JSON array

  function lsGet(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch {
      return d;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  }

  function requireLogin() {
    const user = window.fbAuth?.currentUser;
    if (!user) throw new Error("Chưa đăng nhập Firebase");
    return user;
  }

  function docRefForUser(uid) {
    // users/{uid}/appState/main
    return window.fbDb.collection("users").doc(uid).collection("appState").doc("main");
  }

  function getLocalPayload() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setLocalPayload(payload) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload || {}));
  }

  // ===== Pending changes (offline edits) =====
  function readPending() {
    try {
      const raw = lsGet(PENDING_KEY, "[]");
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function writePending(arr) {
    try {
      lsSet(PENDING_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }
  function addPending(entry) {
    const arr = readPending();
    arr.push(entry);
    // chặn phình quá lớn
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    writePending(arr);
  }
  function clearPending() {
    writePending([]);
  }

  // Tạo tóm tắt thay đổi dựa trên "baseline lastSynced" vs "current payload"
  function computeChangeSummary(baselinePayload, currentPayload) {
    const b = baselinePayload || {};
    const c = currentPayload || {};

    const keys = [
      "rooms",
      "costs",
      "devices",
      "deviceAssignments",
      "costUnitPrices",
      "meters",
      "invoices",
    ];

    const changed = [];

    for (const k of keys) {
      const bv = b[k];
      const cv = c[k];

      const bIsArr = Array.isArray(bv);
      const cIsArr = Array.isArray(cv);

      if (bIsArr || cIsArr) {
        const bl = bIsArr ? bv.length : 0;
        const cl = cIsArr ? cv.length : 0;
        if (JSON.stringify(bv || []) !== JSON.stringify(cv || [])) {
          changed.push(`${k}: ${bl} → ${cl}`);
        }
        continue;
      }

      // object / primitive
      if (JSON.stringify(bv ?? null) !== JSON.stringify(cv ?? null)) {
        changed.push(`${k}: đã thay đổi`);
      }
    }

    return changed;
  }

  function getBaselinePayload() {
    try {
      const raw = lsGet(BASELINE_KEY, "");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function setBaselinePayload(payload) {
    try {
      lsSet(BASELINE_KEY, JSON.stringify(payload || {}));
    } catch {}
  }

  // ===== Cloud save/load =====
  async function cloudSaveCore() {
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

    // save baseline + clear pending after successful upload
    setBaselinePayload(payload);
    clearPending();
    return true;
  }

  // ⬆️ Upload local -> Cloud
  window.cloudSave = async function cloudSave() {
    try {
      return await cloudSaveCore();
    } catch (e) {
      // nếu fail -> ghi pending (offline edits)
      const current = getLocalPayload() || {};
      const baseline = getBaselinePayload() || {};
      const summary = computeChangeSummary(baseline, current);

      addPending({
        at: new Date().toISOString(),
        reason: e?.message || String(e),
        summary,
      });

      throw e;
    }
  };

  // ⬇️ Download Cloud -> local (ghi đè local)
  window.cloudLoad = async function cloudLoad() {
    const user = requireLogin();
    const snap = await docRefForUser(user.uid).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const payload = data.payload || {};
    setLocalPayload(payload);

    // cập nhật baseline theo cloud vừa tải về
    setBaselinePayload(payload);
    clearPending();

    return payload;
  };

  // ===== Auto-sync (debounce) =====
  let autoSyncEnabled = lsGet(AUTO_KEY, "1") === "1"; // ✅ mặc định bật
  let t = null;

  window.getAutoSync = function getAutoSync() {
    return !!autoSyncEnabled;
  };

  window.setAutoSync = function setAutoSync(v) {
    autoSyncEnabled = !!v;
    lsSet(AUTO_KEY, autoSyncEnabled ? "1" : "0");
  };

  window.getPendingChanges = function getPendingChanges() {
    return readPending();
  };

  window.clearPendingChanges = function clearPendingChanges() {
    clearPending();
  };

  window.scheduleAutoSync = function scheduleAutoSync() {
    if (!autoSyncEnabled) return;
    if (t) clearTimeout(t);

    t = setTimeout(async () => {
      try {
        await cloudSaveCore();
      } catch (e) {
        // silent fail nhưng vẫn ghi pending
        const current = getLocalPayload() || {};
        const baseline = getBaselinePayload() || {};
        const summary = computeChangeSummary(baseline, current);
        addPending({
          at: new Date().toISOString(),
          reason: e?.message || String(e),
          summary,
        });
      }
    }, 1500);
  };

  // đảm bảo state đúng ngay khi load script (phòng trường hợp UI chưa set)
  try {
    window.setAutoSync(autoSyncEnabled);
  } catch {}
})();
