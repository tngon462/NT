// js/tab-costs.js
// Tab Chi phí: danh sách chi phí chung + đơn giá điện/nước + chốt số điện/nước hàng loạt

(function () {
  function ensureCostState(appState) {
    if (!Array.isArray(appState.costs)) appState.costs = [];

    // CHUẨN HÓA: chỉ dùng costUnitPrices
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

    // Backward compatibility: nếu dữ liệu cũ đang nằm trong meterPrices thì migrate sang costUnitPrices
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

  function thisMonthISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function getLastHistoryRecord(appState, type, roomNumber) {
    const meter = appState.meters[type] || { history: [], lastReadings: {} };
    const hist = Array.isArray(meter.history) ? meter.history : [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) === String(roomNumber)) return h;
    }
    return null;
  }

  function getPrevReading(appState, type, roomNumber) {
    const meter = appState.meters[type] || { lastReadings: {}, history: [] };
    if (meter.lastReadings && meter.lastReadings[roomNumber] != null) {
      return Number(meter.lastReadings[roomNumber]) || 0;
    }

    const hist = Array.isArray(meter.history) ? meter.history : [];
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) === String(roomNumber)) {
        return Number(h.curr || 0);
      }
    }

    return 0;
  }

  function upsertMeterHistory(appState, type, record) {
    const meter = appState.meters[type];
    meter.history = Array.isArray(meter.history) ? meter.history : [];

    const idx = meter.history.findIndex(
      (h) =>
        String(h.roomNumber) === String(record.roomNumber) &&
        String(h.period || "") === String(record.period || "") &&
        String(h.date || "") === String(record.date || "")
    );

    const payload = {
      ...record,
      savedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      meter.history[idx] = { ...meter.history[idx], ...payload };
    } else {
      meter.history.push(payload);
    }
  }

  function openModal(html) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.background = "rgba(0,0,0,0.35)";
    overlay.style.zIndex = "9999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.innerHTML = `
      <div style="background:#fff; width:min(980px, 96vw); max-height:90vh; overflow:auto; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25); padding:14px;">
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

  function openBulkMeterModal(appState, type) {
    const isElec = type === "electricity";
    const title = isElec ? "⚡ Chốt số điện (tất cả phòng)" : "💧 Chốt số nước (tất cả phòng)";
    const unit = isElec
      ? appState.costUnitPrices.electricity?.unit || "kWh"
      : appState.costUnitPrices.water?.unit || "m³";

    const defaultPeriod = thisMonthISO();
    const defaultDate = todayISO();

    const rooms = [...(appState.rooms || [])].sort((a, b) => {
      const na = Number(a.number);
      const nb = Number(b.number);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.number).localeCompare(String(b.number));
    });

    const rowsHtml = rooms
      .map((r) => {
        const roomNo = r.number;
        const prev = getPrevReading(appState, type, roomNo);
        const last = getLastHistoryRecord(appState, type, roomNo);
        const lastInfo = last
          ? `Kỳ ${last.period || "-"}, ${last.date || "-"}`
          : "Chưa chốt";

        return `
          <tr data-room="${String(roomNo)}">
            <td style="padding:6px; border:1px solid #e5e7eb; text-align:center;"><b>${String(roomNo)}</b></td>
            <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${fmtMoney(prev)}</td>
            <td style="padding:6px; border:1px solid #e5e7eb; font-size:12px; color:#4b5563;">${lastInfo}</td>
            <td style="padding:6px; border:1px solid #e5e7eb;">
              <input class="bulk-curr" type="number" style="width:120px; padding:6px;" placeholder="Nhập số hiện tại">
            </td>
            <td style="padding:6px; border:1px solid #e5e7eb;">
              <input class="bulk-period" type="month" value="${defaultPeriod}" style="padding:6px;">
            </td>
            <td style="padding:6px; border:1px solid #e5e7eb;">
              <input class="bulk-date" type="date" value="${defaultDate}" style="padding:6px;">
            </td>
            <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">
              <span class="bulk-used" style="font-weight:700;">-</span>
            </td>
          </tr>
        `;
      })
      .join("");

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">${title}</h3>
        <button id="bulk-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:8px; font-size:13px; color:#4b5563; line-height:1.4;">
        Đơn vị: <b>${unit}</b>. Nhập “Số hiện tại”, hệ thống sẽ tự tính “Số dùng” = hiện tại - lần trước.
      </div>

      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="bulk-fill-same-period-btn" style="padding:6px 10px;">📌 Set cùng Kỳ cho tất cả</button>
        <button id="bulk-fill-same-date-btn" style="padding:6px 10px;">📌 Set cùng Ngày cho tất cả</button>
        <button id="bulk-save-btn" style="padding:6px 10px; font-weight:700;">💾 Lưu chốt hàng loạt</button>
      </div>

      <div id="bulk-msg" style="margin-top:8px; font-size:12px;"></div>

      <div style="margin-top:10px; overflow:auto;">
        <table style="border-collapse:collapse; width:100%; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px; border:1px solid #e5e7eb; width:70px;">Phòng</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:120px;">Số lần trước</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:200px;">Lần chốt trước</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:160px;">Số hiện tại</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:150px;">Kỳ</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:160px;">Ngày chốt</th>
              <th style="padding:6px; border:1px solid #e5e7eb; width:120px;">Số dùng</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `);

    document.getElementById("bulk-close-btn").onclick = close;
    const msgEl = document.getElementById("bulk-msg");

    function recalcRow(tr) {
      const roomNo = tr.getAttribute("data-room");
      const prev = getPrevReading(appState, type, roomNo);
      const currInput = tr.querySelector(".bulk-curr");
      const usedEl = tr.querySelector(".bulk-used");

      const currStr = (currInput.value || "").trim();
      if (!currStr) {
        usedEl.textContent = "-";
        usedEl.style.color = "#6b7280";
        return;
      }

      const curr = Number(currStr);
      if (Number.isNaN(curr)) {
        usedEl.textContent = "Lỗi";
        usedEl.style.color = "#b91c1c";
        return;
      }

      const used = curr - prev;
      usedEl.textContent = String(used);
      usedEl.style.color = used < 0 ? "#b91c1c" : "#111827";
    }

    document.querySelectorAll("tr[data-room]").forEach((tr) => {
      const currInput = tr.querySelector(".bulk-curr");
      currInput.addEventListener("input", () => recalcRow(tr));
    });

    document.getElementById("bulk-fill-same-period-btn").onclick = () => {
      const p = prompt("Nhập kỳ (YYYY-MM):", thisMonthISO());
      if (p === null) return;
      document.querySelectorAll("tr[data-room] .bulk-period").forEach((el) => {
        el.value = p;
      });
    };

    document.getElementById("bulk-fill-same-date-btn").onclick = () => {
      const d = prompt("Nhập ngày chốt (YYYY-MM-DD):", todayISO());
      if (d === null) return;
      document.querySelectorAll("tr[data-room] .bulk-date").forEach((el) => {
        el.value = d;
      });
    };

    document.getElementById("bulk-save-btn").onclick = () => {
      const meter = appState.meters[type];
      if (!Array.isArray(meter.history)) meter.history = [];
      if (!meter.lastReadings) meter.lastReadings = {};

      let saved = 0;
      let errors = 0;

      const trs = Array.from(document.querySelectorAll("tr[data-room]"));
      for (const tr of trs) {
        const roomNo = tr.getAttribute("data-room");
        const prev = getPrevReading(appState, type, roomNo);

        const currInput = tr.querySelector(".bulk-curr");
        const periodInput = tr.querySelector(".bulk-period");
        const dateInput = tr.querySelector(".bulk-date");

        currInput.style.border = "";

        const currStr = (currInput.value || "").trim();
        if (!currStr) continue;

        const curr = Number(currStr);
        if (Number.isNaN(curr) || curr < prev) {
          errors++;
          currInput.style.border = "2px solid #b91c1c";
          continue;
        }

        const used = curr - prev;
        const period = periodInput.value || thisMonthISO();
        const date = dateInput.value || todayISO();

        upsertMeterHistory(appState, type, {
          period,
          date,
          roomNumber: roomNo,
          prev,
          curr,
          used,
        });

        meter.lastReadings[roomNo] = curr;
        saved++;
      }

      if (window.saveAppState) window.saveAppState();

      msgEl.style.color = errors > 0 ? "#b91c1c" : "#16a34a";
      msgEl.innerText =
        `Đã lưu ${saved} phòng.` +
        (errors > 0 ? ` Có ${errors} phòng lỗi (số hiện tại < số trước hoặc sai định dạng).` : "");
    };
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

      <section class="cost-section">
        <h4>Đơn giá điện / nước</h4>

        <div style="font-size:13px; margin-bottom:6px;">
          <div>⚡ <b>Điện:</b> ${fmtMoney(elec.price)} / ${elec.unit || "kWh"}</div>
          <div>💧 <b>Nước:</b> ${fmtMoney(water.price)} / ${water.unit || "m³"}</div>
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
            value="${elec.unit || "kWh"}"
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
            value="${water.unit || "m³"}"
            style="padding:4px; width:140px; margin-bottom:6px;"
          ><br>
          <button id="save-water-price-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu đơn giá nước
          </button>
          <div id="water-price-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </section>

      <hr style="margin:16px 0; border:none; border-top:1px solid #e5e7eb;">

      <section class="cost-section">
        <h4>Danh sách các chi phí khác</h4>
        <p style="font-size:13px; color:#4b5563;">
          Ví dụ: tiền rác, internet, gửi xe... Mỗi chi phí chỉ gồm tên, số tiền mặc định và đơn vị.
        </p>

        ${
          costs.length === 0
            ? `<p style="font-size:13px;">Chưa có chi phí nào.</p>`
            : `
              <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="padding:6px; text-align:left;">Tên chi phí</th>
                    <th style="padding:6px; text-align:left;">Số tiền mặc định</th>
                    <th style="padding:6px; text-align:left;">Đơn vị tính</th>
                    <th style="padding:6px; text-align:left;">Xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  ${costs
                    .map(
                      (c, idx) => `
                        <tr>
                          <td style="padding:6px; border-top:1px solid #e5e7eb;">${c.name || ""}</td>
                          <td style="padding:6px; border-top:1px solid #e5e7eb;">
                            <input
                              class="cost-amount-input"
                              data-index="${idx}"
                              type="number"
                              value="${Number(c.amount || 0)}"
                              style="padding:4px; width:140px;"
                            >
                          </td>
                          <td style="padding:6px; border-top:1px solid #e5e7eb;">
                            <input
                              class="cost-unit-input"
                              data-index="${idx}"
                              type="text"
                              value="${c.unit || ""}"
                              style="padding:4px; width:140px;"
                            >
                          </td>
                          <td style="padding:6px; border-top:1px solid #e5e7eb;">
                            <button class="delete-cost-btn" data-index="${idx}" style="padding:4px 10px;">Xóa</button>
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
        }

        <div style="margin-top:10px;">
          <button id="toggle-add-cost-btn" style="padding:6px 10px; font-size:13px;">
            ➕ Thêm chi phí mới
          </button>
        </div>

        <div id="add-cost-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Thêm chi phí mới</b></div>
          <div style="margin-bottom:6px;">
            <label>Tên chi phí (bắt buộc):</label><br>
            <input id="new-cost-name" type="text" style="padding:4px; width:220px;">
          </div>
          <div style="margin-bottom:6px;">
            <label>Số tiền mặc định:</label><br>
            <input id="new-cost-amount" type="number" style="padding:4px; width:140px;">
          </div>
          <div style="margin-bottom:6px;">
            <label>Đơn vị tính:</label><br>
            <input id="new-cost-unit" type="text" style="padding:4px; width:140px;" placeholder="VD: người, phòng...">
          </div>
          <button id="save-new-cost-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu chi phí
          </button>
          <div id="add-cost-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </section>
    `;

    // ===== Events bulk meter =====
    const bulkElecBtn = document.getElementById("bulk-electricity-btn");
    const bulkWaterBtn = document.getElementById("bulk-water-btn");
    if (bulkElecBtn) bulkElecBtn.onclick = () => openBulkMeterModal(appState, "electricity");
    if (bulkWaterBtn) bulkWaterBtn.onclick = () => openBulkMeterModal(appState, "water");

    // ===== Export all invoices =====
    const exportAllBtn = document.getElementById("export-all-invoices-btn");
    if (exportAllBtn) {
      exportAllBtn.onclick = () => {
        if (!window.openInvoicesForAllOccupiedRooms) {
          alert("Thiếu invoice.js (window.openInvoicesForAllOccupiedRooms).");
          return;
        }
        window.openInvoicesForAllOccupiedRooms(appState);
      };
    }

    // ===== Toggle forms =====
    const toggleElecBtn = document.getElementById("toggle-elec-price-btn");
    const elecForm = document.getElementById("elec-price-form");
    if (toggleElecBtn && elecForm) {
      toggleElecBtn.onclick = () => {
        elecForm.style.display =
          elecForm.style.display === "none" || elecForm.style.display === ""
            ? "block"
            : "none";
      };
    }

    const toggleWaterBtn = document.getElementById("toggle-water-price-btn");
    const waterForm = document.getElementById("water-price-form");
    if (toggleWaterBtn && waterForm) {
      toggleWaterBtn.onclick = () => {
        waterForm.style.display =
          waterForm.style.display === "none" || waterForm.style.display === ""
            ? "block"
            : "none";
      };
    }

    // ===== Save elec =====
    const elecUnitPriceInput = document.getElementById("elec-unit-price-input");
    const elecUnitLabelInput = document.getElementById("elec-unit-label-input");
    const saveElecBtn = document.getElementById("save-elec-price-btn");
    const elecMsg = document.getElementById("elec-price-msg");

    if (saveElecBtn) {
      saveElecBtn.onclick = () => {
        const price = Number(elecUnitPriceInput.value || "0");
        const unit = (elecUnitLabelInput.value || "").trim() || "kWh";

        if (price < 0 || Number.isNaN(price)) {
          elecMsg.style.color = "#b91c1c";
          elecMsg.innerText = "Đơn giá điện không hợp lệ.";
          return;
        }

        appState.costUnitPrices.electricity = { price, unit };
        if (window.saveAppState) window.saveAppState();

        elecMsg.style.color = "#16a34a";
        elecMsg.innerText = "Đã lưu đơn giá điện.";
        renderCosts(mainContent, appState);
      };
    }

    // ===== Save water =====
    const waterUnitPriceInput = document.getElementById("water-unit-price-input");
    const waterUnitLabelInput = document.getElementById("water-unit-label-input");
    const saveWaterBtn = document.getElementById("save-water-price-btn");
    const waterMsg = document.getElementById("water-price-msg");

    if (saveWaterBtn) {
      saveWaterBtn.onclick = () => {
        const price = Number(waterUnitPriceInput.value || "0");
        const unit = (waterUnitLabelInput.value || "").trim() || "m³";

        if (price < 0 || Number.isNaN(price)) {
          waterMsg.style.color = "#b91c1c";
          waterMsg.innerText = "Đơn giá nước không hợp lệ.";
          return;
        }

        appState.costUnitPrices.water = { price, unit };
        if (window.saveAppState) window.saveAppState();

        waterMsg.style.color = "#16a34a";
        waterMsg.innerText = "Đã lưu đơn giá nước.";
        renderCosts(mainContent, appState);
      };
    }

    // ===== Inline edit costs =====
    mainContent.querySelectorAll(".cost-amount-input").forEach((inp) => {
      const idx = Number(inp.getAttribute("data-index"));
      inp.onchange = () => {
        const v = Number(inp.value || "0");
        if (Number.isNaN(v) || v < 0) {
          inp.value = appState.costs[idx].amount || 0;
          return;
        }
        appState.costs[idx].amount = v;
        if (window.saveAppState) window.saveAppState();
      };
    });

    mainContent.querySelectorAll(".cost-unit-input").forEach((inp) => {
      const idx = Number(inp.getAttribute("data-index"));
      inp.onchange = () => {
        appState.costs[idx].unit = (inp.value || "").trim();
        if (window.saveAppState) window.saveAppState();
      };
    });

    // ===== Delete cost =====
    mainContent.querySelectorAll(".delete-cost-btn").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-index"));
      btn.onclick = () => {
        const item = appState.costs[idx];
        if (!item) return;

        const ok = confirm(`Xóa chi phí "${item.name}"?`);
        if (!ok) return;

        appState.costs.splice(idx, 1);
        if (window.saveAppState) window.saveAppState();
        renderCosts(mainContent, appState);
      };
    });

    // ===== Add cost =====
    const toggleAddCostBtn = document.getElementById("toggle-add-cost-btn");
    const addCostForm = document.getElementById("add-cost-form");
    if (toggleAddCostBtn && addCostForm) {
      toggleAddCostBtn.onclick = () => {
        addCostForm.style.display =
          addCostForm.style.display === "none" || addCostForm.style.display === ""
            ? "block"
            : "none";
      };
    }

    const saveNewCostBtn = document.getElementById("save-new-cost-btn");
    const addCostMsg = document.getElementById("add-cost-msg");
    const newCostName = document.getElementById("new-cost-name");
    const newCostAmount = document.getElementById("new-cost-amount");
    const newCostUnit = document.getElementById("new-cost-unit");

    if (saveNewCostBtn) {
      saveNewCostBtn.onclick = () => {
        const name = (newCostName.value || "").trim();
        const amount = Number(newCostAmount.value || "0");
        const unit = (newCostUnit.value || "").trim();

        if (!name) {
          addCostMsg.style.color = "#b91c1c";
          addCostMsg.innerText = "Tên chi phí là bắt buộc.";
          return;
        }

        if (Number.isNaN(amount) || amount < 0) {
          addCostMsg.style.color = "#b91c1c";
          addCostMsg.innerText = "Số tiền không hợp lệ.";
          return;
        }

        const existed = appState.costs.some(
          (c) => String(c.name || "").trim().toLowerCase() === name.toLowerCase()
        );
        if (existed) {
          addCostMsg.style.color = "#b91c1c";
          addCostMsg.innerText = "Chi phí này đã tồn tại.";
          return;
        }

        appState.costs.push({
          name,
          amount,
          unit,
        });

        if (window.saveAppState) window.saveAppState();

        addCostMsg.style.color = "#16a34a";
        addCostMsg.innerText = `Đã thêm chi phí "${name}".`;

        newCostName.value = "";
        newCostAmount.value = "";
        newCostUnit.value = "";

        renderCosts(mainContent, appState);
      };
    }
  }

  window.renderCosts = renderCosts;
})();
