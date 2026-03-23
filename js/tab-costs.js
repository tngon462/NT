// js/tab-costs.js
// Tab Chi phí: danh sách chi phí chung + đơn giá điện/nước + chốt số điện/nước hàng loạt

(function () {
  function ensureCostState(appState) {
    if (!appState || typeof appState !== "object") return;

    if (!Array.isArray(appState.costs)) appState.costs = [];

    if (!appState.costUnitPrices) {
      appState.costUnitPrices = {
        electricity: { price: 0, unit: "kWh" },
        water: { price: 0, unit: "m³" },
      };
    }
    if (!appState.costUnitPrices.electricity) {
      appState.costUnitPrices.electricity = { price: 0, unit: "kWh" };
    }
    if (!appState.costUnitPrices.water) {
      appState.costUnitPrices.water = { price: 0, unit: "m³" };
    }

    // backward compatibility
    if (appState.meterPrices) {
      const oldElec = appState.meterPrices.electricity || {};
      const oldWater = appState.meterPrices.water || {};

      if (
        Number(appState.costUnitPrices.electricity.price || 0) === 0 &&
        Number(oldElec.unitPrice || 0) > 0
      ) {
        appState.costUnitPrices.electricity.price = Number(oldElec.unitPrice || 0);
      }
      if (
        !String(appState.costUnitPrices.electricity.unit || "").trim() &&
        String(oldElec.unitLabel || "").trim()
      ) {
        appState.costUnitPrices.electricity.unit = String(oldElec.unitLabel || "").trim();
      }

      if (
        Number(appState.costUnitPrices.water.price || 0) === 0 &&
        Number(oldWater.unitPrice || 0) > 0
      ) {
        appState.costUnitPrices.water.price = Number(oldWater.unitPrice || 0);
      }
      if (
        !String(appState.costUnitPrices.water.unit || "").trim() &&
        String(oldWater.unitLabel || "").trim()
      ) {
        appState.costUnitPrices.water.unit = String(oldWater.unitLabel || "").trim();
      }
    }

    if (!appState.meters) {
      appState.meters = {
        electricity: { lastReadings: {}, history: [] },
        water: { lastReadings: {}, history: [] },
      };
    }
    if (!appState.meters.electricity) {
      appState.meters.electricity = { lastReadings: {}, history: [] };
    }
    if (!appState.meters.water) {
      appState.meters.water = { lastReadings: {}, history: [] };
    }

    if (!Array.isArray(appState.rooms)) appState.rooms = [];
  }

  function fmtMoney(n) {
    const x = Number(n || 0);
    return Number.isNaN(x) ? "0" : x.toLocaleString("vi-VN");
  }

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function ymOf(v) {
    const s = String(v || "");
    return s.length >= 7 ? s.slice(0, 7) : "";
  }

  function firstDayOfMonth(ym) {
    return `${ym}-01`;
  }

  function getOccupiedRooms(appState) {
    return (appState.rooms || []).filter(
      (room) => Array.isArray(room.tenants) && room.tenants.length > 0
    );
  }

  function getFirstTenantName(room) {
    if (!room || !Array.isArray(room.tenants) || room.tenants.length === 0) return "";
    const owner = room.tenants.find((t) => t && t.isOwner);
    return owner?.fullName || room.tenants[0]?.fullName || "";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function saveState() {
    if (typeof window.saveAppState === "function") {
      window.saveAppState();
    }
  }

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
      <div style="background:#fff; width:min(1100px, 96vw); max-height:92vh; overflow:auto; border-radius:14px; padding:14px; box-shadow:0 10px 30px rgba(0,0,0,.25);">
        ${html}
      </div>
    `;
    document.body.appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    return { overlay, close };
  }

  function normalizeMeterHistoryItem(item) {
    return {
      roomNumber: String(item?.roomNumber || ""),
      period: String(item?.period || ""),
      date: String(item?.date || ""),
      prev: Number(item?.prev || 0),
      curr: Number(item?.curr || 0),
      used:
        item?.used != null && !Number.isNaN(Number(item.used))
          ? Number(item.used)
          : Math.max(0, Number(item?.curr || 0) - Number(item?.prev || 0)),
      savedAt: item?.savedAt || "",
    };
  }

  function getMeterHistoryForRoom(appState, type, roomNumber) {
    const history = appState?.meters?.[type]?.history || [];
    return history
      .map(normalizeMeterHistoryItem)
      .filter((x) => String(x.roomNumber) === String(roomNumber))
      .sort((a, b) => {
        const ka = `${a.period}|${a.date}|${a.savedAt}`;
        const kb = `${b.period}|${b.date}|${b.savedAt}`;
        return ka.localeCompare(kb);
      });
  }

  function getPrevReadingForRoom(appState, type, roomNumber, period) {
    const list = getMeterHistoryForRoom(appState, type, roomNumber);
    if (!list.length) return 0;

    const samePeriod = list.filter((x) => String(x.period) === String(period));
    if (samePeriod.length) {
      return Number(samePeriod[samePeriod.length - 1].curr || 0);
    }

    const older = list.filter((x) => {
      if (x.period) return x.period < period;
      if (x.date) return ymOf(x.date) < period;
      return false;
    });
    if (older.length) return Number(older[older.length - 1].curr || 0);

    return Number(list[list.length - 1].curr || 0);
  }

  function saveMeterReading(appState, type, payload) {
    ensureCostState(appState);

    const meter = appState.meters[type];
    const roomNumber = String(payload.roomNumber || "");
    const period = String(payload.period || ymOf(payload.date || todayISO()));
    const date = String(payload.date || todayISO());
    const prev = Number(payload.prev || 0);
    const curr = Number(payload.curr || 0);
    const used = Math.max(0, curr - prev);

    if (!Array.isArray(meter.history)) meter.history = [];
    if (!meter.lastReadings || typeof meter.lastReadings !== "object") meter.lastReadings = {};

    meter.history.push({
      roomNumber,
      period,
      date,
      prev,
      curr,
      used,
      savedAt: new Date().toISOString(),
    });

    meter.lastReadings[roomNumber] = {
      roomNumber,
      period,
      date,
      prev,
      curr,
      used,
      savedAt: new Date().toISOString(),
    };

    saveState();
  }

  function openBulkMeterModal(appState, type) {
    ensureCostState(appState);

    const rooms = getOccupiedRooms(appState)
      .slice()
      .sort((a, b) => String(a.number).localeCompare(String(b.number), "vi"));

    if (!rooms.length) {
      alert("Không có phòng đang thuê.");
      return;
    }

    const isElectric = type === "electricity";
    const title = isElectric ? "⚡ Chốt số điện (tất cả phòng)" : "💧 Chốt số nước (tất cả phòng)";
    const dateDefault = todayISO();
    const periodDefault = ymOf(dateDefault);

    const rowsHtml = rooms
      .map((room) => {
        const prev = getPrevReadingForRoom(appState, type, room.number, periodDefault);
        return `
          <tr>
            <td style="padding:8px; border:1px solid #e5e7eb;"><b>${escapeHtml(room.number)}</b></td>
            <td style="padding:8px; border:1px solid #e5e7eb;">${escapeHtml(getFirstTenantName(room))}</td>
            <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">
              <input data-role="prev" data-room="${escapeHtml(room.number)}" type="number"
                value="${Number(prev || 0)}"
                style="width:100px; padding:6px; text-align:right;">
            </td>
            <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">
              <input data-role="curr" data-room="${escapeHtml(room.number)}" type="number"
                value=""
                style="width:100px; padding:6px; text-align:right;">
            </td>
            <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">
              <span data-role="used" data-room="${escapeHtml(room.number)}">0</span>
            </td>
          </tr>
        `;
      })
      .join("");

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin:0;">${title}</h3>
        <button id="bulk-meter-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Ngày chốt</label><br>
          <input id="bulk-meter-date" type="date" value="${dateDefault}" style="padding:8px; width:100%;">
        </div>
        <div>
          <label style="font-size:13px;">Kỳ</label><br>
          <input id="bulk-meter-period" type="month" value="${periodDefault}" style="padding:8px; width:100%;">
        </div>
      </div>

      <div style="margin-top:12px; overflow:auto; border:1px solid #e5e7eb; border-radius:12px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">Phòng</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">Người thuê</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:right;">Số cũ</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:right;">Số mới</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:right;">Sử dụng</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="bulk-meter-fill-prev-btn" style="padding:8px 12px;">🔄 Lấy lại số cũ</button>
        <button id="bulk-meter-save-btn" style="padding:8px 12px; font-weight:700;">💾 Lưu toàn bộ</button>
      </div>

      <div id="bulk-meter-msg" style="margin-top:10px; font-size:12px;"></div>
    `);

    const closeBtn = document.getElementById("bulk-meter-close-btn");
    const fillPrevBtn = document.getElementById("bulk-meter-fill-prev-btn");
    const saveBtn = document.getElementById("bulk-meter-save-btn");
    const dateInput = document.getElementById("bulk-meter-date");
    const periodInput = document.getElementById("bulk-meter-period");
    const msgEl = document.getElementById("bulk-meter-msg");

    if (closeBtn) closeBtn.onclick = close;

    function updateUsedForRow(roomNumber) {
      const prevInput = document.querySelector(`input[data-role="prev"][data-room="${CSS.escape(roomNumber)}"]`);
      const currInput = document.querySelector(`input[data-role="curr"][data-room="${CSS.escape(roomNumber)}"]`);
      const usedEl = document.querySelector(`span[data-role="used"][data-room="${CSS.escape(roomNumber)}"]`);

      const prev = Number(prevInput?.value || 0);
      const curr = Number(currInput?.value || 0);
      const used = Math.max(0, curr - prev);

      if (usedEl) usedEl.textContent = String(used);
    }

    rooms.forEach((room) => {
      const roomNumber = String(room.number);
      const prevInput = document.querySelector(`input[data-role="prev"][data-room="${CSS.escape(roomNumber)}"]`);
      const currInput = document.querySelector(`input[data-role="curr"][data-room="${CSS.escape(roomNumber)}"]`);

      if (prevInput) prevInput.addEventListener("input", () => updateUsedForRow(roomNumber));
      if (currInput) currInput.addEventListener("input", () => updateUsedForRow(roomNumber));
      updateUsedForRow(roomNumber);
    });

    if (fillPrevBtn) {
      fillPrevBtn.onclick = () => {
        const period = String(periodInput?.value || periodDefault);
        rooms.forEach((room) => {
          const roomNumber = String(room.number);
          const prev = getPrevReadingForRoom(appState, type, roomNumber, period);
          const prevInput = document.querySelector(`input[data-role="prev"][data-room="${CSS.escape(roomNumber)}"]`);
          if (prevInput) prevInput.value = String(Number(prev || 0));
          updateUsedForRow(roomNumber);
        });

        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã lấy lại số cũ theo dữ liệu đã chốt trước đó.";
      };
    }

    if (saveBtn) {
      saveBtn.onclick = () => {
        const dateVal = String(dateInput?.value || todayISO());
        const periodVal = String(periodInput?.value || ymOf(dateVal));

        let savedCount = 0;

        for (const room of rooms) {
          const roomNumber = String(room.number);
          const prevInput = document.querySelector(`input[data-role="prev"][data-room="${CSS.escape(roomNumber)}"]`);
          const currInput = document.querySelector(`input[data-role="curr"][data-room="${CSS.escape(roomNumber)}"]`);

          const prev = Number(prevInput?.value || 0);
          const currRaw = String(currInput?.value || "").trim();
          if (currRaw === "") continue;

          const curr = Number(currRaw);
          if (Number.isNaN(curr)) continue;

          saveMeterReading(appState, type, {
            roomNumber,
            period: periodVal,
            date: dateVal,
            prev,
            curr,
          });
          savedCount += 1;
        }

        msgEl.style.color = savedCount > 0 ? "#16a34a" : "#b45309";
        msgEl.innerText =
          savedCount > 0
            ? `Đã lưu ${savedCount} dòng chốt số ${isElectric ? "điện" : "nước"}.`
            : "Chưa có dòng nào được lưu. Sếp nhập ít nhất một số mới.";
      };
    }
  }

  function renderCosts(mainContent, appState) {
    ensureCostState(appState);

    const costs = appState.costs;
    const elec = appState.costUnitPrices.electricity;
    const water = appState.costUnitPrices.water;

    mainContent.innerHTML = `
      <h3>💰 Chi phí</h3>
      <p style="font-size:13px; color:#4b5563;">
        Định nghĩa các loại chi phí chung (rác, internet, gửi xe...) và đơn giá điện, nước.
      </p>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:10px 0;">
        <button id="bulk-electricity-btn" style="padding:6px 10px; font-size:13px;">
          ⚡ Chốt số điện (tất cả phòng)
        </button>
        <button id="bulk-water-btn" style="padding:6px 10px; font-size:13px;">
          💧 Chốt số nước (tất cả phòng)
        </button>
      </div>

      <section class="costs-section">
        <h4>Đơn giá điện / nước</h4>

        <div style="font-size:13px; margin-bottom:6px;">
          <div>⚡ <b>Điện:</b> ${fmtMoney(elec.price)} / ${escapeHtml(elec.unit || "kWh")}</div>
          <div>💧 <b>Nước:</b> ${fmtMoney(water.price)} / ${escapeHtml(water.unit || "m³")}</div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="toggle-elec-price-btn" style="padding:6px 10px; font-size:13px;">
            ⚙ Đổi giá điện
          </button>
          <button id="toggle-water-price-btn" style="padding:6px 10px; font-size:13px;">
            ⚙ Đổi giá nước
          </button>
          <button id="export-all-invoices-btn" style="padding:6px 10px; font-size:13px;">
            🧾 Xuất toàn bộ hóa đơn (phòng đang thuê)
          </button>
          <button id="print-acceptance-sheet-btn" style="padding:6px 10px; font-size:13px;">
            🖨 In phiếu nghiệm thu
          </button>
          <button id="print-summary-sheet-btn" style="padding:6px 10px; font-size:13px;">
            🖨 In phiếu tổng hợp
          </button>
        </div>

        <div id="elec-price-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Đổi đơn giá điện</b></div>
          <label>Đơn giá:</label><br>
          <input
            id="elec-unit-price-input"
            type="number"
            value="${Number(elec.price || 0)}"
            style="padding:4px; width:140px; margin-bottom:4px;"
          ><br>
          <label>Đơn vị:</label><br>
          <input
            id="elec-unit-label-input"
            type="text"
            value="${escapeHtml(elec.unit || "kWh")}"
            style="padding:4px; width:140px; margin-bottom:6px;"
          ><br>
          <button id="save-elec-price-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu đơn giá điện
          </button>
          <div id="elec-price-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>

        <div id="water-price-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Đổi đơn giá nước</b></div>
          <label>Đơn giá:</label><br>
          <input
            id="water-unit-price-input"
            type="number"
            value="${Number(water.price || 0)}"
            style="padding:4px; width:140px; margin-bottom:4px;"
          ><br>
          <label>Đơn vị:</label><br>
          <input
            id="water-unit-label-input"
            type="text"
            value="${escapeHtml(water.unit || "m³")}"
            style="padding:4px; width:140px; margin-bottom:6px;"
          ><br>
          <button id="save-water-price-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu đơn giá nước
          </button>
          <div id="water-price-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </section>

      <section class="costs-section">
        <h4>Danh sách các chi phí khác</h4>
        <div style="font-size:13px; color:#4b5563; margin-bottom:8px;">
          Ví dụ: tiền rác, internet, gửi xe... Mỗi chi phí chỉ gồm tên, số tiền mặc định và đơn vị.
        </div>

        <div style="overflow:auto; border:1px solid #e5e7eb; border-radius:12px;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">Tên chi phí</th>
                <th style="padding:8px; border:1px solid #e5e7eb; text-align:right;">Số tiền mặc định</th>
                <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">Đơn vị tính</th>
                <th style="padding:8px; border:1px solid #e5e7eb; text-align:center;">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              ${
                costs.length
                  ? costs
                      .map((c, idx) => `
                        <tr>
                          <td style="padding:8px; border:1px solid #e5e7eb;">${escapeHtml(c.name || "")}</td>
                          <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">
                            ${fmtMoney(c.amount || 0)}
                          </td>
                          <td style="padding:8px; border:1px solid #e5e7eb;">
                            ${escapeHtml(c.unit || "")}
                          </td>
                          <td style="padding:8px; border:1px solid #e5e7eb; text-align:center;">
                            <button data-cost-edit="${idx}" style="padding:4px 10px; font-size:12px;">Sửa</button>
                            <button data-cost-delete="${idx}" style="padding:4px 10px; font-size:12px; margin-left:4px; background:#dc2626;">Xóa</button>
                          </td>
                        </tr>
                      `)
                      .join("")
                  : `
                    <tr>
                      <td colspan="4" style="padding:10px; text-align:center; color:#6b7280; border:1px solid #e5e7eb;">
                        Chưa có chi phí nào.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>

        <div style="margin-top:10px;">
          <button id="toggle-add-cost-form-btn" style="padding:6px 10px; font-size:13px;">
            ➕ Thêm chi phí mới
          </button>
        </div>

        <div id="add-cost-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Thêm chi phí mới</b></div>
          <label>Tên chi phí (bắt buộc):</label><br>
          <input id="new-cost-name" type="text" value="" style="padding:4px; width:min(360px, 100%); margin-bottom:6px;"><br>

          <label>Số tiền mặc định:</label><br>
          <input id="new-cost-amount" type="number" value="" style="padding:4px; width:160px; margin-bottom:6px;"><br>

          <label>Đơn vị tính:</label><br>
          <input id="new-cost-unit" type="text" value="" style="padding:4px; width:160px; margin-bottom:6px;"><br>

          <button id="save-new-cost-btn" style="padding:6px 10px; font-size:13px;">
            💾 Lưu chi phí
          </button>
          <div id="new-cost-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </section>
    `;

    const bulkElecBtn = document.getElementById("bulk-electricity-btn");
    const bulkWaterBtn = document.getElementById("bulk-water-btn");
    const toggleElecBtn = document.getElementById("toggle-elec-price-btn");
    const toggleWaterBtn = document.getElementById("toggle-water-price-btn");
    const exportAllInvoicesBtn = document.getElementById("export-all-invoices-btn");
    const printAcceptanceBtn = document.getElementById("print-acceptance-sheet-btn");
    const printSummaryBtn = document.getElementById("print-summary-sheet-btn");

    const elecForm = document.getElementById("elec-price-form");
    const waterForm = document.getElementById("water-price-form");

    const saveElecBtn = document.getElementById("save-elec-price-btn");
    const saveWaterBtn = document.getElementById("save-water-price-btn");

    const elecPriceInput = document.getElementById("elec-unit-price-input");
    const elecUnitInput = document.getElementById("elec-unit-label-input");
    const waterPriceInput = document.getElementById("water-unit-price-input");
    const waterUnitInput = document.getElementById("water-unit-label-input");

    const elecMsg = document.getElementById("elec-price-msg");
    const waterMsg = document.getElementById("water-price-msg");

    const toggleAddCostBtn = document.getElementById("toggle-add-cost-form-btn");
    const addCostForm = document.getElementById("add-cost-form");
    const saveNewCostBtn = document.getElementById("save-new-cost-btn");
    const newCostMsg = document.getElementById("new-cost-msg");

    if (bulkElecBtn) bulkElecBtn.onclick = () => openBulkMeterModal(appState, "electricity");
    if (bulkWaterBtn) bulkWaterBtn.onclick = () => openBulkMeterModal(appState, "water");

    if (toggleElecBtn) {
      toggleElecBtn.onclick = () => {
        elecForm.style.display = elecForm.style.display === "none" ? "block" : "none";
      };
    }

    if (toggleWaterBtn) {
      toggleWaterBtn.onclick = () => {
        waterForm.style.display = waterForm.style.display === "none" ? "block" : "none";
      };
    }

    if (saveElecBtn) {
      saveElecBtn.onclick = () => {
        const price = Number(elecPriceInput?.value || 0);
        const unit = String(elecUnitInput?.value || "kWh").trim() || "kWh";

        appState.costUnitPrices.electricity.price = Number.isNaN(price) ? 0 : price;
        appState.costUnitPrices.electricity.unit = unit;
        saveState();

        elecMsg.style.color = "#16a34a";
        elecMsg.innerText = "Đã lưu đơn giá điện.";
        renderCosts(mainContent, appState);
      };
    }

    if (saveWaterBtn) {
      saveWaterBtn.onclick = () => {
        const price = Number(waterPriceInput?.value || 0);
        const unit = String(waterUnitInput?.value || "m³").trim() || "m³";

        appState.costUnitPrices.water.price = Number.isNaN(price) ? 0 : price;
        appState.costUnitPrices.water.unit = unit;
        saveState();

        waterMsg.style.color = "#16a34a";
        waterMsg.innerText = "Đã lưu đơn giá nước.";
        renderCosts(mainContent, appState);
      };
    }

    if (exportAllInvoicesBtn) {
      exportAllInvoicesBtn.onclick = () => {
        if (typeof window.openInvoicesForAllOccupiedRooms === "function") {
          window.openInvoicesForAllOccupiedRooms(appState);
        } else {
          alert("Chưa có hàm xuất toàn bộ hóa đơn.");
        }
      };
    }

    if (printAcceptanceBtn) {
      printAcceptanceBtn.onclick = () => {
        if (typeof window.openAcceptanceSheetForAllOccupiedRooms === "function") {
          window.openAcceptanceSheetForAllOccupiedRooms(appState);
        } else {
          alert("Chưa có hàm in phiếu nghiệm thu.");
        }
      };
    }

    if (printSummaryBtn) {
      printSummaryBtn.onclick = () => {
        if (typeof window.openSummarySheetForAllOccupiedRooms === "function") {
          window.openSummarySheetForAllOccupiedRooms(appState);
        } else {
          alert("Chưa có hàm in phiếu tổng hợp.");
        }
      };
    }

    if (toggleAddCostBtn) {
      toggleAddCostBtn.onclick = () => {
        addCostForm.style.display = addCostForm.style.display === "none" ? "block" : "none";
      };
    }

    if (saveNewCostBtn) {
      saveNewCostBtn.onclick = () => {
        const name = String(document.getElementById("new-cost-name")?.value || "").trim();
        const amount = Number(document.getElementById("new-cost-amount")?.value || 0);
        const unit = String(document.getElementById("new-cost-unit")?.value || "").trim();

        if (!name) {
          newCostMsg.style.color = "#b91c1c";
          newCostMsg.innerText = "Tên chi phí là bắt buộc.";
          return;
        }

        appState.costs.push({
          name,
          amount: Number.isNaN(amount) ? 0 : amount,
          unit,
        });
        saveState();

        newCostMsg.style.color = "#16a34a";
        newCostMsg.innerText = "Đã thêm chi phí.";
        renderCosts(mainContent, appState);
      };
    }

    mainContent.querySelectorAll("[data-cost-delete]").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-cost-delete"));
        if (Number.isNaN(idx)) return;
        const item = appState.costs[idx];
        if (!item) return;

        const ok = window.confirm(`Xóa chi phí "${item.name}"?`);
        if (!ok) return;

        appState.costs.splice(idx, 1);
        saveState();
        renderCosts(mainContent, appState);
      };
    });

    mainContent.querySelectorAll("[data-cost-edit]").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-cost-edit"));
        if (Number.isNaN(idx)) return;
        const item = appState.costs[idx];
        if (!item) return;

        const name = window.prompt("Tên chi phí:", item.name || "");
        if (name === null) return;

        const amountRaw = window.prompt("Số tiền mặc định:", String(Number(item.amount || 0)));
        if (amountRaw === null) return;

        const unit = window.prompt("Đơn vị tính:", item.unit || "");
        if (unit === null) return;

        item.name = String(name || "").trim();
        item.amount = Number(amountRaw || 0);
        item.unit = String(unit || "").trim();

        saveState();
        renderCosts(mainContent, appState);
      };
    });
  }

  window.renderCosts = renderCosts;
})();
