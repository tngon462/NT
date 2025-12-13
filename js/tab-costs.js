// js/tab-costs.js
// Tab Chi phí: danh sách chi phí chung + đơn giá điện/nước + chốt số điện/nước hàng loạt

(function () {
  function ensureCostState(appState) {
    if (!Array.isArray(appState.costs)) appState.costs = [];

    if (!appState.meterPrices) appState.meterPrices = {};
    if (!appState.meterPrices.electricity) {
      appState.meterPrices.electricity = { unitPrice: 0, unitLabel: "kWh" };
    }
    if (!appState.meterPrices.water) {
      appState.meterPrices.water = { unitPrice: 0, unitLabel: "m³" };
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
    return Number.isNaN(x) ? "0" : x.toLocaleString();
  }

  function fmtDateHuman(d) {
    if (!d) return "";
    // d dạng YYYY-MM-DD
    return d;
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
      if (h.roomNumber === roomNumber) return h;
    }
    return null;
  }

  function getPrevReading(appState, type, roomNumber) {
    const meter = appState.meters[type] || { lastReadings: {} };
    const v = meter.lastReadings ? meter.lastReadings[roomNumber] : null;
    return v != null ? Number(v) : 0;
  }

  // ===== UI: modal đơn giản =====
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

    return { overlay, close };
  }

  // ===== Chốt số hàng loạt =====
  function openBulkMeterModal(appState, type) {
    const isElec = type === "electricity";
    const title = isElec ? "⚡ Chốt số điện (tất cả phòng)" : "💧 Chốt số nước (tất cả phòng)";
    const unit = isElec
      ? appState.meterPrices.electricity?.unitLabel || "kWh"
      : appState.meterPrices.water?.unitLabel || "m³";

    const defaultPeriod = thisMonthISO();
    const defaultDate = todayISO();

    // sort phòng theo số (nếu số là string)
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
        const lastDate = last?.date || "";
        const lastPeriod = last?.period || "";
        const lastInfo = last
          ? `Kỳ ${lastPeriod || "-"}, ${fmtDateHuman(lastDate || "-")}`
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
        Có thể sửa <b>Kỳ</b> và <b>Ngày chốt</b> cho từng phòng (mặc định là hôm nay).
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
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `);

    // events
    document.getElementById("bulk-close-btn").onclick = close;

    const msgEl = document.getElementById("bulk-msg");

    function recalcRow(tr) {
      const roomNo = tr.getAttribute("data-room");
      const prev = getPrevReading(appState, type, roomNo);

      const currInput = tr.querySelector(".bulk-curr");
      const usedEl = tr.querySelector(".bulk-used");

      const curr = Number(currInput.value || "");
      if (!currInput.value) {
        usedEl.textContent = "-";
        usedEl.style.color = "#6b7280";
        return;
      }
      if (Number.isNaN(curr)) {
        usedEl.textContent = "Lỗi";
        usedEl.style.color = "#b91c1c";
        return;
      }
      const used = curr - prev;
      usedEl.textContent = String(used);
      usedEl.style.color = used < 0 ? "#b91c1c" : "#111827";
    }

    // recalculation on input
    document.querySelectorAll("tr[data-room]").forEach((tr) => {
      const currInput = tr.querySelector(".bulk-curr");
      currInput.addEventListener("input", () => recalcRow(tr));
    });

    // set same period/date
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

    // save bulk
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

        const currStr = (currInput.value || "").trim();
        if (!currStr) continue; // bỏ qua phòng không nhập

        const curr = Number(currStr);
        if (Number.isNaN(curr) || curr < prev) {
          errors++;
          currInput.style.border = "2px solid #b91c1c";
          continue;
        }

        const used = curr - prev;
        const period = periodInput.value || thisMonthISO();
        const date = dateInput.value || todayISO();

        meter.history.push({
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
        `Đã lưu ${saved} phòng.` + (errors > 0 ? ` Có ${errors} phòng lỗi (số hiện tại < số trước hoặc sai định dạng).` : "");

      // nếu không lỗi thì có thể đóng luôn (tùy sếp)
      // close();
    };
  }

  // ===== Render tab costs =====
  function renderCosts(mainContent, appState) {
    ensureCostState(appState);

    const costs = appState.costs;
    const elec = appState.meterPrices.electricity;
    const water = appState.meterPrices.water;

    mainContent.innerHTML = `
      <h3>💰 Chi phí</h3>
      <p style="font-size:13px; color:#4b5563;">
        Định nghĩa các loại chi phí chung (rác, internet, gửi xe...) và đơn giá điện, nước.
      </p>

      <!-- Nút chốt số điện / nước (hàng loạt) -->
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:10px 0;">
        <button id="bulk-electricity-btn" style="padding:6px 10px; font-size:13px;">
          ⚡ Chốt số điện (tất cả phòng)
        </button>
        <button id="bulk-water-btn" style="padding:6px 10px; font-size:13px;">
          💧 Chốt số nước (tất cả phòng)
        </button>
      </div>

      <!-- Đơn giá điện / nước -->
      <section class="cost-section">
        <h4>Đơn giá điện / nước</h4>

        <div style="font-size:13px; margin-bottom:6px;">
          <div>
            ⚡ <b>Điện:</b>
            ${fmtMoney(elec.unitPrice)} / ${elec.unitLabel || "(chưa đặt đơn vị)"}
          </div>
          <div>
            💧 <b>Nước:</b>
            ${fmtMoney(water.unitPrice)} / ${water.unitLabel || "(chưa đặt đơn vị)"}
          </div>
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

        <!-- Form đổi giá điện (ẩn) -->
        <div id="elec-price-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Đổi đơn giá điện</b></div>
          <label>Đơn giá:</label><br>
          <input
            id="elec-unit-price-input"
            type="number"
            value="${elec.unitPrice}"
            style="padding:4px; width:140px; margin-bottom:4px;"
          ><br>
          <label>Đơn vị:</label><br>
          <input
            id="elec-unit-label-input"
            type="text"
            value="${elec.unitLabel}"
            style="padding:4px; width:140px; margin-bottom:6px;"
          ><br>
          <button id="save-elec-price-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu đơn giá điện
          </button>
          <div id="elec-price-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>

        <!-- Form đổi giá nước (ẩn) -->
        <div id="water-price-form" style="display:none; margin-top:10px; font-size:13px;">
          <div style="margin-bottom:4px;"><b>Đổi đơn giá nước</b></div>
          <label>Đơn giá:</label><br>
          <input
            id="water-unit-price-input"
            type="number"
            value="${water.unitPrice}"
            style="padding:4px; width:140px; margin-bottom:4px;"
          ><br>
          <label>Đơn vị:</label><br>
          <input
            id="water-unit-label-input"
            type="text"
            value="${water.unitLabel}"
            style="padding:4px; width:140px; margin-bottom:6px;"
          ><br>
          <button id="save-water-price-btn" style="padding:4px 10px; font-size:13px;">
            💾 Lưu đơn giá nước
          </button>
          <div id="water-price-msg" style="margin-top:4px; font-size:12px;"></div>
        </div>
      </section>

      <hr style="margin:16px 0; border:none; border-top:1px solid #e5e7eb;">

      <!-- Danh sách chi phí chung -->
      <section class="cost-section">
        <h4>Danh sách các chi phí khác</h4>
        <p style="font-size:13px; color:#4b5563; margin-bottom:8px;">
          Ví dụ: tiền rác, internet, gửi xe... Mỗi chi phí chỉ gồm tên, số tiền mặc định và đơn vị.
        </p>

        ${
          costs.length === 0
            ? `<p style="font-size:13px;">Chưa có chi phí nào. Hãy thêm chi phí mới.</p>`
            : `
          <table style="border-collapse:collapse; width:100%; font-size:13px; margin-bottom:8px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:4px; text-align:left;">Tên chi phí</th>
                <th style="padding:4px; text-align:left;">Số tiền mặc định</th>
                <th style="padding:4px; text-align:left;">Đơn vị tính</th>
                <th style="padding:4px; text-align:left;">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              ${costs
                .map((c, idx) => {
                  const amount = c.amount != null ? c.amount : 0;
                  const unit = c.unit || "";
                  return `
                    <tr data-cost-index="${idx}">
                      <td style="padding:4px;">${c.name}</td>
                      <td style="padding:4px;">
                        <input
                          type="number"
                          class="cost-amount-input"
                          data-index="${idx}"
                          value="${amount}"
                          style="width:120px; padding:4px;"
                        >
                      </td>
                      <td style="padding:4px;">
                        <input
                          type="text"
                          class="cost-unit-input"
                          data-index="${idx}"
                          value="${unit}"
                          style="width:120px; padding:4px;"
                          placeholder="VD: người, phòng, tháng..."
                        >
                      </td>
                      <td style="padding:4px;">
                        <button
                          class="delete-cost-btn"
                          data-index="${idx}"
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

        <button id="toggle-add-cost-form-btn" style="padding:6px 10px; font-size:13px;">
          ➕ Thêm chi phí mới
        </button>

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

    // ===== Events: bulk meter =====
    const bulkElecBtn = document.getElementById("bulk-electricity-btn");
    const bulkWaterBtn = document.getElementById("bulk-water-btn");
    bulkElecBtn.onclick = () => openBulkMeterModal(appState, "electricity");
    bulkWaterBtn.onclick = () => openBulkMeterModal(appState, "water");

    // ===== Export all invoices =====
    const exportAllBtn = document.getElementById("export-all-invoices-btn");
exportAllBtn.onclick = () => {
  if (!window.openInvoicesForAllOccupiedRooms) {
    alert("Thiếu invoice.js (window.openInvoicesForAllOccupiedRooms).");
    return;
  }
  window.openInvoicesForAllOccupiedRooms(appState);
};

    // ===== Toggle price forms =====
    const toggleElecBtn = document.getElementById("toggle-elec-price-btn");
    const elecForm = document.getElementById("elec-price-form");
    toggleElecBtn.onclick = () => {
      elecForm.style.display =
        elecForm.style.display === "none" || elecForm.style.display === ""
          ? "block"
          : "none";
    };

    const toggleWaterBtn = document.getElementById("toggle-water-price-btn");
    const waterForm = document.getElementById("water-price-form");
    toggleWaterBtn.onclick = () => {
      waterForm.style.display =
        waterForm.style.display === "none" || waterForm.style.display === ""
          ? "block"
          : "none";
    };

    // ===== Save elec price =====
    const elecUnitPriceInput = document.getElementById("elec-unit-price-input");
    const elecUnitLabelInput = document.getElementById("elec-unit-label-input");
    const saveElecBtn = document.getElementById("save-elec-price-btn");
    const elecMsg = document.getElementById("elec-price-msg");

    saveElecBtn.onclick = () => {
      const price = Number(elecUnitPriceInput.value || "0");
      const label = elecUnitLabelInput.value.trim() || "kWh";
      if (price < 0 || Number.isNaN(price)) {
        elecMsg.style.color = "#b91c1c";
        elecMsg.innerText = "Đơn giá điện không hợp lệ.";
        return;
      }
      appState.meterPrices.electricity.unitPrice = price;
      appState.meterPrices.electricity.unitLabel = label;
      if (window.saveAppState) window.saveAppState();
      elecMsg.style.color = "#16a34a";
      elecMsg.innerText = "Đã lưu đơn giá điện.";
      renderCosts(mainContent, appState);
    };

    // ===== Save water price =====
    const waterUnitPriceInput = document.getElementById("water-unit-price-input");
    const waterUnitLabelInput = document.getElementById("water-unit-label-input");
    const saveWaterBtn = document.getElementById("save-water-price-btn");
    const waterMsg = document.getElementById("water-price-msg");

    saveWaterBtn.onclick = () => {
      const price = Number(waterUnitPriceInput.value || "0");
      const label = waterUnitLabelInput.value.trim() || "m³";
      if (price < 0 || Number.isNaN(price)) {
        waterMsg.style.color = "#b91c1c";
        waterMsg.innerText = "Đơn giá nước không hợp lệ.";
        return;
      }
      appState.meterPrices.water.unitPrice = price;
      appState.meterPrices.water.unitLabel = label;
      if (window.saveAppState) window.saveAppState();
      waterMsg.style.color = "#16a34a";
      waterMsg.innerText = "Đã lưu đơn giá nước.";
      renderCosts(mainContent, appState);
    };

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
        appState.costs[idx].unit = inp.value.trim();
        if (window.saveAppState) window.saveAppState();
      };
    });

    // ===== Delete cost =====
    mainContent.querySelectorAll(".delete-cost-btn").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-index"));
      btn.onclick = () => {
        if (!confirm("Xóa chi phí này?")) return;
        appState.costs.splice(idx, 1);
        if (window.saveAppState) window.saveAppState();
        renderCosts(mainContent, appState);
      };
    });

    // ===== Toggle add cost form =====
    const toggleAddCostBtn = document.getElementById("toggle-add-cost-form-btn");
    const addCostForm = document.getElementById("add-cost-form");
    toggleAddCostBtn.onclick = () => {
      addCostForm.style.display =
        addCostForm.style.display === "none" || addCostForm.style.display === ""
          ? "block"
          : "none";
    };

    // ===== Save new cost =====
    const newCostName = document.getElementById("new-cost-name");
    const newCostAmount = document.getElementById("new-cost-amount");
    const newCostUnit = document.getElementById("new-cost-unit");
    const saveNewCostBtn = document.getElementById("save-new-cost-btn");
    const addCostMsg = document.getElementById("add-cost-msg");

    saveNewCostBtn.onclick = () => {
      const name = newCostName.value.trim();
      const amount = Number(newCostAmount.value || "0");
      const unit = newCostUnit.value.trim();

      if (!name) {
        addCostMsg.style.color = "#b91c1c";
        addCostMsg.innerText = "Tên chi phí là bắt buộc.";
        return;
      }
      if (costs.some((c) => c.name === name)) {
        addCostMsg.style.color = "#b91c1c";
        addCostMsg.innerText = "Đã tồn tại chi phí trùng tên.";
        return;
      }
      if (amount < 0 || Number.isNaN(amount)) {
        addCostMsg.style.color = "#b91c1c";
        addCostMsg.innerText = "Số tiền không hợp lệ.";
        return;
      }

      costs.push({ name, amount, unit });
      if (window.saveAppState) window.saveAppState();

      addCostMsg.style.color = "#16a34a";
      addCostMsg.innerText = "Đã thêm chi phí mới.";

      newCostName.value = "";
      newCostAmount.value = "";
      newCostUnit.value = "";

      renderCosts(mainContent, appState);
    };
  }

  window.renderCosts = renderCosts;
})();