// js/tab-devices.js
// renderDevices(mainContent, appState)

function renderDevices(mainContent, appState) {
  const devices = appState.devices;
  const rooms = appState.rooms;
  const assigns = appState.deviceAssignments;

  mainContent.innerHTML = `
    <h3>🧯 Thiết bị</h3>

    <div class="devices-section">
      <h4>Thêm thiết bị mới</h4>
      <div>
        <label>Tên thiết bị (bắt buộc)</label><br>
        <input id="device-name-input" type="text" placeholder="VD: Điều hòa, Tủ lạnh..." style="width:260px; padding:6px;">
      </div>

      <div style="margin-top:8px;">
        <label>Số lượng tổng</label><br>
        <input id="device-qty-input" type="number" placeholder="VD: 10" style="width:260px; padding:6px;">
      </div>

      <div style="margin-top:8px;">
        <label>Giá mới (tham khảo)</label><br>
        <input id="device-price-input" type="number" placeholder="VD: 12000000" style="width:260px; padding:6px;">
      </div>

      <div style="margin-top:8px;">
        <label>Ghi chú</label><br>
        <textarea id="device-note-input" rows="2" style="width:260px; padding:6px;" placeholder="VD: Hãng Daikin, mua năm 2024..."></textarea>
      </div>

      <div style="margin-top:10px;">
        <button id="add-device-btn" style="padding:8px 14px;">+ Thêm thiết bị</button>
      </div>
      <div id="device-add-msg" style="margin-top:8px; font-size:13px;"></div>
    </div>

    <div class="devices-section">
      <h4>Danh sách thiết bị</h4>
      ${
        devices.length === 0
          ? `<p>Chưa có thiết bị nào. Hãy thêm ở phần trên.</p>`
          : `
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px; text-align:left;">Thiết bị</th>
              <th style="padding:6px; text-align:left;">SL tổng</th>
              <th style="padding:6px; text-align:left;">Đã gắn</th>
              <th style="padding:6px; text-align:left;">Còn lại</th>
              <th style="padding:6px; text-align:left;">Gắn cho phòng</th>
            </tr>
          </thead>
          <tbody>
            ${devices
              .map((d) => {
                const assignedCount = assigns.filter(a => a.deviceId === d.id).length;
                const remain = d.totalQty - assignedCount;

                // Danh sách phòng chưa gắn thiết bị này
                const availableRooms = rooms.filter(room => {
                  const already = assigns.some(a => a.deviceId === d.id && a.roomNumber === room.number);
                  return !already;
                });

                let assignCellHtml = "";

                if (rooms.length === 0) {
                  assignCellHtml = `<em>Chưa có phòng nào</em>`;
                } else if (remain <= 0) {
                  assignCellHtml = `<em>Hết thiết bị</em>`;
                } else if (availableRooms.length === 0) {
                  assignCellHtml = `<em>Tất cả phòng đã gắn</em>`;
                } else {
                  assignCellHtml = `
                    <div class="device-assign-form" data-device-id="${d.id}">
                      <select class="assign-room-select" style="padding:4px;">
                        ${availableRooms
                          .map(r => `<option value="${r.number}">${r.number}</option>`)
                          .join("")}
                      </select>
                      <button type="button" class="assign-device-btn" style="margin-left:6px; padding:4px 8px;">Gắn</button>
                    </div>
                  `;
                }

                return `
                  <tr>
                    <td style="padding:6px;">
                      <b>${d.name}</b>
                      ${d.price ? `<span class="device-tag">${d.price.toLocaleString()} đ</span>` : ""}
                    </td>
                    <td style="padding:6px;">${d.totalQty}</td>
                    <td style="padding:6px;">${assignedCount}</td>
                    <td style="padding:6px;">${remain}</td>
                    <td style="padding:6px;">${assignCellHtml}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }
    </div>

    <div class="devices-section">
      <h4>Thiết bị đã gắn cho phòng</h4>
      ${
        assigns.length === 0
          ? `<p>Chưa gắn thiết bị nào cho phòng.</p>`
          : `
        <ul>
          ${assigns
            .map(a => {
              const device = devices.find(d => d.id === a.deviceId);
              if (!device) return "";
              return `
                <li>
                  ${device.name} → Phòng <b>${a.roomNumber}</b>
                  <button type="button" class="unassign-device-btn" data-device-id="${a.deviceId}" data-room-number="${a.roomNumber}" style="margin-left:8px; padding:2px 8px; font-size:11px; background:#ef4444;">
                    Bỏ gắn
                  </button>
                </li>
              `;
            })
            .join("")}
        </ul>
      `
      }
    </div>
  `;

  // ===== SỰ KIỆN: THÊM THIẾT BỊ =====
  const nameInput = document.getElementById("device-name-input");
  const qtyInput = document.getElementById("device-qty-input");
  const priceInput = document.getElementById("device-price-input");
  const noteInput = document.getElementById("device-note-input");
  const addBtn = document.getElementById("add-device-btn");
  const msg = document.getElementById("device-add-msg");

  addBtn.onclick = () => {
    const name = nameInput.value.trim();
    const qtyStr = qtyInput.value.trim();
    const priceStr = priceInput.value.trim();
    const note = noteInput.value.trim();

    if (!name) {
      msg.style.color = "#b91c1c";
      msg.innerText = "Tên thiết bị là bắt buộc.";
      return;
    }

    const qty = Number(qtyStr || "0");
    if (isNaN(qty) || qty <= 0) {
      msg.style.color = "#b91c1c";
      msg.innerText = "Số lượng phải > 0.";
      return;
    }

    let price = 0;
    if (priceStr) {
      const num = Number(priceStr);
      if (isNaN(num) || num < 0) {
        msg.style.color = "#b91c1c";
        msg.innerText = "Giá không hợp lệ.";
        return;
      }
      price = num;
    }

    // Tạo id đơn giản
    const newId = Date.now().toString(36) + Math.random().toString(16).slice(2);

    appState.devices.push({
      id: newId,
      name,
      totalQty: qty,
      price,
      note,
    });

    nameInput.value = "";
    qtyInput.value = "";
    priceInput.value = "";
    noteInput.value = "";

    msg.style.color = "#16a34a";
    msg.innerText = `Đã thêm thiết bị "${name}".`;

    if (window.saveAppState) window.saveAppState();
    renderDevices(mainContent, appState);
  };

  // ===== SỰ KIỆN: GẮN THIẾT BỊ CHO PHÒNG =====
  const assignForms = mainContent.querySelectorAll(".device-assign-form");
  assignForms.forEach(form => {
    const deviceId = form.getAttribute("data-device-id");
    const select = form.querySelector(".assign-room-select");
    const btn = form.querySelector(".assign-device-btn");

    btn.onclick = () => {
      const roomNumber = select.value;
      if (!roomNumber) return;

      // Kiểm tra trùng
      const exists = appState.deviceAssignments.some(
        a => a.deviceId === deviceId && a.roomNumber === roomNumber
      );
      if (exists) return;

      appState.deviceAssignments.push({
        deviceId,
        roomNumber,
      });

      if (window.saveAppState) window.saveAppState();
      renderDevices(mainContent, appState);
    };
  });

  // ===== SỰ KIỆN: BỎ GẮN THIẾT BỊ =====
  const unassignBtns = mainContent.querySelectorAll(".unassign-device-btn");
  unassignBtns.forEach(btn => {
    const deviceId = btn.getAttribute("data-device-id");
    const roomNumber = btn.getAttribute("data-room-number");

    btn.onclick = () => {
      appState.deviceAssignments = appState.deviceAssignments.filter(
        a => !(a.deviceId === deviceId && a.roomNumber === roomNumber)
      );
      if (window.saveAppState) window.saveAppState();
      renderDevices(mainContent, appState);
    };
  });
}

window.renderDevices = renderDevices;