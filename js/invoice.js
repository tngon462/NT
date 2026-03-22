// js/invoice.js
(function () {
  const BRAND = {
    title: "PHIẾU THU TIỀN PHÒNG TRỌ THIỆP MẾN",
    phone: "0963 954 006",
    bankLine: "Cop-opBank: 2700 300 512 666 888 / NGUYỄN THỊ MẾN",
  };

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
    return Number.isNaN(x) ? "0" : x.toLocaleString("vi-VN");
  }

  function safeNum(v) {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }

  function ensureState(appState) {
    if (!Array.isArray(appState.rooms)) appState.rooms = [];
    if (!Array.isArray(appState.costs)) appState.costs = [];
    if (!Array.isArray(appState.invoices)) appState.invoices = [];

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
  }

  function getRoom(appState, roomNumber) {
    return (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
  }

  function getFirstTenantName(room) {
    if (!room || !Array.isArray(room.tenants) || room.tenants.length === 0) return "";
    const owner = room.tenants.find((t) => t.isOwner);
    return owner?.fullName || room.tenants[0]?.fullName || "";
  }

  function normalizeText(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function getUtilityConfig(appState, type) {
    const costs = Array.isArray(appState.costs) ? appState.costs : [];
    const fromUnitPrices = appState.costUnitPrices?.[type] || {};

    const keywords =
      type === "electricity"
        ? ["dien", "tien dien", "điện", "tiền điện"]
        : ["nuoc", "tien nuoc", "nước", "tiền nước"];

    const foundCost =
      costs.find((c) => {
        const name = normalizeText(c?.name);
        return keywords.some((k) => name.includes(normalizeText(k)));
      }) || null;

    const price =
      Number(fromUnitPrices?.price || 0) > 0
        ? Number(fromUnitPrices.price)
        : Number(foundCost?.amount || 0);

    const unit =
      String(fromUnitPrices?.unit || "").trim() ||
      String(foundCost?.unit || "").trim() ||
      (type === "electricity" ? "kWh" : "m³");

    return { price, unit };
  }

  function getMeterHistory(appState, type) {
    const meter = (appState.meters && appState.meters[type]) || {};
    return Array.isArray(meter.history) ? meter.history : [];
  }

  function normalizeMeterRecord(h) {
    return {
      roomNumber: String(h?.roomNumber || ""),
      period: String(h?.period || ""),
      date: toISO10(h?.date || ""),
      prev: safeNum(h?.prev),
      curr: safeNum(h?.curr),
      used:
        h?.used != null && !Number.isNaN(Number(h.used))
          ? Number(h.used)
          : Math.max(0, safeNum(h?.curr) - safeNum(h?.prev)),
      savedAt: h?.savedAt || "",
    };
  }

  function getRoomMeterRecords(appState, type, roomNumber) {
    return getMeterHistory(appState, type)
      .map(normalizeMeterRecord)
      .filter((h) => String(h.roomNumber) === String(roomNumber));
  }

  function sortMeterRecordsAsc(records) {
    return records.slice().sort((a, b) => {
      const ka = `${a.period}|${a.date}|${a.savedAt}`;
      const kb = `${b.period}|${b.date}|${b.savedAt}`;
      return ka.localeCompare(kb);
    });
  }

  function latestReadingByPeriod(appState, type, roomNumber, ym) {
    const records = getRoomMeterRecords(appState, type, roomNumber)
      .filter((h) => String(h.period) === String(ym));

    if (!records.length) return null;
    const sorted = sortMeterRecordsAsc(records);
    return sorted[sorted.length - 1];
  }

  function latestReadingUpToDate(appState, type, roomNumber, toDate) {
    const records = getRoomMeterRecords(appState, type, roomNumber)
      .filter((h) => h.date && h.date <= toDate);

    if (!records.length) return null;
    const sorted = sortMeterRecordsAsc(records);
    return sorted[sorted.length - 1];
  }

  function prevReadingBeforeMonth(appState, type, roomNumber, ym) {
    const records = getRoomMeterRecords(appState, type, roomNumber)
      .filter((h) => {
        if (h.period) return h.period < ym;
        if (h.date) return ymOf(h.date) < ym;
        return false;
      });

    if (!records.length) return 0;
    const sorted = sortMeterRecordsAsc(records);
    return Number(sorted[sorted.length - 1].curr || 0);
  }

  function getLatestMeterPeriodForRoom(appState, roomNumber) {
    const all = [
      ...getRoomMeterRecords(appState, "electricity", roomNumber),
      ...getRoomMeterRecords(appState, "water", roomNumber),
    ];

    if (!all.length) return ymOf(todayISO());

    const sorted = sortMeterRecordsAsc(all);
    const last = sorted[sorted.length - 1];
    return last.period || ymOf(last.date) || ymOf(todayISO());
  }

  function getMeterLineData(appState, type, roomNumber, ym, toDate) {
    const recByPeriod = latestReadingByPeriod(appState, type, roomNumber, ym);
    const recByDate = latestReadingUpToDate(appState, type, roomNumber, toDate);
    const rec = recByPeriod || recByDate;

    if (rec) {
      const prev = Number(rec.prev || 0);
      const curr = Number(rec.curr || 0);
      const used =
        rec.used != null && !Number.isNaN(Number(rec.used))
          ? Number(rec.used)
          : Math.max(0, curr - prev);

      return {
        prev,
        curr,
        used,
        date: rec.date || "",
        period: rec.period || ym,
        hasData: true,
        source: recByPeriod ? "period" : "date",
      };
    }

    const fallbackPrev = prevReadingBeforeMonth(appState, type, roomNumber, ym);
    return {
      prev: fallbackPrev,
      curr: fallbackPrev,
      used: 0,
      date: "",
      period: ym,
      hasData: false,
      source: "none",
    };
  }

  function calcRentLine(room, fromDate, toDate) {
    const priceMonth = Number(room.price || 0);
    if (!priceMonth) {
      return {
        name: "Tiền phòng",
        unitPrice: 0,
        qty: 1,
        unit: "tháng",
        total: 0,
        note: "",
      };
    }

    const ym = ymOf(fromDate);
    const monthFirst = firstDayOfMonth(ym);
    const monthLast = lastDayOfMonth(ym);
    const daysInMonth = daysBetweenInclusive(monthFirst, monthLast);
    const stayDays = daysBetweenInclusive(fromDate, toDate);
    const isFullMonth = fromDate === monthFirst && toDate === monthLast;

    if (isFullMonth) {
      return {
        name: "Tiền phòng",
        unitPrice: priceMonth,
        qty: 1,
        unit: "tháng",
        total: priceMonth,
        note: "Ở đủ tháng",
      };
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

  function buildBaseLines(room, appState, fromDate, toDate) {
    const lines = [];
    lines.push(calcRentLine(room, fromDate, toDate));

    const baseCosts = appState.costs || [];
    const items = Array.isArray(room.costItems) ? room.costItems : [];

    items.forEach((ci) => {
      const nameNorm = normalizeText(ci.name);
      if (
        nameNorm.includes("dien") ||
        nameNorm.includes("điện") ||
        nameNorm.includes("nuoc") ||
        nameNorm.includes("nước")
      ) {
        return;
      }

      const base = baseCosts.find((c) => c.name === ci.name) || {};
      const baseAmount = Number(base.amount || 0);
      const unit = base.unit || "";

      const unitPrice =
        ci.amountOverride != null &&
        ci.amountOverride !== "" &&
        !Number.isNaN(Number(ci.amountOverride))
          ? Number(ci.amountOverride)
          : baseAmount;

      const qty =
        ci.quantity != null &&
        ci.quantity !== "" &&
        !Number.isNaN(Number(ci.quantity))
          ? Number(ci.quantity)
          : 1;

      lines.push({
        name: ci.name,
        unitPrice,
        qty,
        unit,
        total: unitPrice * qty,
        note: "",
      });
    });

    return lines;
  }

  function buildUtilityLines(appState, roomNumber, ym, toDate) {
    const lines = [];

    ["electricity", "water"].forEach((type) => {
      const cfg = getUtilityConfig(appState, type);
      const meter = getMeterLineData(appState, type, roomNumber, ym, toDate);

      const displayName = type === "electricity" ? "Tiền điện" : "Tiền nước";
      const total = Number(cfg.price || 0) * Number(meter.used || 0);

      lines.push({
        name: displayName,
        label: displayName,
        type,
        unitPrice: Number(cfg.price || 0),
        qty: Number(meter.used || 0),
        usage: Number(meter.used || 0),
        unit: cfg.unit || (type === "electricity" ? "kWh" : "m³"),
        total,
        amount: total,
        note:
          `Số cũ: ${meter.prev} → Số mới: ${meter.curr}` +
          (meter.date ? `\nNgày chốt: ${meter.date}` : "") +
          (meter.period ? `\nKỳ: ${meter.period}` : ""),
        oldReading: meter.prev,
        newReading: meter.curr,
        used: meter.used,
        meterDate: meter.date || "",
        meterPeriod: meter.period || ym,
      });
    });

    return lines;
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
      <div style="background:#fff; width:min(980px, 96vw); max-height:92vh; overflow:auto; border-radius:14px; padding:14px; box-shadow:0 10px 30px rgba(0,0,0,.25);">
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

    return { close, overlay };
  }

  function buildPrintA5Html({ title, room, fromDate, toDate, tenantName, lines }) {
    const sum = lines.reduce((a, l) => a + Number(l.total || l.amount || 0), 0);

    const rows = lines
      .map((l, i) => {
        return `
          <tr>
            <td class="c-stt">${i + 1}</td>
            <td class="c-name">
              <div class="name">${escapeHtml(l.name || l.label || "")}</div>
              ${l.note ? `<div class="note">${escapeHtml(l.note)}</div>` : ""}
            </td>
            <td class="c-unitprice">${fmtMoney(l.unitPrice)}</td>
            <td class="c-qty">${fmtMoney(l.qty)}</td>
            <td class="c-unit">${escapeHtml(l.unit || "")}</td>
            <td class="c-total">${fmtMoney(l.total || l.amount || 0)}</td>
          </tr>
        `;
      })
      .join("");

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
    .header { text-align:center; margin-top: 4px; }
    .title { font-size: 15px; font-weight: 900; }
    .sub { margin-top: 6px; font-size: 11px; line-height: 1.3; }
    .meta { margin-top: 10px; font-size: 12px; line-height: 1.4; }
    .tbl { width:100%; border-collapse:collapse; margin-top:10px; }
    .tbl th, .tbl td { border:1px solid #333; padding:4px; vertical-align:top; }
    .tbl th { background:#f2f2f2; }
    .c-stt { width:34px; text-align:center; }
    .c-unitprice, .c-qty, .c-total { width:80px; text-align:right; }
    .c-unit { width:45px; text-align:center; }
    .note { margin-top:2px; font-size:10px; color:#555; white-space:pre-line; }
    .sum { margin-top:10px; }
    .sum-row { display:flex; justify-content:space-between; border:1px solid #333; padding:6px; }
    .sum-row .label { font-weight:900; }
    .sum-row .value { font-weight:900; font-size:13px; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>

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

  <div class="sum">
    <div class="sum-row">
      <div class="label">Tổng cộng</div>
      <div class="value">${fmtMoney(sum)} đ</div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  function openPrintWindow(html) {
    const w = window.open("", "_blank");
    if (!w) return alert("Trình duyệt đang chặn pop-up. Cho phép pop-up để in phiếu.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function saveInvoiceToState({
    appState,
    room,
    tenantName,
    fromDate,
    toDate,
    lines,
    title,
    printHtml,
    metaType = "monthly",
  }) {
    const totalAmount = lines.reduce((a, l) => a + Number(l.total || l.amount || 0), 0);
    const invoiceDate = toDate || todayISO();

    const invoice = {
      roomNumber: room.number,
      tenantName,
      issueDate: todayISO(),
      invoiceDate,
      periodFrom: fromDate,
      periodTo: toDate,
      title,
      lines,
      items: lines,
      totalAmount,
      total: totalAmount,
      printHtml,
      status: "unpaid",
      missingAmount: 0,
      deleted: false,
      meta: {
        type: metaType,
      },
    };

    if (typeof window.addInvoice === "function") {
      return window.addInvoice(invoice);
    }

    if (!Array.isArray(appState.invoices)) appState.invoices = [];
    invoice.id = `inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    appState.invoices.unshift(invoice);
    if (window.saveAppState) window.saveAppState();
    return invoice;
  }

  function buildInvoiceLines(room, appState, fromDate, toDate) {
    const baseLines = buildBaseLines(room, appState, fromDate, toDate);
    const utilityLines = buildUtilityLines(appState, room.number, ymOf(toDate), toDate);
    return [...baseLines, ...utilityLines];
  }

  function openInvoiceForRoom(roomNumber, appState) {
    ensureState(appState);

    const room = getRoom(appState, roomNumber);
    if (!room) return alert("Không tìm thấy phòng: " + roomNumber);

    const tenantName = getFirstTenantName(room);

    // FIX: lấy kỳ gần nhất đã chốt của chính phòng này
    const latestYM = getLatestMeterPeriodForRoom(appState, roomNumber);
    const defaultFrom = firstDayOfMonth(latestYM);
    const defaultTo = lastDayOfMonth(latestYM);

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">🧾 Tạo hóa đơn phòng ${escapeHtml(room.number)}</h3>
        <button id="inv-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Từ ngày</label><br>
          <input id="inv-from-date" type="date" value="${defaultFrom}" style="padding:8px; width:100%;">
        </div>

        <div>
          <label style="font-size:13px;">Đến ngày</label><br>
          <input id="inv-to-date" type="date" value="${defaultTo}" style="padding:8px; width:100%;">
        </div>

        <div>
          <label style="font-size:13px;">Người thuê</label><br>
          <input id="inv-tenant-name" type="text" value="${escapeHtml(tenantName)}" style="padding:8px; width:100%;">
        </div>

        <div>
          <label style="font-size:13px;">Tiêu đề</label><br>
          <input id="inv-title" type="text" value="Hóa đơn xuất phòng ${escapeHtml(room.number)} kỳ ${latestYM}" style="padding:8px; width:100%;">
        </div>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="inv-preview-btn" style="padding:8px 12px;">👁 Xem trước</button>
        <button id="inv-save-btn" style="padding:8px 12px; font-weight:700;">💾 Tạo & lưu hóa đơn</button>
        <button id="inv-print-btn" style="padding:8px 12px;">🖨 Tạo & in ngay</button>
      </div>

      <div id="inv-msg" style="margin-top:10px; font-size:12px;"></div>
      <div id="inv-preview-box" style="margin-top:12px; border:1px solid #e5e7eb; border-radius:10px; padding:12px; max-height:50vh; overflow:auto;"></div>
    `);

    const closeBtn = document.getElementById("inv-close-btn");
    const fromInput = document.getElementById("inv-from-date");
    const toInput = document.getElementById("inv-to-date");
    const tenantInput = document.getElementById("inv-tenant-name");
    const titleInput = document.getElementById("inv-title");
    const previewBtn = document.getElementById("inv-preview-btn");
    const saveBtn = document.getElementById("inv-save-btn");
    const printBtn = document.getElementById("inv-print-btn");
    const msgEl = document.getElementById("inv-msg");
    const previewBox = document.getElementById("inv-preview-box");

    if (closeBtn) closeBtn.onclick = close;

    function buildDraft() {
      const fromDate = toISO10(fromInput.value) || defaultFrom;
      const toDate = toISO10(toInput.value) || defaultTo;
      const tenantNameVal = (tenantInput.value || "").trim();
      const titleVal =
        (titleInput.value || "").trim() ||
        `Hóa đơn xuất phòng ${room.number} kỳ ${latestYM}`;

      const lines = buildInvoiceLines(room, appState, fromDate, toDate);
      const printHtml = buildPrintA5Html({
        title: titleVal,
        room,
        fromDate,
        toDate,
        tenantName: tenantNameVal,
        lines,
      });

      return {
        room,
        tenantName: tenantNameVal,
        fromDate,
        toDate,
        title: titleVal,
        lines,
        printHtml,
      };
    }

    function renderPreview() {
      const draft = buildDraft();
      const total = draft.lines.reduce((a, l) => a + Number(l.total || l.amount || 0), 0);

      previewBox.innerHTML = `
        <div style="font-weight:800; margin-bottom:8px;">${escapeHtml(draft.title)}</div>
        <div style="font-size:13px; color:#4b5563; margin-bottom:8px;">
          Phòng ${escapeHtml(draft.room.number)} | ${escapeHtml(draft.fromDate)} → ${escapeHtml(draft.toDate)} | Người thuê: ${escapeHtml(draft.tenantName || "(chưa có)")}
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:left;">Nội dung</th>
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:right;">Đơn giá</th>
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:right;">SL</th>
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:left;">ĐV</th>
              <th style="padding:6px; border:1px solid #e5e7eb; text-align:right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${draft.lines
              .map(
                (l) => `
                  <tr>
                    <td style="padding:6px; border:1px solid #e5e7eb;">
                      <div><b>${escapeHtml(l.name || l.label || "")}</b></div>
                      ${l.note ? `<div style="font-size:11px; color:#6b7280; white-space:pre-line;">${escapeHtml(l.note)}</div>` : ""}
                    </td>
                    <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${fmtMoney(l.unitPrice)}</td>
                    <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${fmtMoney(l.qty)}</td>
                    <td style="padding:6px; border:1px solid #e5e7eb;">${escapeHtml(l.unit || "")}</td>
                    <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;"><b>${fmtMoney(l.total || l.amount || 0)}</b></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>

        <div style="margin-top:10px; text-align:right; font-size:15px;">
          <b>Tổng cộng: ${fmtMoney(total)} đ</b>
        </div>
      `;
    }

    if (previewBtn) {
      previewBtn.onclick = () => {
        renderPreview();
        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã cập nhật xem trước.";
      };
    }

    if (saveBtn) {
      saveBtn.onclick = () => {
        const draft = buildDraft();
        saveInvoiceToState({
          appState,
          room: draft.room,
          tenantName: draft.tenantName,
          fromDate: draft.fromDate,
          toDate: draft.toDate,
          lines: draft.lines,
          title: draft.title,
          printHtml: draft.printHtml,
          metaType: "monthly",
        });

        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã tạo hóa đơn cho phòng ${room.number}.`;
        renderPreview();
      };
    }

    if (printBtn) {
      printBtn.onclick = () => {
        const draft = buildDraft();
        saveInvoiceToState({
          appState,
          room: draft.room,
          tenantName: draft.tenantName,
          fromDate: draft.fromDate,
          toDate: draft.toDate,
          lines: draft.lines,
          title: draft.title,
          printHtml: draft.printHtml,
          metaType: "monthly",
        });

        openPrintWindow(draft.printHtml);
        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã tạo hóa đơn và mở cửa sổ in cho phòng ${room.number}.`;
      };
    }

    renderPreview();
  }

  window.openInvoiceForRoom = openInvoiceForRoom;
})();
