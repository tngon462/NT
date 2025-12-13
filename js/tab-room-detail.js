// js/tab-room-detail.js
// Màn chi tiết phòng: người thuê, thiết bị, chi phí, điện/nước, trả phòng
// V2: Cho phép thêm nhiều thiết bị giống nhau theo số lượng (deviceAssignments lưu theo "đơn vị" từng cái)

function renderRoomDetail(mainContent, appState, roomNumber) {
  const room = (appState.rooms || []).find((r) => r.number === roomNumber);
  if (!room) {
    mainContent.innerHTML = `<p>Không tìm thấy phòng ${roomNumber}.</p>`;
    return;
  }

  // Đảm bảo cấu trúc dữ liệu
  if (!Array.isArray(room.tenants)) room.tenants = [];
  if (!Array.isArray(room.costItems)) room.costItems = []; // {name, amountOverride, quantity}
  if (!appState.deviceAssignments) appState.deviceAssignments = [];
  if (!appState.devices) appState.devices = [];
  if (!appState.costs) appState.costs = [];
  if (!appState.meters) {
    appState.meters = {
      electricity: { lastReadings: {}, history: [] },
      water: { lastReadings: {}, history: [] },
    };
  }
  if (!appState.meters.electricity) appState.meters.electricity = { lastReadings: {}, history: [] };
  if (!appState.meters.water) appState.meters.water = { lastReadings: {}, history: [] };

  const numTenants = room.tenants.length;
  const hasTenants = numTenants > 0;

  // ==== Thiết bị trong phòng (V2: gom nhóm theo deviceId) ====
  const allAssignments = appState.deviceAssignments || [];
  const allDevices = appState.devices || [];

  const roomAssignments = allAssignments.filter((a) => String(a.roomNumber) === String(roomNumber));

  // map deviceId -> qty
  const qtyByDeviceId = {};
  roomAssignments.forEach((a) => {
    const id = a.deviceId;
    if (!id) return;
    qtyByDeviceId[id] = (qtyByDeviceId[id] || 0) + 1;
  });

  const roomDevices = Object.entries(qtyByDeviceId).map(([deviceId, qty]) => {
    const dev = allDevices.find((d) => d.id === deviceId);
    return {
      deviceId,
      name: dev ? dev.name : "(Thiết bị không tồn tại)",
      qty: Number(qty || 0),
      totalQty: dev && dev.totalQty != null ? Number(dev.totalQty) : 0,
      note: dev ? dev.note : "",
    };
  });

  // Remaining map (tính theo tổng số assignment toàn hệ thống)
  const deviceRemainingMap = {};
  allDevices.forEach((d) => {
    const total = d.totalQty != null ? Number(d.totalQty) : 0;
    const used = allAssignments.filter((a) => a.deviceId === d.id).length; // mỗi assignment = 1 cái
    const remaining = total > 0 ? Math.max(total - used, 0) : Infinity;
    deviceRemainingMap[d.id] = { total, used, remaining };
  });

  // Available devices (V2: KHÔNG loại theo "đã có trong phòng", chỉ cần còn số lượng)
  const availableDevicesForRoom = allDevices.filter((d) => {
    if (!d.id) return false;
    const info = deviceRemainingMap[d.id];
    if (!info) return true;
    if (info.total > 0 && info.remaining <= 0) return false;
    return true;
  });

  // ==== Chi phí áp dụng cho phòng ====
  const allCosts = appState.costs;
  const roomCostNames = new Set(room.costItems.map((c) => c.name));
  const availableCostsForRoom = allCosts.filter((c) => !roomCostNames.has(c.name));

  // ==== Điện / nước: helper lấy lần chốt gần nhất ====
  function getLastMeterInfo(type) {
    const meter = appState.meters[type] || { lastReadings: {}, history: [] };
    const lastRead =
      meter.lastReadings && meter.lastReadings[roomNumber] != null ? meter.lastReadings[roomNumber] : null;

    let lastHistory = null;
    if (Array.isArray(meter.history)) {
      for (let i = meter.history.length - 1; i >= 0; i--) {
        const h = meter.history[i];
        if (h.roomNumber === roomNumber) {
          lastHistory = h;
          break;
        }
      }
    }
    return { lastRead, lastHistory };
  }

  const elecInfo = getLastMeterInfo("electricity");
  const waterInfo = getLastMeterInfo("water");

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  // ==== RENDER HTML CHÍNH ====
  mainContent.innerHTML = `
    <div class="room-detail-header">
      <button class="back-to-rooms-btn" id="back-to-rooms-btn">
        &larr; Quay lại danh sách phòng
      </button>
      <h3>Phòng ${room.number} - Chi tiết</h3>
      <span></span>
    </div>

    <div class="room-basic-info">
      <div><b>Giá phòng:</b> ${room.price ? room.price.toLocaleString() + " đ" : "Chưa đặt"}</div>
      <div><b>Số người đang ở:</b> ${numTenants}</div>

      <div style="margin-top:6px; font-size:13px;">
        <b>NGÀY VÀO PHÒNG:</b>
        <input id="movein-date-input" type="date"
          value="${room.moveInDate || ""}"
          style="padding:4px; margin-left:6px;"
        />
        <button id="save-movein-btn" style="padding:4px 10px; margin-left:6px; font-size:12px;">
          Lưu
        </button>
        <span id="movein-msg" style="margin-left:8px; font-size:12px;"></span>
      </div>

      <div style="font-size:12px; color:#6b7280; margin-top:4px;">
        Thông tin người thuê sẽ dùng để tính các loại chi phí theo đơn vị (ví dụ: rác theo số người).
      </div>
    </div>

    <!-- Người thuê trong phòng -->
    <div class="tenants-section">
      <h4>Người thuê trong phòng</h4>

      <div style="margin-bottom:6px;">
        ${
          hasTenants
            ? `<span style="font-size:13px; color:#4b5563;">
                 Phòng hiện đang có người thuê. Mặc định ẩn form nhập, chỉ hiển thị danh sách.
                 Nhấn nút "Thêm người thuê" nếu cần thêm người mới.
               </span>`
            : `<span style="font-size:13px; color:#4b5563;">
                 Phòng hiện đang trống. Nhập thông tin người thuê mới bên dưới.
               </span>`
        }
      </div>

      <div style="margin-bottom:8px;">
        <button id="toggle-tenant-form-btn" style="padding:6px 10px; font-size:13px;">
          ${hasTenants ? "➕ Thêm người thuê" : "Ẩn/hiện form người thuê"}
        </button>
      </div>

      <div id="tenant-form-container" style="${hasTenants ? "display:none;" : ""}">
        <div class="tenant-form-row">
          <label>Họ và tên (bắt buộc)</label>
          <input id="tenant-name-input" type="text" placeholder="VD: Nguyễn Văn A">
        </div>

        <div class="tenant-form-row" style="display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <label>Giới tính</label>
            <select id="tenant-gender-select" style="width:100%; padding:6px;">
              <option value="">-- Chọn --</option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
              <option value="...">...</option>
            </select>
            <input id="tenant-gender-custom" type="text" placeholder="Nhập giới tính..." style="width:100%; padding:6px; margin-top:6px; display:none;">
          </div>
          <div style="flex:1; min-width:160px;">
            <label>Ngày sinh</label>
            <input id="tenant-dob-input" type="date" style="width:100%; padding:6px;">
          </div>
        </div>

        <div class="tenant-form-row" style="display:flex; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:220px;">
            <label>Mối quan hệ với chủ phòng</label>
            <select id="tenant-rel-select" style="width:100%; padding:6px;">
              <option value="">-- Chọn --</option>
              <option value="Chủ phòng">Chủ phòng</option>
              <option value="Vợ">Vợ</option>
              <option value="Chồng">Chồng</option>
              <option value="Con">Con</option>
              <option value="Bố">Bố</option>
              <option value="Mẹ">Mẹ</option>
              <option value="Bạn">Bạn</option>
              <option value="Anh chị em">Anh chị em</option>
              <option value="Khác">Khác</option>
              <option value="...">...</option>
            </select>
            <input id="tenant-rel-custom" type="text" placeholder="Nhập mối quan hệ..." style="width:100%; padding:6px; margin-top:6px; display:none;">
          </div>
          <div style="flex:1; min-width:160px; display:flex; align-items:flex-end; gap:8px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:#111827;">
              <input id="tenant-owner-checkbox" type="checkbox" style="transform:scale(1.1);">
              Chủ phòng (mỗi phòng chỉ 1)
            </label>
          </div>
        </div>

        <div class="tenant-form-row">
          <label>Địa chỉ hiện tại</label>
          <input id="tenant-address-input" type="text" placeholder="VD: Matsuyama, Ehime...">
        </div>

        <div class="tenant-form-row">
          <label>Quê quán</label>
          <input id="tenant-hometown-input" type="text" placeholder="VD: Nghệ An, Huế...">
        </div>

        <div class="tenant-form-row">
          <label>Số điện thoại</label>
          <input id="tenant-phone-input" type="text" placeholder="VD: 080-xxxx-xxxx">
        </div>

        <div class="tenant-form-row">
          <label>Ghi chú</label>
          <textarea id="tenant-note-input" rows="2" placeholder="VD: Làm ca đêm, hay về trễ..."></textarea>
        </div>

        <button id="add-tenant-btn">+ Thêm người thuê</button>
        <div id="tenant-add-msg"></div>
      </div>

      <div class="tenant-list">
        <h4 style="margin-top:12px;">Danh sách người thuê</h4>
        ${
          room.tenants.length === 0
            ? `<p>Chưa có người thuê nào được thêm cho phòng này.</p>`
            : room.tenants
                .map(
                  (t, idx) => `
            <div class="tenant-card">
              <div class="tenant-info">
                <b>${t.fullName || "(Chưa có tên)"}</b>
                ${t.isOwner ? `<span style="margin-left:6px; font-size:11px; padding:2px 6px; border-radius:999px; background:#fde68a; color:#92400e;">Chủ phòng</span>` : ""}
                <br>
                ${t.gender ? `👤 ${t.gender}<br>` : ""}
                ${t.dob ? `🎂 ${t.dob}<br>` : ""}
                ${t.relationship ? `🔗 ${t.relationship}<br>` : ""}
                ${t.phone ? `📞 ${t.phone}<br>` : ""}
                ${t.address ? `🏠 ${t.address}<br>` : ""}
                ${t.hometown ? `🌏 Quê quán: ${t.hometown}<br>` : ""}
                ${t.note ? `<span>📝 ${t.note}</span>` : ""}
              </div>
              <div class="tenant-actions">
                <button class="remove-tenant-btn" data-tenant-index="${idx}">
                  Xóa
                </button>
              </div>
            </div>
          `
                )
                .join("")
        }
      </div>
    </div>

    <!-- Thiết bị trong phòng (V2) -->
    <div class="room-section" style="margin-top:16px;">
      <h4>Thiết bị trong phòng</h4>

      ${
        roomDevices.length === 0
          ? `<p style="font-size:13px;">Chưa có thiết bị nào được gắn cho phòng này.</p>`
          : `
        <table style="width:100%; font-size:13px; margin-top:8px; border-collapse:collapse;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:left;">Thiết bị</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:90px; text-align:right;">SL</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:220px; text-align:right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${roomDevices
              .map((d) => {
                const info = deviceRemainingMap[d.deviceId] || { total: 0, remaining: Infinity };
                const remainText =
                  info.total > 0 ? ` (còn ${info.remaining}/${info.total})` : ` (không giới hạn)`;
                return `
                  <tr>
                    <td style="padding:6px; border:1px solid #e5e7eb;">
                      <b>${d.name}</b>
                      <span style="font-size:12px; color:#6b7280;">${remainText}</span>
                    </td>
                    <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">
                      <b>${d.qty}</b>
                    </td>
                    <td style="padding:6px; border:1px solid #e5e7eb; text-align:right; white-space:nowrap;">
                      <button class="dev-minus-btn" data-device-id="${d.deviceId}" style="padding:4px 10px; font-size:12px;">-1</button>
                      <button class="dev-plus-btn" data-device-id="${d.deviceId}" style="padding:4px 10px; font-size:12px;">+1</button>
                      <button class="dev-remove-all-btn" data-device-id="${d.deviceId}" style="padding:4px 10px; font-size:12px;">Xóa hết</button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }

      <button id="toggle-device-form-btn" style="padding:6px 10px; margin-top:10px;">
        ➕ Thêm thiết bị
      </button>

      <div id="device-form-container" style="display:none; margin-top:10px;">
        <label>Chọn thiết bị:</label><br>
        <select id="room-device-select" style="width:260px; padding:6px; margin-top:4px;">
          <option value="">-- Chọn thiết bị --</option>
          ${
            availableDevicesForRoom.length === 0
              ? `<option value="">(Không còn thiết bị phù hợp)</option>`
              : availableDevicesForRoom
                  .map((d) => {
                    const info = deviceRemainingMap[d.id] || { total: 0, remaining: Infinity };
                    const statusText =
                      info.total > 0 ? ` (còn ${info.remaining}/${info.total})` : " (không giới hạn)";
                    return `<option value="${d.id}">${d.name || "(Không tên)"}${statusText}</option>`;
                  })
                  .join("")
          }
        </select>

        <span style="margin-left:10px; font-size:13px;">
          SL:
          <input id="room-device-qty" type="number" value="1" min="1"
            style="width:80px; padding:6px; margin-left:6px;">
        </span>

        <button id="room-add-device-btn" style="padding:6px 12px; font-size:13px; margin-left:10px;">
          ✔ Thêm
        </button>

        <div id="room-device-msg" style="margin-top:6px; font-size:12px;"></div>
      </div>
    </div>

    <!-- Các khoản phí áp dụng cho phòng -->
    <div class="room-section" style="margin-top:16px;">
      <h4>Các khoản phí áp dụng cho phòng</h4>
      <p style="font-size:13px; color:#4b5563; margin-bottom:6px;">
        Đơn giá mặc định lấy từ tab Chi phí. Ở đây sếp có thể sửa đơn giá riêng cho phòng này
        mà không ảnh hưởng tới giá mặc định toàn hệ thống. Có thể nhập số lượng để ra thành tiền.
      </p>

      ${
        room.costItems.length === 0
          ? `<p style="font-size:13px;">Chưa gắn khoản phí nào cho phòng.</p>`
          : `
        <table style="width:100%; font-size:13px; margin-bottom:8px; border-collapse:collapse;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:4px;">Tên phí</th>
              <th style="padding:4px;">Đơn giá dùng cho phòng</th>
              <th style="padding:4px;">Số lượng</th>
              <th style="padding:4px;">Đơn vị</th>
              <th style="padding:4px;">Thành tiền</th>
              <th style="padding:4px;">Xử lý</th>
            </tr>
          </thead>
          <tbody>
            ${room.costItems
              .map((ci) => {
                const base = allCosts.find((c) => c.name === ci.name) || {};
                const baseAmount = base.amount != null ? Number(base.amount) : 0;
                const unit = base.unit || "";

                const quantity =
                  ci.quantity != null && !isNaN(Number(ci.quantity)) ? Number(ci.quantity) : 1;

                const appliedPrice =
                  ci.amountOverride != null && !isNaN(ci.amountOverride) ? Number(ci.amountOverride) : baseAmount;

                const total = appliedPrice * quantity;

                return `
                  <tr>
                    <td style="padding:4px;">${ci.name}</td>
                    <td style="padding:4px;">
                      <div style="font-size:11px; color:#6b7280;">
                        Mặc định: ${
                          baseAmount > 0
                            ? baseAmount.toLocaleString() + (unit ? " / " + unit : "")
                            : "(chưa đặt)"
                        }
                      </div>
                      <div style="margin-top:2px;">
                        <input
                          type="number"
                          class="room-cost-override-input"
                          data-cost-name="${ci.name}"
                          value="${appliedPrice > 0 ? appliedPrice : ""}"
                          style="width:110px; padding:3px; font-size:12px;"
                          placeholder="= dùng mặc định"
                        >
                        <span style="font-size:11px; color:#4b5563; margin-left:4px;">
                          (Đang tính: ${appliedPrice > 0 ? appliedPrice.toLocaleString() : "0"}${
                  unit ? " / " + unit : ""
                })
                        </span>
                      </div>
                    </td>
                    <td style="padding:4px;">
                      <input
                        type="number"
                        class="room-cost-qty-input"
                        data-cost-name="${ci.name}"
                        value="${quantity}"
                        style="width:70px; padding:3px; font-size:12px;"
                        min="0"
                      >
                    </td>
                    <td style="padding:4px;">${unit || "-"}</td>
                    <td style="padding:4px;">
                      <b>${total.toLocaleString()}</b>
                    </td>
                    <td style="padding:4px;">
                      <button 
                        class="remove-room-cost-btn"
                        data-cost-name="${ci.name}"
                        style="padding:2px 8px; font-size:11px;"
                      >Xóa</button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      `
      }

      <button id="toggle-cost-form-btn" style="padding:6px 10px;">
        ➕ Thêm khoản phí
      </button>

      <div id="cost-form-container" style="display:none; margin-top:10px;">
        <label>Chọn loại phí:</label><br>
        <select id="room-cost-select" style="width:260px; padding:6px; margin-top:4px;">
          <option value="">-- Chọn loại phí --</option>
          ${
            availableCostsForRoom.length === 0
              ? `<option value="">(Không còn phí nào để thêm)</option>`
              : availableCostsForRoom
                  .map((c) => {
                    const unit = c.unit || "";
                    const amt = c.amount != null ? `${c.amount.toLocaleString()}` : "0";
                    return `<option value="${c.name}">
                      ${c.name} - ${amt}${unit ? " / " + unit : ""}
                    </option>`;
                  })
                  .join("")
          }
        </select>

        <button id="room-add-cost-btn" style="padding:6px 12px; margin-left:6px;">
          ✔ Thêm
        </button>

        <div id="room-cost-msg" style="margin-top:4px; font-size:12px;"></div>
      </div>
    </div>

    <!-- Điện / Nước phòng này -->
    <div class="room-section" style="margin-top:16px;">
      <h4>Điện / nước của phòng này</h4>
      <div id="room-meter-msg" style="margin-bottom:6px; font-size:12px;"></div>

      <div style="display:flex; flex-wrap:wrap; gap:16px;">
        <div style="flex:1; min-width:260px;">
          <h5 style="margin-bottom:4px;">⚡ Điện</h5>
          <div style="font-size:12px; color:#4b5563; margin-bottom:4px;">
            Lần chốt gần nhất:
            ${
              elecInfo.lastHistory
                ? `Kỳ ${elecInfo.lastHistory.period}, ngày ${elecInfo.lastHistory.date || ""}, dùng ${
                    elecInfo.lastHistory.used
                  } (từ ${elecInfo.lastHistory.prev} → ${elecInfo.lastHistory.curr})`
                : "Chưa có lịch sử chốt điện cho phòng này."
            }
          </div>
          <div style="font-size:12px; color:#4b5563; margin-bottom:4px;">
            Số công tơ đang lưu: ${elecInfo.lastRead != null ? elecInfo.lastRead : 0}
          </div>

          <div style="margin-top:4px; font-size:13px;">
            <label>Kỳ chốt (tháng):</label><br>
            <input id="elec-period-room" type="month" value="${defaultMonth}" style="padding:4px; margin-bottom:4px;">
            <br>
            <label>Ngày chốt số:</label><br>
            <input id="elec-date-room" type="date" value="${defaultDate}" style="padding:4px; margin-bottom:4px;">
            <br>
            <label>Số trước:</label><br>
            <input type="number" value="${elecInfo.lastRead != null ? elecInfo.lastRead : 0}" disabled
              style="padding:4px; margin-bottom:4px; width:120px; background:#f3f4f6;">
            <br>
            <label>Số hiện tại:</label><br>
            <input id="elec-current-room" type="number" style="padding:4px; margin-bottom:6px; width:120px;">
            <br>
            <button id="save-elec-room-btn" style="padding:4px 10px; font-size:13px;">
              💾 Chốt điện phòng này
            </button>
          </div>
        </div>

        <div style="flex:1; min-width:260px;">
          <h5 style="margin-bottom:4px;">💧 Nước</h5>
          <div style="font-size:12px; color:#4b5563; margin-bottom:4px;">
            Lần chốt gần nhất:
            ${
              waterInfo.lastHistory
                ? `Kỳ ${waterInfo.lastHistory.period}, ngày ${waterInfo.lastHistory.date || ""}, dùng ${
                    waterInfo.lastHistory.used
                  } (từ ${waterInfo.lastHistory.prev} → ${waterInfo.lastHistory.curr})`
                : "Chưa có lịch sử chốt nước cho phòng này."
            }
          </div>
          <div style="font-size:12px; color:#4b5563; margin-bottom:4px;">
            Số công tơ đang lưu: ${waterInfo.lastRead != null ? waterInfo.lastRead : 0}
          </div>

          <div style="margin-top:4px; font-size:13px;">
            <label>Kỳ chốt (tháng):</label><br>
            <input id="water-period-room" type="month" value="${defaultMonth}" style="padding:4px; margin-bottom:4px;">
            <br>
            <label>Ngày chốt số:</label><br>
            <input id="water-date-room" type="date" value="${defaultDate}" style="padding:4px; margin-bottom:4px;">
            <br>
            <label>Số trước:</label><br>
            <input type="number" value="${waterInfo.lastRead != null ? waterInfo.lastRead : 0}" disabled
              style="padding:4px; margin-bottom:4px; width:120px; background:#f3f4f6;">
            <br>
            <label>Số hiện tại:</label><br>
            <input id="water-current-room" type="number" style="padding:4px; margin-bottom:6px; width:120px;">
            <br>
            <button id="save-water-room-btn" style="padding:4px 10px; font-size:13px;">
              💾 Chốt nước phòng này
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Hóa đơn + Trả phòng -->
    <div class="invoice-section" style="margin-top:16px;">
      <h4>Hóa đơn & trả phòng</h4>
      <p style="font-size:13px; color:#4b5563;">
        Phần này dùng để tạo hóa đơn cho phòng và xử lý trả phòng (chốt điện, nước, phí...).
      </p>

      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-top:8px;">
        <div>
          <button id="create-invoice-btn">+ Tạo hóa đơn cho phòng ${room.number}</button>
          <div id="invoice-msg" style="margin-top:6px; font-size:13px;"></div>
        </div>
        <div style="margin-left:auto; text-align:right;">
          <button class="room-checkout-btn" id="checkout-room-btn">
            ⏏ Trả phòng này
          </button>
          <div id="room-checkout-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </div>
    </div>
  `;

  // ==== EVENT HANDLERS ====

  // Quay lại danh sách phòng
  const backBtn = document.getElementById("back-to-rooms-btn");
  backBtn.onclick = () => {
    if (window.setView) window.setView("rooms");
  };

  // ===== NGÀY VÀO PHÒNG: lưu moveInDate =====
  const moveInInput = document.getElementById("movein-date-input");
  const saveMoveInBtn = document.getElementById("save-movein-btn");
  const moveInMsg = document.getElementById("movein-msg");

  if (saveMoveInBtn && moveInInput) {
    saveMoveInBtn.onclick = () => {
      const v = (moveInInput.value || "").trim();
      room.moveInDate = v || null;
      if (window.saveAppState) window.saveAppState();
      moveInMsg.style.color = "#16a34a";
      moveInMsg.innerText = "Đã lưu.";
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  }

  // Toggle form người thuê
  const toggleFormBtn = document.getElementById("toggle-tenant-form-btn");
  const tenantFormContainer = document.getElementById("tenant-form-container");
  toggleFormBtn.onclick = () => {
    tenantFormContainer.style.display =
      tenantFormContainer.style.display === "none" || tenantFormContainer.style.display === ""
        ? "block"
        : "none";
  };

  // Thêm người thuê
  const nameInput = document.getElementById("tenant-name-input");
  const genderSelect = document.getElementById("tenant-gender-select");
  const genderCustom = document.getElementById("tenant-gender-custom");
  const dobInput = document.getElementById("tenant-dob-input");
  const relSelect = document.getElementById("tenant-rel-select");
  const relCustom = document.getElementById("tenant-rel-custom");
  const ownerCheckbox = document.getElementById("tenant-owner-checkbox");
  const addressInput = document.getElementById("tenant-address-input");
  const hometownInput = document.getElementById("tenant-hometown-input");
  const phoneInput = document.getElementById("tenant-phone-input");
  const noteInput = document.getElementById("tenant-note-input");
  const addTenantBtn = document.getElementById("add-tenant-btn");
  const tenantMsg = document.getElementById("tenant-add-msg");

  function pickSelectOrCustom(selEl, customEl) {
    const v = (selEl?.value || "").trim();
    if (v === "...") return (customEl?.value || "").trim();
    return v;
  }

  // dropdown ... => hiện ô nhập thủ công
  if (genderSelect && genderCustom) {
    genderSelect.onchange = () => {
      if (genderSelect.value === "...") {
        genderCustom.style.display = "block";
        genderCustom.focus();
      } else {
        genderCustom.style.display = "none";
        genderCustom.value = "";
      }
    };
  }
  if (relSelect && relCustom) {
    relSelect.onchange = () => {
      if (relSelect.value === "...") {
        relCustom.style.display = "block";
        relCustom.focus();
      } else {
        relCustom.style.display = "none";
        relCustom.value = "";
      }
    };
  }

  addTenantBtn.onclick = () => {
    const fullName = nameInput.value.trim();
    if (!fullName) {
      tenantMsg.style.color = "#b91c1c";
      tenantMsg.innerText = "Họ và tên là bắt buộc.";
      return;
    }

    const gender = pickSelectOrCustom(genderSelect, genderCustom);
    const relationship = pickSelectOrCustom(relSelect, relCustom);
    const dob = (dobInput?.value || "").trim();
    const isOwner = !!ownerCheckbox?.checked;

    // enforce 1 chủ phòng
    if (isOwner) {
      (room.tenants || []).forEach((t) => (t.isOwner = false));
    }

    const newTenant = {
      fullName,
      gender,
      dob,
      relationship,
      isOwner,
      address: addressInput.value.trim(),
      hometown: hometownInput.value.trim(),
      phone: phoneInput.value.trim(),
      note: noteInput.value.trim(),
    };

    // nếu là người thuê đầu tiên và chưa có moveInDate -> set mặc định = hôm nay
    if ((room.tenants || []).length === 0 && !room.moveInDate) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      room.moveInDate = `${y}-${m}-${d}`;
    }

    room.tenants.push(newTenant);
    if (window.saveAppState) window.saveAppState();

    tenantMsg.style.color = "#16a34a";
    tenantMsg.innerText = `Đã thêm người thuê "${fullName}".`;

    nameInput.value = "";
    if (genderSelect) genderSelect.value = "";
    if (genderCustom) { genderCustom.value = ""; genderCustom.style.display = "none"; }
    if (dobInput) dobInput.value = "";
    if (relSelect) relSelect.value = "";
    if (relCustom) { relCustom.value = ""; relCustom.style.display = "none"; }
    if (ownerCheckbox) ownerCheckbox.checked = false;
    addressInput.value = "";
    hometownInput.value = "";
    phoneInput.value = "";
    noteInput.value = "";

    renderRoomDetail(mainContent, appState, roomNumber);
  };

  // Xóa người thuê
  mainContent.querySelectorAll(".remove-tenant-btn").forEach((btn) => {
    const idx = Number(btn.getAttribute("data-tenant-index"));
    btn.onclick = () => {
      room.tenants.splice(idx, 1);
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Toggle form thiết bị
  const toggleDeviceFormBtn = document.getElementById("toggle-device-form-btn");
  const deviceFormContainer = document.getElementById("device-form-container");
  toggleDeviceFormBtn.onclick = () => {
    deviceFormContainer.style.display =
      deviceFormContainer.style.display === "none" || deviceFormContainer.style.display === ""
        ? "block"
        : "none";
  };

  // Thiết bị (V2): -1
  mainContent.querySelectorAll(".dev-minus-btn").forEach((btn) => {
    const deviceId = btn.getAttribute("data-device-id");
    btn.onclick = () => {
      const idx = appState.deviceAssignments.findIndex(
        (a) => String(a.roomNumber) === String(roomNumber) && String(a.deviceId) === String(deviceId)
      );
      if (idx !== -1) {
        appState.deviceAssignments.splice(idx, 1);
        if (window.saveAppState) window.saveAppState();
        renderRoomDetail(mainContent, appState, roomNumber);
      }
    };
  });

  // Thiết bị (V2): +1
  mainContent.querySelectorAll(".dev-plus-btn").forEach((btn) => {
    const deviceId = btn.getAttribute("data-device-id");
    btn.onclick = () => {
      const info = deviceRemainingMap[deviceId];
      if (info && info.total > 0 && info.remaining <= 0) {
        alert("Thiết bị này đã hết số lượng để gắn.");
        return;
      }
      appState.deviceAssignments.push({ deviceId, roomNumber });
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Thiết bị (V2): xóa hết
  mainContent.querySelectorAll(".dev-remove-all-btn").forEach((btn) => {
    const deviceId = btn.getAttribute("data-device-id");
    btn.onclick = () => {
      const ok = confirm("Xóa toàn bộ thiết bị này khỏi phòng?");
      if (!ok) return;
      appState.deviceAssignments = appState.deviceAssignments.filter(
        (a) => !(String(a.roomNumber) === String(roomNumber) && String(a.deviceId) === String(deviceId))
      );
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Thiết bị (V2): thêm theo số lượng
  const roomDeviceSelect = document.getElementById("room-device-select");
  const roomDeviceQty = document.getElementById("room-device-qty");
  const roomAddDeviceBtn = document.getElementById("room-add-device-btn");
  const roomDeviceMsg = document.getElementById("room-device-msg");

  roomAddDeviceBtn.onclick = () => {
    const deviceId = roomDeviceSelect.value;
    if (!deviceId) {
      roomDeviceMsg.style.color = "#b91c1c";
      roomDeviceMsg.innerText = "Vui lòng chọn thiết bị để gắn.";
      return;
    }

    let qty = Number(roomDeviceQty.value || 1);
    if (Number.isNaN(qty) || qty < 1) qty = 1;

    const info = deviceRemainingMap[deviceId];
    if (info && info.total > 0 && info.remaining <= 0) {
      roomDeviceMsg.style.color = "#b91c1c";
      roomDeviceMsg.innerText = "Thiết bị này đã hết số lượng để gắn.";
      return;
    }

    // nếu có giới hạn total, clamp theo remaining
    if (info && info.total > 0) {
      qty = Math.min(qty, info.remaining);
      if (qty <= 0) {
        roomDeviceMsg.style.color = "#b91c1c";
        roomDeviceMsg.innerText = "Thiết bị này đã hết số lượng để gắn.";
        return;
      }
    }

    for (let i = 0; i < qty; i++) {
      appState.deviceAssignments.push({ deviceId, roomNumber });
    }
    if (window.saveAppState) window.saveAppState();

    roomDeviceMsg.style.color = "#16a34a";
    roomDeviceMsg.innerText = `Đã gắn thiết bị (${qty} cái) cho phòng.`;

    renderRoomDetail(mainContent, appState, roomNumber);
  };

  // Toggle form chi phí
  const toggleCostFormBtn = document.getElementById("toggle-cost-form-btn");
  const costFormContainer = document.getElementById("cost-form-container");
  toggleCostFormBtn.onclick = () => {
    costFormContainer.style.display =
      costFormContainer.style.display === "none" || costFormContainer.style.display === ""
        ? "block"
        : "none";
  };

  // Phí: thêm
  const roomCostSelect = document.getElementById("room-cost-select");
  const roomAddCostBtn = document.getElementById("room-add-cost-btn");
  const roomCostMsg = document.getElementById("room-cost-msg");

  roomAddCostBtn.onclick = () => {
    const name = roomCostSelect.value;
    if (!name) {
      roomCostMsg.style.color = "#b91c1c";
      roomCostMsg.innerText = "Vui lòng chọn loại phí để gắn.";
      return;
    }

    if (room.costItems.some((ci) => ci.name === name)) {
      roomCostMsg.style.color = "#b91c1c";
      roomCostMsg.innerText = "Khoản phí này đã gắn cho phòng rồi.";
      return;
    }

    room.costItems.push({
      name,
      amountOverride: null,
      quantity: 1,
    });
    if (window.saveAppState) window.saveAppState();

    roomCostMsg.style.color = "#16a34a";
    roomCostMsg.innerText = `Đã gắn phí "${name}" cho phòng.`;

    renderRoomDetail(mainContent, appState, roomNumber);
  };

  // Phí: xóa
  mainContent.querySelectorAll(".remove-room-cost-btn").forEach((btn) => {
    const name = btn.getAttribute("data-cost-name");
    btn.onclick = () => {
      room.costItems = room.costItems.filter((ci) => ci.name !== name);
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Phí: lưu đơn giá riêng cho phòng
  mainContent.querySelectorAll(".room-cost-override-input").forEach((inp) => {
    const name = inp.getAttribute("data-cost-name");
    inp.onchange = () => {
      const ci = room.costItems.find((c) => c.name === name);
      if (!ci) return;

      const v = inp.value.trim();
      if (v === "") {
        ci.amountOverride = null;
      } else {
        const num = Number(v);
        if (isNaN(num) || num < 0) {
          const base = allCosts.find((c) => c.name === name) || {};
          const baseAmount = base.amount != null ? Number(base.amount) : 0;
          const applied =
            ci.amountOverride != null && !isNaN(ci.amountOverride) ? Number(ci.amountOverride) : baseAmount;
          inp.value = applied > 0 ? applied : "";
          return;
        }
        ci.amountOverride = num;
      }
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Phí: lưu số lượng
  mainContent.querySelectorAll(".room-cost-qty-input").forEach((inp) => {
    const name = inp.getAttribute("data-cost-name");
    inp.onchange = () => {
      const ci = room.costItems.find((c) => c.name === name);
      if (!ci) return;

      const num = Number(inp.value || "0");
      if (isNaN(num) || num < 0) {
        inp.value = ci.quantity != null ? ci.quantity : 1;
        return;
      }
      ci.quantity = num;
      if (window.saveAppState) window.saveAppState();
      renderRoomDetail(mainContent, appState, roomNumber);
    };
  });

  // Chốt điện cho phòng
  const roomMeterMsg = document.getElementById("room-meter-msg");
  const elecPeriodInput = document.getElementById("elec-period-room");
  const elecDateInput = document.getElementById("elec-date-room");
  const elecCurrentInput = document.getElementById("elec-current-room");
  const elecSaveBtn = document.getElementById("save-elec-room-btn");

  elecSaveBtn.onclick = () => {
    const period = elecPeriodInput.value || defaultMonth;
    const date = elecDateInput.value || defaultDate;
    const currStr = elecCurrentInput.value.trim();

    const meter = appState.meters.electricity;
    const prev =
      meter.lastReadings && meter.lastReadings[roomNumber] != null ? Number(meter.lastReadings[roomNumber]) : 0;

    if (!currStr) {
      roomMeterMsg.style.color = "#b91c1c";
      roomMeterMsg.innerText = "Chưa nhập số điện hiện tại.";
      return;
    }

    const curr = Number(currStr);
    if (isNaN(curr) || curr < prev) {
      roomMeterMsg.style.color = "#b91c1c";
      roomMeterMsg.innerText = "Số điện hiện tại không hợp lệ (nhỏ hơn số trước).";
      return;
    }

    const used = curr - prev;
    meter.history = meter.history || [];
    meter.history.push({ period, date, roomNumber, prev, curr, used });

    meter.lastReadings = meter.lastReadings || {};
    meter.lastReadings[roomNumber] = curr;

    if (window.saveAppState) window.saveAppState();

    roomMeterMsg.style.color = "#16a34a";
    roomMeterMsg.innerText = `Đã chốt số điện: dùng ${used} (từ ${prev} → ${curr}).`;

    renderRoomDetail(mainContent, appState, roomNumber);
  };

  // Chốt nước cho phòng
  const waterPeriodInput = document.getElementById("water-period-room");
  const waterDateInput = document.getElementById("water-date-room");
  const waterCurrentInput = document.getElementById("water-current-room");
  const waterSaveBtn = document.getElementById("save-water-room-btn");

  waterSaveBtn.onclick = () => {
    const period = waterPeriodInput.value || defaultMonth;
    const date = waterDateInput.value || defaultDate;
    const currStr = waterCurrentInput.value.trim();

    const meter = appState.meters.water;
    const prev =
      meter.lastReadings && meter.lastReadings[roomNumber] != null ? Number(meter.lastReadings[roomNumber]) : 0;

    if (!currStr) {
      roomMeterMsg.style.color = "#b91c1c";
      roomMeterMsg.innerText = "Chưa nhập số nước hiện tại.";
      return;
    }

    const curr = Number(currStr);
    if (isNaN(curr) || curr < prev) {
      roomMeterMsg.style.color = "#b91c1c";
      roomMeterMsg.innerText = "Số nước hiện tại không hợp lệ (nhỏ hơn số trước).";
      return;
    }

    const used = curr - prev;
    meter.history = meter.history || [];
    meter.history.push({ period, date, roomNumber, prev, curr, used });

    meter.lastReadings = meter.lastReadings || {};
    meter.lastReadings[roomNumber] = curr;

    if (window.saveAppState) window.saveAppState();

    roomMeterMsg.style.color = "#16a34a";
    roomMeterMsg.innerText = `Đã chốt số nước: dùng ${used} (từ ${prev} → ${curr}).`;

    renderRoomDetail(mainContent, appState, roomNumber);
  };

  // Tạo hóa đơn
  const createInvoiceBtn = document.getElementById("create-invoice-btn");
  if (createInvoiceBtn) {
    createInvoiceBtn.onclick = () => {
      if (!window.openInvoiceForRoom) {
        alert("Thiếu invoice.js (window.openInvoiceForRoom).");
        return;
      }
      window.openInvoiceForRoom(roomNumber, appState);
    };
  }

  // Trả phòng
  const checkoutBtn = document.getElementById("checkout-room-btn");
  const checkoutMsg = document.getElementById("room-checkout-msg");

  if (checkoutBtn) {
    checkoutBtn.onclick = () => {
      if (window.openCheckoutForRoom) {
        window.openCheckoutForRoom(roomNumber, appState);
        return;
      }

      if (window.startRoomCheckout) {
        window.startRoomCheckout(roomNumber, appState, checkoutMsg);
        return;
      }

      if (checkoutMsg) {
        checkoutMsg.style.color = "#6b7280";
        checkoutMsg.innerText = "Chức năng trả phòng chưa được bật (thiếu checkout.js).";
      } else {
        alert("Chức năng trả phòng chưa được bật (thiếu checkout.js).");
      }
    };
  }
} // đóng function renderRoomDetail

window.renderRoomDetail = renderRoomDetail;