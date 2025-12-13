// js/tab-settings.js
// renderSettings(mainContent, appState)

// index phòng đang sửa (null = đang thêm mới)
let editingRoomIndex = null;

function renderSettings(mainContent, appState) {
  const rooms = appState.rooms || [];
  const devices = appState.devices || [];
  const deviceAssignments = appState.deviceAssignments || [];

  // Phòng đang sửa (nếu có)
  let editingRoom = null;
  if (editingRoomIndex !== null && rooms[editingRoomIndex]) {
    editingRoom = rooms[editingRoomIndex];
  }

  // Tính số còn lại của từng thiết bị
  const deviceWithRemain = devices.map((d) => {
    const usedCount = deviceAssignments.filter((a) => a.deviceId === d.id).length;
    const total = d.totalQty != null ? Number(d.totalQty) : 0;
    const remaining = total > 0 ? Math.max(total - usedCount, 0) : 0;
    return {
      ...d,
      usedCount,
      total,
      remaining,
    };
  });

  // Thiết bị đang gắn cho phòng đang sửa
  const assignedDeviceIdsForEditing =
    editingRoom && editingRoom.number
      ? deviceAssignments
          .filter((a) => a.roomNumber === editingRoom.number)
          .map((a) => a.deviceId)
      : [];

  const devicesHtml =
    deviceWithRemain.length === 0
      ? `<p style="font-size:13px; color:#6b7280;">
           Chưa có thiết bị nào. Vào tab <b>Thiết bị</b> để khai báo trước.
         </p>`
      : `
      <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
        ${deviceWithRemain
          .map((d) => {
            const isChecked = editingRoom
              ? assignedDeviceIdsForEditing.includes(d.id)
              : false;

            // Nếu đã hết số lượng thì không cho chọn mới, nhưng nếu phòng này đang dùng thì vẫn giữ được
            const disabled = d.total > 0 && d.remaining === 0 && !isChecked;

            const statusText =
              d.total > 0
                ? `(Còn ${d.remaining}/${d.total})`
                : `(Chưa đặt tổng số lượng, cho phép gắn không giới hạn)`;

            return `
              <label style="font-size:13px; color:#374151;">
                <input
                  type="checkbox"
                  class="room-device-checkbox"
                  value="${d.id}"
                  ${isChecked ? "checked" : ""}
                  ${disabled ? "disabled" : ""}
                  style="margin-right:4px;"
                >
                ${d.name || "(Thiết bị không tên)"} 
                <span style="color:#6b7280; margin-left:4px;">
                  ${disabled ? "(Hết số lượng)" : statusText}
                </span>
              </label>
            `;
          })
          .join("")}
      </div>
    `;

  // form thêm/sửa phòng: mặc định ẩn, nhưng nếu đang sửa thì auto hiện
  const showForm = editingRoom != null;

  mainContent.innerHTML = `
    <h3>⚙️ Cài đặt</h3>

    <div class="settings-section">
      <h4>Phòng</h4>
      <button id="toggle-add-room-form-btn" style="padding:6px 12px; font-size:13px; margin-top:4px;">
        ${showForm ? "Ẩn khung phòng" : "Thêm phòng mới"}
      </button>

      <div id="add-room-form-container" style="margin-top:8px; ${showForm ? "" : "display:none;"}">
        <h5 style="margin-bottom:6px;">
          ${editingRoom ? `Sửa phòng ${editingRoom.number}` : "Thêm phòng mới"}
        </h5>

        <div>
          <label>Số phòng (bắt buộc)</label><br>
          <input id="room-number-input" type="text" placeholder="VD: 101" style="width:200px; padding:6px;"
                 value="${editingRoom ? editingRoom.number : ""}">
        </div>
        <div style="margin-top:8px;">
          <label>Giá phòng (bắt buộc)</label><br>
          <input id="room-price-input" type="number" placeholder="VD: 5000000" style="width:200px; padding:6px;"
                 value="${editingRoom && editingRoom.price != null ? editingRoom.price : ""}">
        </div>

        <div style="margin-top:10px;">
          <label>Thiết bị cố định trong phòng (tùy chọn)</label>
          <div style="font-size:12px; color:#6b7280; margin-top:2px;">
            Chọn các thiết bị sẽ gắn cố định cho phòng này. Thiết bị chỉ gắn được cho số phòng
            tối đa bằng tổng số lượng đã khai báo trong tab <b>Thiết bị</b>.
          </div>
          <div id="room-devices-list">
            ${devicesHtml}
          </div>
        </div>

        <div style="margin-top:10px;">
          <button id="add-room-btn" style="padding:8px 14px;">
            ${editingRoom ? "💾 Lưu thông tin phòng" : "+ Thêm phòng"}
          </button>
          ${
            editingRoom
              ? `<button id="cancel-edit-room-btn" style="padding:8px 10px; margin-left:6px; font-size:13px;">
                   Hủy sửa
                 </button>`
              : ""
          }
        </div>
        <div id="room-add-msg" style="margin-top:8px; font-size:13px;"></div>
      </div>
    </div>

    <div class="settings-section">
      <h4>Danh sách phòng hiện có</h4>
      ${
        rooms.length === 0
          ? `<p>Chưa có phòng nào.</p>`
          : `
        <ul>
          ${rooms
            .map(
              (r, idx) =>
                `<li>
                   Phòng ${r.number} - Giá: ${r.price.toLocaleString()} đ
                   <button class="edit-room-btn" data-room-index="${idx}" style="margin-left:8px; padding:2px 8px; font-size:11px;">
                     Sửa
                   </button>
                 </li>`
            )
            .join("")}
        </ul>
      `
      }
    </div>

    <div class="settings-section">
      <h4>Nhập dữ liệu ban đầu (Excel)</h4>
      <p style="font-size:13px; color:#4b5563; margin-top:6px;">
        Dùng khi nhập dữ liệu lần đầu. App sẽ đọc file Excel (.xlsx) và tự tạo phòng, thiết bị cố định, cũng như thông tin người thuê.
      </p>

      <div style="display:grid; grid-template-columns: 1fr; gap:12px; margin-top:10px;">
        <div style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
          <div style="font-weight:700; margin-bottom:6px;">1) Import phòng + thiết bị cố định</div>
          <div style="font-size:12px; color:#6b7280; margin-bottom:6px;">
            Cột bắt buộc: <b>roomNumber</b>, <b>price</b>. Thiết bị cố định: <b>devices</b> (các tên thiết bị ngăn bằng dấu phẩy).
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input id="import-rooms-file" type="file" accept=".xlsx" />
            <button id="import-rooms-btn" style="padding:6px 12px; font-size:13px;">⬆ Import file phòng</button>
            <a href="#" id="download-room-template" style="font-size:13px;">Tải file mẫu</a>
          </div>
          <div id="import-rooms-msg" style="margin-top:8px; font-size:13px;"></div>
        </div>

        <div style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
          <div style="font-weight:700; margin-bottom:6px;">2) Import người thuê (theo phòng)</div>
          <div style="font-size:12px; color:#6b7280; margin-bottom:6px;">
            Mỗi người 1 dòng. Trùng <b>roomNumber</b> thì tự ghép chung phòng. Cột khuyến nghị: <b>fullName</b>, <b>gender</b>, <b>dob</b>, <b>hometown</b>, <b>relationship</b>, <b>isOwner</b>, <b>note</b>.
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input id="import-tenants-file" type="file" accept=".xlsx" />
            <button id="import-tenants-btn" style="padding:6px 12px; font-size:13px;">⬆ Import file người thuê</button>
            <a href="#" id="download-tenant-template" style="font-size:13px;">Tải file mẫu</a>
          </div>
          <div id="import-tenants-msg" style="margin-top:8px; font-size:13px;"></div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h4>Sao lưu dữ liệu</h4>
      <p style="font-size:13px; color:#4b5563;">
        Nhấn nút bên dưới để xuất toàn bộ dữ liệu (phòng, người thuê, chi phí, thiết bị, công tơ điện nước...)
        ra một file Excel (.xlsx). File sẽ được tải về thư mục <b>Downloads</b> của trình duyệt.
      </p>
      <button id="export-excel-btn" style="padding:8px 14px;">📁 Xuất dữ liệu ra Excel</button>
    </div>
    <div class="settings-section">
  <h4>☁️ Đồng bộ Cloud (Firebase)</h4>
  <p style="font-size:13px; color:#4b5563;">
    App vẫn chạy offline bằng dữ liệu trên máy. Khi có mạng, sếp có thể đồng bộ lên cloud hoặc tải dữ liệu từ cloud về máy.
  </p>

  <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
    <button id="cloud-save-btn" style="padding:8px 14px;">⬆️ Đồng bộ lên Cloud</button>
    <button id="cloud-load-btn" style="padding:8px 14px;">⬇️ Tải từ Cloud về</button>

    <label style="font-size:13px; color:#374151; display:flex; gap:6px; align-items:center;">
      <input type="checkbox" id="cloud-autosync-toggle">
      Tự đồng bộ khi có thay đổi
    </label>
  </div>

  <div id="cloud-msg" style="margin-top:8px; font-size:13px;"></div>
</div>
  `;

  // ===== Helpers (Excel) =====
  function hasXLSX() {
    return typeof XLSX !== "undefined" && XLSX?.utils;
  }
  function downloadXlsx(wb, filename) {
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function normStr(v) {
    return String(v == null ? "" : v).trim();
  }
  function splitCsvDevices(s) {
    return normStr(s)
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }
  function truthy(v) {
    const s = normStr(v).toLowerCase();
    return ["1","true","yes","y","x","chủ phòng","chu phong"].includes(s);
  }
  function makeDevId() {
    return "dev_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  const roomNumberInput = document.getElementById("room-number-input");
  const roomPriceInput = document.getElementById("room-price-input");
  const addRoomBtn = document.getElementById("add-room-btn");
  const roomAddMsg = document.getElementById("room-add-msg");

  // Toggle ẩn/hiện form
  const toggleBtn = document.getElementById("toggle-add-room-form-btn");
  const formContainer = document.getElementById("add-room-form-container");
  if (toggleBtn && formContainer) {
    toggleBtn.onclick = () => {
      const isHidden =
        formContainer.style.display === "none" ||
        formContainer.style.display === "";
      formContainer.style.display = isHidden ? "block" : "none";
      toggleBtn.innerText = isHidden ? "Ẩn khung phòng" : "Thêm phòng mới";
    };
  }

  // Thêm mới / Lưu sửa phòng
  addRoomBtn.onclick = () => {
    const number = roomNumberInput.value.trim();
    const priceStr = roomPriceInput.value.trim();

    if (!number || !priceStr) {
      roomAddMsg.style.color = "#b91c1c";
      roomAddMsg.innerText = "Vui lòng nhập đầy đủ số phòng và giá phòng.";
      return;
    }

    const price = Number(priceStr);
    if (isNaN(price) || price <= 0) {
      roomAddMsg.style.color = "#b91c1c";
      roomAddMsg.innerText = "Giá phòng không hợp lệ.";
      return;
    }

    const selectedCheckboxes = mainContent.querySelectorAll(
      ".room-device-checkbox:checked"
    );

    let assignedCount = 0;
    let skippedCount = 0;

    if (editingRoomIndex === null) {
      // ===== THÊM PHÒNG MỚI =====
      // Kiểm tra trùng số phòng
      if (appState.rooms.some((r) => r.number === number)) {
        roomAddMsg.style.color = "#b91c1c";
        roomAddMsg.innerText = "Phòng này đã tồn tại.";
        return;
      }

      // Thêm phòng
      appState.rooms.push({ number, price });

      // Gắn thiết bị cho phòng mới
      selectedCheckboxes.forEach((cb) => {
        const deviceId = cb.value;
        const dev = appState.devices.find((d) => d.id === deviceId);
        if (!dev) {
          skippedCount++;
          return;
        }

        const total = dev.totalQty != null ? Number(dev.totalQty) : 0;
        const used = appState.deviceAssignments.filter(
          (a) => a.deviceId === deviceId
        ).length;

        if (total > 0 && used >= total) {
          skippedCount++;
          return;
        }

        appState.deviceAssignments.push({
          deviceId,
          roomNumber: number,
        });
        assignedCount++;
      });

      roomAddMsg.style.color = "#16a34a";
      let msg = `Đã thêm phòng ${number}.`;
      if (assignedCount > 0) msg += ` Gắn ${assignedCount} thiết bị cho phòng này.`;
      if (skippedCount > 0)
        msg += ` (${skippedCount} thiết bị không gắn được do đã hết số lượng.)`;
      roomAddMsg.innerText = msg;

    } else {
      // ===== SỬA PHÒNG HIỆN CÓ =====
      const room = appState.rooms[editingRoomIndex];
      if (!room) {
        roomAddMsg.style.color = "#b91c1c";
        roomAddMsg.innerText = "Không tìm thấy phòng để sửa.";
        return;
      }

      const oldNumber = room.number;

      // Kiểm tra trùng số phòng (trừ chính nó)
      if (
        appState.rooms.some(
          (r, idx) => idx !== editingRoomIndex && r.number === number
        )
      ) {
        roomAddMsg.style.color = "#b91c1c";
        roomAddMsg.innerText = "Số phòng mới trùng với phòng khác.";
        return;
      }

      // Cập nhật số phòng & giá
      room.number = number;
      room.price = price;

      // Cập nhật deviceAssignments:
      // 1. Bỏ hết gán thiết bị cho phòng cũ
      let newAssignments = appState.deviceAssignments.filter(
        (a) => a.roomNumber !== oldNumber
      );

      // 2. Gắn lại theo checkbox (tôn trọng tổng số lượng)
      selectedCheckboxes.forEach((cb) => {
        const deviceId = cb.value;
        const dev = appState.devices.find((d) => d.id === deviceId);
        if (!dev) {
          skippedCount++;
          return;
        }

        const total = dev.totalQty != null ? Number(dev.totalQty) : 0;
        const usedNow = newAssignments.filter(
          (a) => a.deviceId === deviceId
        ).length;

        if (total > 0 && usedNow >= total) {
          skippedCount++;
          return;
        }

        newAssignments.push({
          deviceId,
          roomNumber: number,
        });
        assignedCount++;
      });

      appState.deviceAssignments = newAssignments;

      // Cập nhật số phòng trong công tơ (nếu đổi số phòng)
      if (number !== oldNumber && appState.meters) {
        const meters = appState.meters;

        ["electricity", "water"].forEach((key) => {
          const meter = meters[key];
          if (!meter) return;

          // lastReadings
          if (meter.lastReadings && meter.lastReadings[oldNumber] != null) {
            meter.lastReadings[number] = meter.lastReadings[oldNumber];
            delete meter.lastReadings[oldNumber];
          }

          // history
          if (Array.isArray(meter.history)) {
            meter.history.forEach((h) => {
              if (h.roomNumber === oldNumber) {
                h.roomNumber = number;
              }
            });
          }
        });
      }

      roomAddMsg.style.color = "#16a34a";
      let msg = `Đã cập nhật thông tin phòng ${number}.`;
      if (assignedCount > 0) msg += ` Gắn ${assignedCount} thiết bị.`;
      if (skippedCount > 0)
        msg += ` (${skippedCount} thiết bị không gắn được do đã hết số lượng.)`;
      roomAddMsg.innerText = msg;

      // Thoát chế độ sửa
      editingRoomIndex = null;
    }

    if (window.saveAppState) window.saveAppState();

    // Reset form
    roomNumberInput.value = "";
    roomPriceInput.value = "";
    const allCheckboxes = mainContent.querySelectorAll(".room-device-checkbox");
    allCheckboxes.forEach((cb) => (cb.checked = false));

    // render lại để danh sách phòng + trạng thái thiết bị cập nhật
    renderSettings(mainContent, appState);
  };

  // Nút Hủy sửa
  const cancelEditBtn = document.getElementById("cancel-edit-room-btn");
  if (cancelEditBtn) {
    cancelEditBtn.onclick = () => {
      editingRoomIndex = null;
      renderSettings(mainContent, appState);
    };
  }

  // Nút Sửa từng phòng trong danh sách
  const editRoomBtns = mainContent.querySelectorAll(".edit-room-btn");
  editRoomBtns.forEach((btn) => {
    const idx = Number(btn.getAttribute("data-room-index"));
    btn.onclick = () => {
      editingRoomIndex = idx;
      renderSettings(mainContent, appState);
    };
  });

  // Nút xuất Excel
  const exportBtn = document.getElementById("export-excel-btn");
  if (exportBtn && window.exportToExcel) {
    exportBtn.onclick = () => {
      window.exportToExcel();
    };
  }

  // ===== Import Excel: Rooms + Tenants =====
  const importRoomsFile = document.getElementById("import-rooms-file");
  const importRoomsBtn = document.getElementById("import-rooms-btn");
  const importRoomsMsg = document.getElementById("import-rooms-msg");
  const importTenantsFile = document.getElementById("import-tenants-file");
  const importTenantsBtn = document.getElementById("import-tenants-btn");
  const importTenantsMsg = document.getElementById("import-tenants-msg");
  const dlRoomTpl = document.getElementById("download-room-template");
  const dlTenantTpl = document.getElementById("download-tenant-template");

  function setMsg(el, ok, text) {
    if (!el) return;
    el.style.color = ok ? "#16a34a" : "#b91c1c";
    el.textContent = text;
  }

  function readFirstSheetToRows(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const sheetName = wb.SheetNames?.[0];
            if (!sheetName) return resolve([]);
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
            resolve(Array.isArray(rows) ? rows : []);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  function downloadRoomTemplate(e) {
    e?.preventDefault?.();
    if (!hasXLSX()) return alert("Chưa tải được thư viện XLSX (xlsx.full.min.js).");
    const wb = XLSX.utils.book_new();
    // ✅ File mẫu tiếng Việt (đồng bộ với import)
    const rows = [
      {
        "Số phòng": "201",
        "Giá phòng (tháng)": 5500000,
        "Danh sách thiết bị trong phòng": "Máy lạnh, Tủ lạnh, Giường",
      },
      {
        "Số phòng": "202",
        "Giá phòng (tháng)": 5200000,
        "Danh sách thiết bị trong phòng": "Máy lạnh, Giường",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Phòng");
    downloadXlsx(wb, "mau_import_phong_thietbi.xlsx");
  }

  function downloadTenantTemplate(e) {
    e?.preventDefault?.();
    if (!hasXLSX()) return alert("Chưa tải được thư viện XLSX (xlsx.full.min.js).");
    const wb = XLSX.utils.book_new();
    // ✅ File mẫu tiếng Việt (đồng bộ với import)
    const rows = [
      {
        "Số phòng": "201",
        "Họ và tên": "Nguyễn Văn A",
        "Giới tính": "Nam",
        "Ngày sinh": "1990-01-15",
        "Quê quán": "Nghệ An",
        "Mối quan hệ với chủ phòng": "Chủ phòng",
        "Là chủ phòng": 1,
        "Số điện thoại": "080-xxxx-xxxx",
        "Địa chỉ hiện tại": "Matsuyama, Ehime",
        "Ghi chú": "",
      },
      {
        "Số phòng": "201",
        "Họ và tên": "Nguyễn Thị B",
        "Giới tính": "Nữ",
        "Ngày sinh": "1992-05-20",
        "Quê quán": "Huế",
        "Mối quan hệ với chủ phòng": "Vợ",
        "Là chủ phòng": 0,
        "Số điện thoại": "",
        "Địa chỉ hiện tại": "",
        "Ghi chú": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Người thuê");
    downloadXlsx(wb, "mau_import_nguoi_thue.xlsx");
  }

  if (dlRoomTpl) dlRoomTpl.onclick = downloadRoomTemplate;
  if (dlTenantTpl) dlTenantTpl.onclick = downloadTenantTemplate;

  async function handleImportRooms() {
    if (!hasXLSX()) return alert("Chưa tải được thư viện XLSX (xlsx.full.min.js).");
    const file = importRoomsFile?.files?.[0];
    if (!file) return setMsg(importRoomsMsg, false, "Chọn file Excel trước đã.");
    setMsg(importRoomsMsg, true, "Đang đọc file...");

    try {
      const rows = await readFirstSheetToRows(file);
      if (!Array.isArray(rows) || rows.length === 0) {
        return setMsg(importRoomsMsg, false, "File rỗng hoặc không đọc được sheet.");
      }

      if (!Array.isArray(appState.rooms)) appState.rooms = [];
      if (!Array.isArray(appState.devices)) appState.devices = [];
      if (!Array.isArray(appState.deviceAssignments)) appState.deviceAssignments = [];

      // map name -> device
      const devByName = new Map(
        (appState.devices || []).map((d) => [normStr(d.name).toLowerCase(), d])
      );

      let addedRooms = 0;
      let updatedRooms = 0;
      let createdDevices = 0;
      let createdAssignments = 0;
      let skipped = 0;

      rows.forEach((raw) => {
        // Hỗ trợ cả header tiếng Anh lẫn tiếng Việt
        const roomNumber = normStr(
          raw.roomNumber || raw.number || raw.room || raw.phong || raw["Số phòng"] || raw["So phong"]
        );
        const price = Number(
          raw.price || raw.roomPrice || raw.gia || raw.giaPhong || raw["Giá phòng (tháng)"] || raw["Gia phong (thang)"] || 0
        );
        if (!roomNumber || !price || Number.isNaN(price) || price <= 0) {
          skipped++;
          return;
        }

        let room = (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
        if (!room) {
          room = { number: String(roomNumber), price: price, tenants: [] };
          appState.rooms.push(room);
          addedRooms++;
        } else {
          room.price = price;
          if (!Array.isArray(room.tenants)) room.tenants = [];
          updatedRooms++;
        }

        const devicesList = splitCsvDevices(
          raw.devices || raw.deviceNames || raw.thietbi || raw["Danh sách thiết bị trong phòng"] || raw["Danh sach thiet bi trong phong"] || ""
        );
        devicesList.forEach((deviceName) => {
          const key = normStr(deviceName).toLowerCase();
          if (!key) return;
          let dev = devByName.get(key);
          if (!dev) {
            dev = { id: makeDevId(), name: normStr(deviceName), totalQty: 0, price: 0, note: "" };
            appState.devices.push(dev);
            devByName.set(key, dev);
            createdDevices++;
          }

          // gắn 1 bản ghi assignment cho mỗi thiết bị (cho phép trùng để = nhiều cái giống nhau)
          appState.deviceAssignments.push({ deviceId: dev.id, roomNumber: String(roomNumber) });
          createdAssignments++;
        });
      });

      // cập nhật totalQty tối thiểu = số assignment của từng device (để còn theo dõi tồn)
      const cntByDev = {};
      (appState.deviceAssignments || []).forEach((a) => {
        cntByDev[a.deviceId] = (cntByDev[a.deviceId] || 0) + 1;
      });
      (appState.devices || []).forEach((d) => {
        const need = cntByDev[d.id] || 0;
        const curr = Number(d.totalQty || 0);
        if (need > curr) d.totalQty = need;
      });

      if (window.saveAppState) window.saveAppState();
      setMsg(
        importRoomsMsg,
        true,
        `Xong: thêm ${addedRooms} phòng, cập nhật ${updatedRooms} phòng, tạo ${createdDevices} thiết bị, gắn ${createdAssignments} thiết bị. (Bỏ qua ${skipped} dòng lỗi)`
      );
      renderSettings(mainContent, appState);
    } catch (e) {
      console.error(e);
      setMsg(importRoomsMsg, false, "Lỗi đọc file. Kiểm tra lại định dạng .xlsx và tên cột.");
    }
  }

  async function handleImportTenants() {
    if (!hasXLSX()) return alert("Chưa tải được thư viện XLSX (xlsx.full.min.js).");
    const file = importTenantsFile?.files?.[0];
    if (!file) return setMsg(importTenantsMsg, false, "Chọn file Excel trước đã.");
    setMsg(importTenantsMsg, true, "Đang đọc file...");

    try {
      const rows = await readFirstSheetToRows(file);
      if (!Array.isArray(rows) || rows.length === 0) {
        return setMsg(importTenantsMsg, false, "File rỗng hoặc không đọc được sheet.");
      }

      if (!Array.isArray(appState.rooms)) appState.rooms = [];

      let added = 0;
      let skipped = 0;
      let ownerFix = 0;

      // track owner per room
      const ownerByRoom = {};

      rows.forEach((raw) => {
        // Hỗ trợ cả header tiếng Anh lẫn tiếng Việt
        const roomNumber = normStr(raw.roomNumber || raw.room || raw.phong || raw["Số phòng"] || raw["So phong"]);
        const fullName = normStr(
          raw.fullName || raw.name || raw.hoten || raw.hoTen || raw["Họ và tên"] || raw["Ho va ten"]
        );
        if (!roomNumber || !fullName) {
          skipped++;
          return;
        }

        let room = (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
        if (!room) {
          // nếu chưa có phòng thì auto tạo phòng với giá = 0 (sếp có thể sửa sau)
          room = { number: String(roomNumber), price: 0, tenants: [] };
          appState.rooms.push(room);
        }
        if (!Array.isArray(room.tenants)) room.tenants = [];

        const isOwner = truthy(
          raw.isOwner ||
            raw.owner ||
            raw.chuPhong ||
            raw.chuphong ||
            raw["Là chủ phòng"] ||
            raw["La chu phong"] ||
            // cho phép người dùng ghi "Chủ phòng" ở cột quan hệ
            raw.relationship ||
            raw["Mối quan hệ với chủ phòng"] ||
            raw["Moi quan he voi chu phong"]
        );
        let finalIsOwner = isOwner;
        if (finalIsOwner) {
          if (ownerByRoom[roomNumber]) {
            finalIsOwner = false;
            ownerFix++;
          } else {
            ownerByRoom[roomNumber] = true;
            // clear any previous owner inside existing data
            room.tenants.forEach((t) => (t.isOwner = false));
          }
        }

        const t = {
          fullName,
          gender: normStr(raw.gender || raw["Giới tính"] || raw["Gioi tinh"]),
          dob: normStr(raw.dob || raw.birthday || raw.ngaysinh || raw["Ngày sinh"] || raw["Ngay sinh"]),
          hometown: normStr(raw.hometown || raw.queQuan || raw.quequan || raw["Quê quán"] || raw["Que quan"]),
          relationship: normStr(
            raw.relationship || raw.moiQuanHe || raw.moiquanhe || raw["Mối quan hệ với chủ phòng"] || raw["Moi quan he voi chu phong"]
          ),
          isOwner: finalIsOwner,
          phone: normStr(raw.phone || raw.sdt || raw["Số điện thoại"] || raw["So dien thoai"]),
          address: normStr(raw.address || raw.diachi || raw["Địa chỉ hiện tại"] || raw["Dia chi hien tai"]),
          note: normStr(raw.note || raw.ghiChu || raw.ghichu || raw["Ghi chú"] || raw["Ghi chu"]),
        };
        room.tenants.push(t);
        added++;
      });

      if (window.saveAppState) window.saveAppState();
      setMsg(
        importTenantsMsg,
        true,
        `Xong: thêm ${added} người thuê. (Bỏ qua ${skipped} dòng lỗi)${ownerFix ? ` • ${ownerFix} dòng bị bỏ chọn chủ phòng do mỗi phòng chỉ 1 chủ phòng.` : ""}`
      );
    } catch (e) {
      console.error(e);
      setMsg(importTenantsMsg, false, "Lỗi đọc file. Kiểm tra lại định dạng .xlsx và tên cột.");
    }
  }

  if (importRoomsBtn) importRoomsBtn.onclick = handleImportRooms;
  if (importTenantsBtn) importTenantsBtn.onclick = handleImportTenants;

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
  
  if (autoToggle) {
    autoToggle.onchange = () => {
      window.setAutoSync?.(autoToggle.checked);
      setCloudMsg(autoToggle.checked ? "Đã bật tự đồng bộ." : "Đã tắt tự đồng bộ.");
    };
  }
  
  if (btnSave) {
    btnSave.onclick = async () => {
      try {
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
}

window.renderSettings = renderSettings;
