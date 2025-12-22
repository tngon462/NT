  // ===== CLOUD SYNC (Firebase) =====
  const cloudMsg = document.getElementById("cloud-msg");
  const btnSave = document.getElementById("cloud-save-btn");
  const btnLoad = document.getElementById("cloud-load-btn");
  const autoToggle = document.getElementById("cloud-autosync-toggle");

  function setCloudMsg(txt, ok = true) {
    if (!cloudMsg) return;
    cloudMsg.style.color = ok ? "#059669" : "#dc2626";
    cloudMsg.innerText = txt || "";
  }

  function formatPendingList(pending) {
    if (!Array.isArray(pending) || pending.length === 0) return "";
    const last = pending.slice(-10); // show last 10
    let s = `Có ${pending.length} thay đổi đang chờ đồng bộ:\n`;
    last.forEach((p, idx) => {
      const time = (p.at || "").replace("T", " ").replace("Z", "");
      const sum = Array.isArray(p.summary) && p.summary.length ? p.summary.join(", ") : "(không rõ mục thay đổi)";
      s += `\n${idx + 1}) ${time}\n- ${sum}\n`;
    });
    if (pending.length > 10) s += `\n... (còn ${pending.length - 10} mục nữa)`;
    return s;
  }

  // ✅ mặc định bật autosync + sync trạng thái UI
  if (autoToggle) {
    const v = window.getAutoSync ? window.getAutoSync() : true;
    autoToggle.checked = !!v;
    window.setAutoSync?.(autoToggle.checked);

    autoToggle.onchange = () => {
      window.setAutoSync?.(autoToggle.checked);
      setCloudMsg(autoToggle.checked ? "Đã bật tự đồng bộ (mặc định)." : "Đã tắt tự đồng bộ.");
    };
  }

  // nếu đang có pending -> báo nhẹ trên UI
  try {
    const pending = window.getPendingChanges?.() || [];
    if (pending.length) {
      setCloudMsg(`⚠️ Có ${pending.length} thay đổi offline chưa lên cloud. Nhấn "Đồng bộ" để xem và xác nhận.`, false);
    }
  } catch {}

  if (btnSave) {
    btnSave.onclick = async () => {
      try {
        const pending = window.getPendingChanges?.() || [];
        if (pending.length) {
          const text = formatPendingList(pending);
          const ok = confirm(text + "\n\nCập nhật tất cả các thay đổi này lên cloud không?");
          if (!ok) {
            setCloudMsg("Đã hủy đồng bộ. Dữ liệu offline vẫn được giữ trên máy.", false);
            return;
          }
        }

        setCloudMsg("Đang đồng bộ lên cloud...");
        await window.cloudSave();
        setCloudMsg("✅ Đã đồng bộ lên cloud.");
      } catch (e) {
        setCloudMsg("❌ Đồng bộ thất bại: " + (e?.message || e), false);
      }
    };
  }

  if (btnLoad) {
    btnLoad.onclick = async () => {
      if (!confirm("Tải từ cloud sẽ ghi đè dữ liệu đang có trên máy. Tiếp tục?")) return;
      try {
        setCloudMsg("Đang tải dữ liệu từ cloud...");
        const payload = await window.cloudLoad();
        if (!payload) {
          setCloudMsg("Cloud chưa có dữ liệu để tải.", false);
          return;
        }
        window.loadAppState?.();
        window.setView?.("overview");
        setCloudMsg("✅ Đã tải dữ liệu từ cloud về máy.");
      } catch (e) {
        setCloudMsg("❌ Tải thất bại: " + (e?.message || e), false);
      }
    };
  }
