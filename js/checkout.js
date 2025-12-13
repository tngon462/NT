// js/checkout.js
// Trả phòng: review đầy đủ -> chốt điện/nước theo NGÀY CHỌN -> chỉnh sửa chi phí -> thêm phí tay
// -> xác nhận -> in phiếu A5 -> lưu hóa đơn trả phòng vào tab Hóa đơn -> clear tenant + set moveOutDate
// V2 FIX: Thiết bị trong phòng gom theo deviceId + qty (deviceAssignments mỗi dòng = 1 cái)

(function () {
  const BRAND = {
    titleCheckout: "PHIẾU THU TRẢ PHÒNG - NHÀ TRỌ THIỆP MẾN",
    phone: "0963 954 006",
    bankLine: "Cop-opBank: 2700 300 512 666 888/ NGUYỄN THỊ MẾN",
  };

  // ===== helpers =====
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function toISO10(v) {
    if (!v) return "";
    if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  function ymOf(v) {
    const s = toISO10(v);
    return s ? s.slice(0, 7) : "";
  }

  function firstDayOfMonth(ym) {
    return `${ym}-01`;
  }

  function lastDayOfMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m, 0);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  function daysBetweenInclusive(from, to) {
    const a = new Date(from + "T00:00:00");
    const b = new Date(to + "T00:00:00");
    const ms = b - a;
    if (ms < 0) return 0;
    return Math.floor(ms / 86400000) + 1;
  }

  function roundDown1000(v) {
    const n = Number(v || 0);
    if (Number.isNaN(n)) return 0;
    return Math.floor(n / 1000) * 1000;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtMoney(n) {
    const x = Number(n || 0);
    return Number.isNaN(x) ? "0" : x.toLocaleString();
  }

  function ensureState(appState) {
    if (!Array.isArray(appState.rooms)) appState.rooms = [];
    if (!Array.isArray(appState.costs)) appState.costs = [];
    if (!Array.isArray(appState.devices)) appState.devices = [];
    if (!Array.isArray(appState.deviceAssignments)) appState.deviceAssignments = [];
    if (!appState.costUnitPrices) {
      appState.costUnitPrices = {
        electricity: { price: 0, unit: "kWh" },
        water: { price: 0, unit: "m³" },
      };
    }
    if (!appState.meters) {
      appState.meters = {
        electricity: { lastReadings: {}, history: [] },
        water: { lastReadings: {}, history: [] },
      };
    }
    if (!appState.meters.electricity) appState.meters.electricity = { lastReadings: {}, history: [] };
    if (!appState.meters.water) appState.meters.water = { lastReadings: {}, history: [] };

    if (!Array.isArray(appState.invoices)) appState.invoices = [];
  }

  function getRoom(appState, roomNumber) {
    return (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
  }

  function getFirstTenantName(room) {
    if (!room || !Array.isArray(room.tenants) || room.tenants.length === 0) return "";
    return room.tenants[0]?.fullName || "";
  }

  // ===== meters =====
  function getMeterHistory(appState, type) {
    const meter = (appState.meters && appState.meters[type]) || {};
    return Array.isArray(meter.history) ? meter.history : [];
  }

  function getMeterRecordByDate(appState, type, roomNumber, dateISO) {
    const hist = getMeterHistory(appState, type);
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) === String(roomNumber) && h.date === dateISO) return h;
    }
    return null;
  }

  function getPrevReadingByDate(appState, type, roomNumber, dateISO) {
    const hist = getMeterHistory(appState, type);
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) !== String(roomNumber)) continue;
      if (!h.date) continue;
      if (h.date < dateISO) return Number(h.curr || 0);
    }
    return 0;
  }

  function addOrUpdateMeterByDate(appState, type, roomNumber, currValue, dateISO) {
    const meter = appState.meters[type];
    if (!Array.isArray(meter.history)) meter.history = [];
    if (!meter.lastReadings) meter.lastReadings = {};

    const period = ymOf(dateISO);
    const prev = getPrevReadingByDate(appState, type, roomNumber, dateISO);
    const curr = Number(currValue);
    const used = curr - prev;

    const existed = getMeterRecordByDate(appState, type, roomNumber, dateISO);
    if (existed) {
      existed.period = period;
      existed.date = dateISO;
      existed.prev = prev;
      existed.curr = curr;
      existed.used = used;
    } else {
      meter.history.push({
        period,
        date: dateISO,
        roomNumber: String(roomNumber),
        prev,
        curr,
        used,
      });
    }

    const lr = meter.lastReadings[String(roomNumber)];
    if (lr == null) meter.lastReadings[String(roomNumber)] = curr;
    else {
      if (dateISO >= todayISO()) meter.lastReadings[String(roomNumber)] = curr;
    }

    return { prev, curr, used };
  }

  // ===== tính tiền phòng =====
  function calcRentLine(room, fromDate, toDate) {
    const priceMonth = Number(room.price || 0);
    if (!priceMonth) return { name: "Tiền phòng", unitPrice: 0, qty: 1, unit: "tháng", total: 0, note: "" };

    const ym = ymOf(fromDate);
    const monthFirst = firstDayOfMonth(ym);
    const monthLast = lastDayOfMonth(ym);
    const daysInMonth = daysBetweenInclusive(monthFirst, monthLast);

    const stayDays = daysBetweenInclusive(fromDate, toDate);
    const isFullMonth = fromDate === monthFirst && toDate === monthLast;

    if (isFullMonth) {
      return { name: "Tiền phòng", unitPrice: priceMonth, qty: 1, unit: "tháng", total: priceMonth, note: "Ở đủ tháng" };
    }

    const pricePerDay = priceMonth / daysInMonth;
    const raw = pricePerDay * stayDays;
    const total = roundDown1000(raw);

    return {
      name: "Tiền phòng",
      unitPrice: roundDown1000(pricePerDay),
      qty: stayDays,
      unit: "ngày",
      total,
      note: `Tính theo ngày: ${stayDays}/${daysInMonth} ngày (làm tròn xuống 1,000đ)`,
    };
  }

  function buildRoomCostLines(room, appState, fromDate, toDate) {
    const lines = [];
    lines.push(calcRentLine(room, fromDate, toDate));

    const baseCosts = appState.costs || [];
    const items = Array.isArray(room.costItems) ? room.costItems : [];
    items.forEach((ci) => {
      const base = baseCosts.find((c) => c.name === ci.name) || {};
      const baseAmount = Number(base.amount || 0);
      const unit = base.unit || "";

      const unitPrice =
        ci.amountOverride != null && ci.amountOverride !== "" && !Number.isNaN(Number(ci.amountOverride))
          ? Number(ci.amountOverride)
          : baseAmount;

      const qty =
        ci.quantity != null && ci.quantity !== "" && !Number.isNaN(Number(ci.quantity))
          ? Number(ci.quantity)
          : 1;

      lines.push({
        name: ci.name,
        unitPrice,
        qty,
        unit,
        total: unitPrice * qty,
        note: "",
        isCustom: false,
        isMeter: false,
      });
    });

    return lines;
  }

  // ===== Modal =====
  function openModal(html) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,.35)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.innerHTML = `
      <div style="background:#fff; width:min(980px, 96vw); max-height:92vh; overflow:auto; border-radius:14px; padding:14px; box-shadow:0 10px 30px rgba(0,0,0,.25);">
        ${html}
      </div>
    `;
    document.body.appendChild(overlay);

    function close() {
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    return { close, overlay };
  }

  // ===== Print A5 =====
  function buildPrintA5Html({ title, room, fromDate, toDate, tenantName, lines, extraNotesLines }) {
    const sum = lines.reduce((a, l) => a + Number(l.total || 0), 0);

    const rows = lines
      .map((l, i) => {
        return `
          <tr>
            <td class="c-stt">${i + 1}</td>
            <td class="c-name">
              <div class="name">${escapeHtml(l.name)}</div>
              ${l.note ? `<div class="note">${escapeHtml(l.note)}</div>` : ""}
            </td>
            <td class="c-unitprice">${fmtMoney(l.unitPrice)}</td>
            <td class="c-qty">${fmtMoney(l.qty)}</td>
            <td class="c-unit">${escapeHtml(l.unit || "")}</td>
            <td class="c-total">${fmtMoney(l.total)}</td>
          </tr>
        `;
      })
      .join("");

    const extraBlock =
      extraNotesLines && extraNotesLines.length
        ? `
        <div class="extra">
          <div class="extra-title">Ghi chú / Thiết bị phát sinh</div>
          ${extraNotesLines.map((x) => `<div class="extra-line">- ${escapeHtml(x)}</div>`).join("")}
        </div>
      `
        : "";

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A5 portrait; margin: 8mm; }
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; }
    .toolbar { padding: 8px; border-bottom: 1px solid #ddd; display:flex; gap:8px; align-items:center; }
    .toolbar button { padding: 6px 10px; font-size: 12px; cursor:pointer; }
    .page { page-break-after: auto; }

    .header { text-align:center; margin-top: 4px; }
    .title { font-size: 15px; font-weight: 900; letter-spacing: .2px; }
    .sub { margin-top: 6px; font-size: 11px; line-height: 1.3; }

    .meta { margin-top: 10px; font-size: 12px; line-height: 1.4; }

    .tbl { width:100%; border-collapse:collapse; margin-top:10px; }
    .tbl th, .tbl td { border:1px solid #333; padding:4px; vertical-align:top; }
    .tbl th { background:#f2f2f2; }
    .c-stt { width:34px; text-align:center; }
    .c-unitprice, .c-qty, .c-total { width:80px; text-align:right; }
    .c-unit { width:45px; text-align:center; }
    .note { margin-top:2px; font-size:10px; color:#555; }

    .sum { margin-top:10px; }
    .sum-row { display:flex; justify-content:space-between; border:1px solid #333; padding:6px; }
    .sum-row .label { font-weight:900; }
    .sum-row .value { font-weight:900; font-size:13px; }

    .extra { margin-top:10px; border:1px dashed #555; padding:8px; }
    .extra-title { font-weight:900; margin-bottom:6px; }
    .extra-line { font-size:12px; margin:2px 0; }

    .sign { display:flex; justify-content:space-between; margin-top:16px; }
    .sig-col { width:45%; text-align:center; }
    .sig-title { font-weight:900; margin-bottom:28px; }
    .sig-line { border-top:1px solid #333; height:1px; }

    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In</button>
    <button onclick="window.close()">✖ Đóng</button>
    <span style="font-size:12px;color:#555;">A5 dọc</span>
  </div>

  <section class="page">
    <div class="header">
      <div class="title">${escapeHtml(title)}</div>
      <div class="sub">
        <div><b>SĐT:</b> ${escapeHtml(BRAND.phone)}</div>
        <div><b>STK:</b> ${escapeHtml(BRAND.bankLine)}</div>
      </div>
    </div>

    <div class="meta">
      <div><b>Phòng số:</b> ${escapeHtml(room.number)}</div>
      <div><b>Thời gian:</b> từ ${escapeHtml(fromDate)} đến ${escapeHtml(toDate)}</div>
      <div><b>Người thuê:</b> ${escapeHtml(tenantName || "(chưa có)")}</div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th class="c-stt">STT</th>
          <th class="c-name">Nội dung</th>
          <th class="c-unitprice">Đơn giá</th>
          <th class="c-qty">SL</th>
          <th class="c-unit">ĐV</th>
          <th class="c-total">Thành tiền</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${extraBlock}

    <div class="sum">
      <div class="sum-row">
        <div class="label">Tổng cộng</div>
        <div class="value">${fmtMoney(sum)} đ</div>
      </div>
    </div>

    <div class="sign">
      <div class="sig-col">
        <div class="sig-title">Người nộp</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-col">
        <div class="sig-title">Người thu</div>
        <div class="sig-line"></div>
      </div>
    </div>
  </section>
</body>
</html>
    `.trim();
  }

  function openPrintWindow(html) {
    const w = window.open("", "_blank");
    if (!w) {
      alert("Trình duyệt đang chặn pop-up. Cho phép pop-up để in phiếu.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ===== main checkout flow =====
  async function openCheckoutForRoom(roomNumber, appState) {
    ensureState(appState);

    const room = getRoom(appState, roomNumber);
    if (!room) return alert("Không tìm thấy phòng: " + roomNumber);

    const defaultMeterDate = todayISO();
    const fromDateDefault = toISO10(room.moveInDate) || firstDayOfMonth(ymOf(defaultMeterDate));

    // ==== DEVICES (V2 FIX) ====
    // deviceAssignments: [{deviceId, roomNumber}] mỗi dòng = 1 cái
    const roomAssigned = (appState.deviceAssignments || []).filter(
      (a) => String(a.roomNumber) === String(room.number)
    );

    const byId = {};
    roomAssigned.forEach((a) => {
      const id = a.deviceId;
      if (!id) return;
      byId[id] = (byId[id] || 0) + 1;
    });

    const devicesInRoom = Object.entries(byId).map(([deviceId, qty]) => {
      const dev = (appState.devices || []).find((d) => String(d.id) === String(deviceId));
      return {
        deviceId,
        deviceName: dev?.name || a?.deviceName || "(Thiết bị)",
        qty: Number(qty || 0),
      };
    });

    const tenantName = getFirstTenantName(room);

    // Modal review
    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">🚪 Trả phòng ${escapeHtml(room.number)}</h3>
        <button id="co-close" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:10px; display:grid; gap:12px;">
        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Thông tin phòng / người thuê</div>
          <div style="font-size:13px; line-height:1.5;">
            <div><b>Phòng:</b> ${escapeHtml(room.number)}</div>
            <div><b>Giá phòng:</b> ${fmtMoney(room.price)} đ / tháng</div>
            <div><b>Ngày vào phòng:</b> ${escapeHtml(toISO10(room.moveInDate) || "(chưa có)")}</div>
            <div><b>Người thuê:</b> ${escapeHtml(tenantName || "(chưa có)")}</div>
          </div>
          <div style="margin-top:8px;">
            <label style="font-size:13px;"><b>Ghi chú khác (tùy chọn):</b></label><br>
            <textarea id="co-note" rows="2" style="width:100%; padding:8px;" placeholder="VD: chìa khóa, vệ sinh, đồ thất lạc..."></textarea>
          </div>
        </section>

        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Thiết bị trong phòng (gom nhóm theo SL)</div>
          ${
            devicesInRoom.length
              ? `
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                  <thead>
                    <tr style="background:#f3f4f6;">
                      <th style="border:1px solid #e5e7eb; padding:6px;">Thiết bị</th>
                      <th style="border:1px solid #e5e7eb; padding:6px; width:90px;">SL</th>
                      <th style="border:1px solid #e5e7eb; padding:6px; width:190px;">Tình trạng</th>
                      <th style="border:1px solid #e5e7eb; padding:6px; width:140px;">Chi phí</th>
                      <th style="border:1px solid #e5e7eb; padding:6px;">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody id="co-dev-body"></tbody>
                </table>
              `
              : `<div style="font-size:13px; color:#6b7280;">Phòng này chưa gắn thiết bị nào.</div>`
          }
        </section>

        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Điện / nước (chốt khi trả phòng)</div>

          <div style="margin-bottom:10px;">
            <label style="font-size:13px;"><b>Ngày chốt điện/nước:</b></label><br>
            <input id="co-meter-date" type="date" style="padding:8px; width:180px;">
            <span style="font-size:12px; color:#6b7280;">(mặc định hôm nay, có thể sửa)</span>
          </div>

          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            <div style="flex:1; min-width:260px;">
              <div style="font-weight:800;">⚡ Điện</div>
              <div id="co-elec-meta" style="font-size:12px; color:#6b7280; margin:4px 0 8px;"></div>
              <label style="font-size:13px;">Số hiện tại:</label><br>
              <input id="co-elec-curr" type="number" style="padding:8px; width:180px;" placeholder="nhập số...">
              <div style="margin-top:6px; font-size:12px;">
                Đơn giá: <b id="co-elec-price"></b>
                • Số dùng: <b id="co-elec-used">-</b>
                • Tiền: <b id="co-elec-money">0</b>
              </div>
            </div>

            <div style="flex:1; min-width:260px;">
              <div style="font-weight:800;">💧 Nước</div>
              <div id="co-water-meta" style="font-size:12px; color:#6b7280; margin:4px 0 8px;"></div>
              <label style="font-size:13px;">Số hiện tại:</label><br>
              <input id="co-water-curr" type="number" style="padding:8px; width:180px;" placeholder="nhập số...">
              <div style="margin-top:6px; font-size:12px;">
                Đơn giá: <b id="co-water-price"></b>
                • Số dùng: <b id="co-water-used">-</b>
                • Tiền: <b id="co-water-money">0</b>
              </div>
            </div>
          </div>
        </section>

        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Các chi phí (giống hóa đơn) — có thể sửa tay</div>

          <div style="overflow:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="border:1px solid #e5e7eb; padding:6px; width:44px;">STT</th>
                  <th style="border:1px solid #e5e7eb; padding:6px;">Nội dung</th>
                  <th style="border:1px solid #e5e7eb; padding:6px; width:120px;">Đơn giá</th>
                  <th style="border:1px solid #e5e7eb; padding:6px; width:90px;">SL</th>
                  <th style="border:1px solid #e5e7eb; padding:6px; width:80px;">ĐV</th>
                  <th style="border:1px solid #e5e7eb; padding:6px; width:130px;">Thành tiền</th>
                  <th style="border:1px solid #e5e7eb; padding:6px; width:60px;">Xóa</th>
                </tr>
              </thead>
              <tbody id="co-cost-body"></tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
            <button id="co-add-line" style="padding:8px 12px;">➕ Thêm khoản khác</button>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <div style="font-weight:900; font-size:16px;">Tổng cộng: <span id="co-sum">0</span> đ</div>
          </div>
        </section>

        <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
          <button id="co-confirm" style="padding:10px 14px; font-weight:900;">✅ Xác nhận trả phòng</button>
        </div>

        <div id="co-msg" style="margin-top:6px; font-size:12px;"></div>
      </div>
    `);

    document.getElementById("co-close").onclick = close;

    // ===== Render thiết bị trong phòng =====
    if (devicesInRoom.length) {
      const devBody = document.getElementById("co-dev-body");
      devBody.innerHTML = devicesInRoom
        .map((d, idx) => {
          return `
            <tr data-idx="${idx}">
              <td style="border:1px solid #e5e7eb; padding:6px;">${escapeHtml(d.deviceName)}</td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:right;"><b>${Number(d.qty || 0)}</b></td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <select class="dev-status" style="width:100%; padding:6px;">
                  <option value="">(trống)</option>
                  <option value="hỏng">hỏng</option>
                  <option value="sửa chữa">sửa chữa</option>
                  <option value="khác">khác</option>
                </select>
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="dev-fee" type="number" value="" style="width:120px; padding:6px;" placeholder="0">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="dev-note" type="text" value="" style="width:100%; padding:6px;" placeholder="ghi chú...">
              </td>
            </tr>
          `;
        })
        .join("");
    }

    // ===== meters context =====
    const meterDateInput = document.getElementById("co-meter-date");
    const elecCurrInput = document.getElementById("co-elec-curr");
    const waterCurrInput = document.getElementById("co-water-curr");
    const elecUsedEl = document.getElementById("co-elec-used");
    const waterUsedEl = document.getElementById("co-water-used");
    const elecMoneyEl = document.getElementById("co-elec-money");
    const waterMoneyEl = document.getElementById("co-water-money");
    const elecMeta = document.getElementById("co-elec-meta");
    const waterMeta = document.getElementById("co-water-meta");

    const elecPrice = Number(appState.costUnitPrices?.electricity?.price || 0);
    const waterPrice = Number(appState.costUnitPrices?.water?.price || 0);
    const elecUnit = appState.costUnitPrices?.electricity?.unit || "kWh";
    const waterUnit = appState.costUnitPrices?.water?.unit || "m³";

    document.getElementById("co-elec-price").textContent = `${fmtMoney(elecPrice)} / ${escapeHtml(elecUnit)}`;
    document.getElementById("co-water-price").textContent = `${fmtMoney(waterPrice)} / ${escapeHtml(waterUnit)}`;

    meterDateInput.value = defaultMeterDate;

    let elecPrev = 0;
    let waterPrev = 0;

    // ===== costs table =====
    const costBody = document.getElementById("co-cost-body");
    const sumEl = document.getElementById("co-sum");
    const addLineBtn = document.getElementById("co-add-line");

    const lines = [];

    function ensureMeterLines() {
      if (!lines.some((x) => x._meterType === "electricity")) {
        lines.push({
          name: "Tiền điện",
          unitPrice: elecPrice,
          qty: 0,
          unit: elecUnit,
          total: 0,
          note: "Chốt theo số công tơ trả phòng",
          _meterType: "electricity",
        });
      }
      if (!lines.some((x) => x._meterType === "water")) {
        lines.push({
          name: "Tiền nước",
          unitPrice: waterPrice,
          qty: 0,
          unit: waterUnit,
          total: 0,
          note: "Chốt theo số công tơ trả phòng",
          _meterType: "water",
        });
      }
    }

    function rebuildBaseLinesByDates(fromDate, toDate) {
      const custom = lines.filter((x) => x._custom);
      lines.length = 0;

      const base = buildRoomCostLines(room, appState, fromDate, toDate);
      base.forEach((b) => lines.push({ ...b }));

      custom.forEach((c) => lines.push(c));
      ensureMeterLines();
    }

    function renderCostRows() {
      costBody.innerHTML = lines
        .map((l, i) => {
          const isMeter = !!l._meterType;
          const disableDel = isMeter ? "disabled" : "";
          const noteHtml = l.note
            ? `<div style="font-size:11px; color:#6b7280; margin-top:2px;">${escapeHtml(l.note)}</div>`
            : "";
          return `
            <tr data-idx="${i}">
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="co-name" type="text" value="${escapeHtml(l.name)}" style="width:100%; padding:6px; font-weight:800;">
                ${noteHtml}
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="co-up" type="number" value="${Number(l.unitPrice || 0)}" style="width:100%; padding:6px;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="co-qty" type="number" value="${Number(l.qty || 0)}" style="width:100%; padding:6px;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">
                <input class="co-unit" type="text" value="${escapeHtml(l.unit || "")}" style="width:100%; padding:6px; text-align:center;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:right;">
                <b class="co-total">${fmtMoney(l.total || 0)}</b>
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">
                <button class="co-del" ${disableDel} style="padding:6px 8px;">🗑</button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    function recalcCostsFromDOM() {
      let sum = 0;
      const trs = costBody.querySelectorAll("tr[data-idx]");
      trs.forEach((tr) => {
        const idx = Number(tr.getAttribute("data-idx"));
        const name = tr.querySelector(".co-name").value || "";
        const up = Number(tr.querySelector(".co-up").value || 0);
        const qty = Number(tr.querySelector(".co-qty").value || 0);
        const unit = tr.querySelector(".co-unit").value || "";

        const total = up * qty;

        lines[idx].name = name;
        lines[idx].unitPrice = up;
        lines[idx].qty = qty;
        lines[idx].unit = unit;
        lines[idx].total = total;

        tr.querySelector(".co-total").innerText = fmtMoney(total);
        sum += total;
      });

      sumEl.textContent = fmtMoney(sum);
    }

    function wireCostHandlers() {
      costBody.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalcCostsFromDOM));
      costBody.querySelectorAll(".co-del").forEach((btn) => {
        btn.onclick = (e) => {
          const tr = e.target.closest("tr[data-idx]");
          const idx = Number(tr.getAttribute("data-idx"));
          if (lines[idx]._meterType) return;
          lines.splice(idx, 1);
          renderCostRows();
          wireCostHandlers();
          recalcCostsFromDOM();
        };
      });
    }

    function recalcMeters() {
      const d = toISO10(meterDateInput.value) || todayISO();

      const elecIdx = lines.findIndex((x) => x._meterType === "electricity");
      const waterIdx = lines.findIndex((x) => x._meterType === "water");

      const elecCurrStr = (elecCurrInput.value || "").trim();
      if (!elecCurrStr) {
        elecUsedEl.textContent = "-";
        elecMoneyEl.textContent = "0";
        lines[elecIdx].qty = 0;
        lines[elecIdx].unitPrice = elecPrice;
        lines[elecIdx].total = 0;
      } else {
        const curr = Number(elecCurrStr);
        const used = curr - elecPrev;
        const money = used >= 0 ? used * elecPrice : 0;
        elecUsedEl.textContent = String(used);
        elecMoneyEl.textContent = fmtMoney(money);
        lines[elecIdx].qty = used >= 0 ? used : 0;
        lines[elecIdx].unitPrice = elecPrice;
        lines[elecIdx].unit = elecUnit;
        lines[elecIdx].total = used >= 0 ? money : 0;
      }

      const waterCurrStr = (waterCurrInput.value || "").trim();
      if (!waterCurrStr) {
        waterUsedEl.textContent = "-";
        waterMoneyEl.textContent = "0";
        lines[waterIdx].qty = 0;
        lines[waterIdx].unitPrice = waterPrice;
        lines[waterIdx].total = 0;
      } else {
        const curr = Number(waterCurrStr);
        const used = curr - waterPrev;
        const money = used >= 0 ? used * waterPrice : 0;
        waterUsedEl.textContent = String(used);
        waterMoneyEl.textContent = fmtMoney(money);
        lines[waterIdx].qty = used >= 0 ? used : 0;
        lines[waterIdx].unitPrice = waterPrice;
        lines[waterIdx].unit = waterUnit;
        lines[waterIdx].total = used >= 0 ? money : 0;
      }

      renderCostRows();
      wireCostHandlers();
      recalcCostsFromDOM();
    }

    function refreshMeterContext() {
      const d = toISO10(meterDateInput.value) || todayISO();

      elecPrev = getPrevReadingByDate(appState, "electricity", room.number, d);
      waterPrev = getPrevReadingByDate(appState, "water", room.number, d);

      const elecRec = getMeterRecordByDate(appState, "electricity", room.number, d);
      const waterRec = getMeterRecordByDate(appState, "water", room.number, d);

      elecMeta.innerHTML = `Lần trước: <b>${fmtMoney(elecPrev)}</b> • Ngày ${escapeHtml(d)}: ${
        elecRec ? `<b>${fmtMoney(elecRec.curr)}</b> (đã chốt)` : `<i>chưa chốt</i>`
      }`;
      waterMeta.innerHTML = `Lần trước: <b>${fmtMoney(waterPrev)}</b> • Ngày ${escapeHtml(d)}: ${
        waterRec ? `<b>${fmtMoney(waterRec.curr)}</b> (đã chốt)` : `<i>chưa chốt</i>`
      }`;

      elecCurrInput.value = elecRec ? String(elecRec.curr) : "";
      waterCurrInput.value = waterRec ? String(waterRec.curr) : "";

      const fromDate = fromDateDefault;
      const toDate = d;
      rebuildBaseLinesByDates(fromDate, toDate);

      renderCostRows();
      wireCostHandlers();
      recalcMeters();
    }

    meterDateInput.addEventListener("change", refreshMeterContext);
    elecCurrInput.addEventListener("input", recalcMeters);
    waterCurrInput.addEventListener("input", recalcMeters);

    addLineBtn.onclick = () => {
      lines.splice(lines.length - 2, 0, {
        name: "Khoản khác",
        unitPrice: 0,
        qty: 1,
        unit: "",
        total: 0,
        note: "",
        _custom: true,
      });
      renderCostRows();
      wireCostHandlers();
      recalcCostsFromDOM();
    };

    // init
    refreshMeterContext();

    // ===== Confirm =====
    document.getElementById("co-confirm").onclick = () => {
      const meterDate = toISO10(meterDateInput.value);
      if (!meterDate) return alert("Chưa chọn ngày chốt điện/nước.");

      const fromDate = fromDateDefault;
      const toDate = meterDate;

      const elecCurrStr = (elecCurrInput.value || "").trim();
      const waterCurrStr = (waterCurrInput.value || "").trim();

      if (!elecCurrStr) return alert("Chưa nhập số điện hiện tại để chốt khi trả phòng.");
      if (!waterCurrStr) return alert("Chưa nhập số nước hiện tại để chốt khi trả phòng.");

      const elecCurr = Number(elecCurrStr);
      const waterCurr = Number(waterCurrStr);

      if (Number.isNaN(elecCurr) || elecCurr < elecPrev) return alert("Số điện hiện tại không hợp lệ (nhỏ hơn lần trước).");
      if (Number.isNaN(waterCurr) || waterCurr < waterPrev) return alert("Số nước hiện tại không hợp lệ (nhỏ hơn lần trước).");

      const elecCalc = addOrUpdateMeterByDate(appState, "electricity", room.number, elecCurr, meterDate);
      const waterCalc = addOrUpdateMeterByDate(appState, "water", room.number, waterCurr, meterDate);

      const extraNotes = [];
      const deviceChargeLines = [];

      const noteText = (document.getElementById("co-note").value || "").trim();
      if (noteText) extraNotes.push(`Ghi chú: ${noteText}`);

      if (devicesInRoom.length) {
        const dtrs = document.querySelectorAll("#co-dev-body tr[data-idx]");
        dtrs.forEach((tr) => {
          const name = tr.children[0]?.innerText?.trim() || "";
          const qtyRoom = Number(tr.children[1]?.innerText || 0);
          if (!name || qtyRoom <= 0) return;

          const status = tr.querySelector(".dev-status").value;
          const fee = Number(tr.querySelector(".dev-fee").value || 0);
          const dnote = (tr.querySelector(".dev-note").value || "").trim();

          const hasSomething = (status && status !== "") || fee > 0 || !!dnote;
          if (!hasSomething) return;

          let line = `${name} (SL ${qtyRoom})`;
          if (status) line += ` - ${status}`;
          if (dnote) line += ` • ${dnote}`;
          if (fee > 0) line += ` • phí ${fmtMoney(fee)}đ`;
          extraNotes.push(line);

          if (fee > 0) {
            deviceChargeLines.push({
              name: `Phí thiết bị: ${name}${status ? ` (${status})` : ""}`,
              unitPrice: fee,
              qty: 1,
              unit: "lần",
              total: fee,
              note: dnote || "",
            });
          }
        });
      }

      recalcCostsFromDOM();
      const finalLines = lines.map((x) => ({ ...x }));
      deviceChargeLines.forEach((x) => finalLines.push(x));

      const total = finalLines.reduce((a, l) => a + Number(l.total || 0), 0);

      const printHtml = buildPrintA5Html({
        title: BRAND.titleCheckout,
        room,
        fromDate,
        toDate,
        tenantName: tenantName || "(chưa có)",
        lines: finalLines,
        extraNotesLines: extraNotes,
      });

      if (window.addInvoice) {
        window.addInvoice({
          roomNumber: String(room.number),
          tenantName: tenantName || "",
          issueDate: todayISO(),
          invoiceDate: toDate,
          total,
          status: "unpaid",
          missingAmount: 0,
          lines: finalLines,
          meta: {
            type: "checkout",
            periodFrom: fromDate,
            periodTo: toDate,
            meterDate,
            electricity: { prev: elecCalc.prev, curr: elecCalc.curr, used: elecCalc.used, unitPrice: elecPrice, unit: elecUnit },
            water: { prev: waterCalc.prev, curr: waterCalc.curr, used: waterCalc.used, unitPrice: waterPrice, unit: waterUnit },
            extraNotes,
          },
          printHtml,
        });
      }

      // Clear room state
      room.moveOutDate = todayISO();
      room.tenants = [];

      if (window.saveAppState) window.saveAppState();

      close();
      openPrintWindow(printHtml);

      if (window.setView) window.setView("rooms");
    };
  }

  window.openCheckoutForRoom = openCheckoutForRoom;
})();