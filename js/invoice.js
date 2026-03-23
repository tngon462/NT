// js/invoice.js

(function () {
  const BRAND = {
    title: "PHIẾU THU TIỀN PHÒNG TRỌ THIỆP MẾN",
    phone: "0963 954 006",
    bankLine: "Cop-opBank: 2700 300 512 666 888 / NGUYỄN THỊ MẾN",
    address: "",
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
    if (!appState || typeof appState !== "object") return;

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

  function normalizeText(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function getRoom(appState, roomNumber) {
    return (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
  }

  function isRoomOccupied(room) {
    if (!room) return false;
    return Array.isArray(room.tenants) && room.tenants.length > 0;
  }

  function getOccupiedRooms(appState) {
    return (appState.rooms || []).filter(isRoomOccupied).sort((a, b) =>
      String(a.number).localeCompare(String(b.number), "vi")
    );
  }

  function getAllRooms(appState) {
    return (appState.rooms || []).slice().sort((a, b) =>
      String(a.number).localeCompare(String(b.number), "vi")
    );
  }

  function getFirstTenantName(room) {
    if (!room || !Array.isArray(room.tenants) || room.tenants.length === 0) return "";
    const owner = room.tenants.find((t) => t && t.isOwner);
    return owner?.fullName || room.tenants[0]?.fullName || "";
  }

  function getRoomDeposit(room) {
    const n = Number(room?.deposit || 0);
    return Number.isNaN(n) ? 0 : n;
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
    const records = getRoomMeterRecords(appState, type, roomNumber).filter(
      (h) => String(h.period) === String(ym)
    );

    if (!records.length) return null;
    const sorted = sortMeterRecordsAsc(records);
    return sorted[sorted.length - 1];
  }

  function latestReadingUpToDate(appState, type, roomNumber, toDate) {
    const records = getRoomMeterRecords(appState, type, roomNumber).filter(
      (h) => h.date && h.date <= toDate
    );

    if (!records.length) return null;
    const sorted = sortMeterRecordsAsc(records);
    return sorted[sorted.length - 1];
  }

  function prevReadingBeforeMonth(appState, type, roomNumber, ym) {
    const records = getRoomMeterRecords(appState, type, roomNumber).filter((h) => {
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
      note: `Tính ${stayDays}/${daysInMonth} ngày`,
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

      const shortLine1 =
        `Cũ ${meter.prev} | Mới ${meter.curr} | Dùng ${meter.used} ${cfg.unit || (type === "electricity" ? "kWh" : "m³")}`;
      const shortLine2 =
        meter.date || meter.period
          ? `Chốt ${meter.date || ""}${meter.date && meter.period ? " | " : ""}${meter.period ? "Kỳ " + meter.period : ""}`.trim()
          : "";

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
        note: shortLine2 ? `${shortLine1}\n${shortLine2}` : shortLine1,
        oldReading: meter.prev,
        newReading: meter.curr,
        used: meter.used,
        meterDate: meter.date || "",
        meterPeriod: meter.period || ym,
      });
    });

    return lines;
  }

  function buildInvoiceLines(room, appState, fromDate, toDate) {
    const baseLines = buildBaseLines(room, appState, fromDate, toDate);
    const utilityLines = buildUtilityLines(appState, room.number, ymOf(toDate), toDate);
    return [...baseLines, ...utilityLines];
  }

  function buildPrintA5Html({
    title,
    room,
    fromDate,
    toDate,
    tenantName,
    lines,
    depositAmount = 0,
    code = "",
  }) {
    const sum = lines.reduce((a, l) => a + Number(l.total || l.amount || 0), 0);

    const rows = lines
      .map((l, i) => {
        const noteHtml = l.note ? `<div class="line-note">${escapeHtml(l.note)}</div>` : "";

        return `
          <tr>
            <td class="col-stt">${i + 1}</td>
            <td class="col-name">
              <div class="line-name">${escapeHtml(l.name || l.label || "")}</div>
              ${noteHtml}
            </td>
            <td class="col-unitprice">${fmtMoney(l.unitPrice)}</td>
            <td class="col-qty">${fmtMoney(l.qty)}</td>
            <td class="col-unit">${escapeHtml(l.unit || "")}</td>
            <td class="col-total">${fmtMoney(l.total || l.amount || 0)}</td>
          </tr>
        `;
      })
      .join("");

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || BRAND.title)}</title>
  <style>
    @page { size: A5 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      font-size: 11px;
      background: #fff;
    }
    .toolbar {
      padding: 8px;
      border-bottom: 1px solid #d1d5db;
      display: flex;
      gap: 8px;
      align-items: center;
      background: #fff;
    }
    .toolbar button {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
    }
    .page { padding: 3px 2px 0; }
    .doc-header {
      text-align: center;
      border: 1.5px solid #111827;
      padding: 7px 8px 6px;
      margin-bottom: 6px;
    }
    .doc-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .doc-subtitle {
      font-size: 10px;
      color: #374151;
      line-height: 1.35;
    }
    .invoice-code {
      margin-top: 3px;
      font-size: 10px;
      color: #4b5563;
    }
    .meta-grid {
      width: 100%;
      border: 1px solid #111827;
      border-bottom: none;
      margin-bottom: 0;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 108px 1fr 108px 1fr;
      border-bottom: 1px solid #111827;
      min-height: 26px;
    }
    .meta-label {
      padding: 5px 7px;
      font-weight: 700;
      border-right: 1px solid #111827;
      background: #f9fafb;
    }
    .meta-value {
      padding: 5px 7px;
      border-right: 1px solid #111827;
    }
    .meta-row .meta-value:last-child {
      border-right: none;
    }

    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 0;
    }
    .invoice-table th,
    .invoice-table td {
      border: 1px solid #111827;
      padding: 4px 5px;
      vertical-align: top;
    }
    .invoice-table th {
      text-align: center;
      font-weight: 700;
      background: #f3f4f6;
      font-size: 10px;
    }
    .col-stt { width: 30px; text-align: center; }
    .col-name { width: auto; }
    .col-unitprice { width: 72px; text-align: right; white-space: nowrap; }
    .col-qty { width: 50px; text-align: right; white-space: nowrap; }
    .col-unit { width: 48px; text-align: center; white-space: nowrap; }
    .col-total { width: 88px; text-align: right; white-space: nowrap; font-weight: 700; }
    .line-name { font-weight: 700; margin-bottom: 1px; }
    .line-note {
      font-size: 9px;
      line-height: 1.25;
      color: #6b7280;
      white-space: pre-line;
    }
    .summary-box {
      border: 1.5px solid #111827;
      border-top: none;
      padding: 6px 8px;
      margin-top: 0;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      font-weight: 800;
    }
    .summary-value {
      font-size: 15px;
      font-weight: 800;
    }
    .footer-wrap {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 14px;
      margin-top: 8px;
      align-items: start;
    }
    .footer-note {
      font-size: 9px;
      color: #4b5563;
      line-height: 1.35;
    }
    .sign-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      text-align: center;
      font-size: 10px;
    }
    .sign-title {
      font-weight: 700;
      margin-bottom: 28px;
    }
    @media print {
      .toolbar { display: none; }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>

  <div class="page">
    <div class="doc-header">
      <div class="doc-title">${escapeHtml(title || BRAND.title)}</div>
      ${code ? `<div class="invoice-code">Mã hóa đơn: ${escapeHtml(code)}</div>` : ""}
      <div class="doc-subtitle">
        <div><b>SĐT:</b> ${escapeHtml(BRAND.phone)}</div>
        <div><b>STK:</b> ${escapeHtml(BRAND.bankLine)}</div>
        ${BRAND.address ? `<div><b>Địa chỉ:</b> ${escapeHtml(BRAND.address)}</div>` : ""}
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-row">
        <div class="meta-label">Phòng số</div>
        <div class="meta-value"><b>${escapeHtml(room.number)}</b></div>
        <div class="meta-label">Người thuê</div>
        <div class="meta-value">${escapeHtml(tenantName || "(chưa có)")}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Từ ngày</div>
        <div class="meta-value"><b>${escapeHtml(fromDate)}</b></div>
        <div class="meta-label">Đến ngày</div>
        <div class="meta-value"><b>${escapeHtml(toDate)}</b></div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Tiền cọc</div>
        <div class="meta-value"><b>${fmtMoney(depositAmount)} đ</b></div>
        <div class="meta-label">Ngày lập</div>
        <div class="meta-value"><b>${escapeHtml(todayISO())}</b></div>
      </div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th class="col-stt">STT</th>
          <th class="col-name">Nội dung</th>
          <th class="col-unitprice">Đơn giá</th>
          <th class="col-qty">SL</th>
          <th class="col-unit">ĐV</th>
          <th class="col-total">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row">
        <div>TỔNG CỘNG THANH TOÁN</div>
        <div class="summary-value">${fmtMoney(sum)} đ</div>
      </div>
    </div>

    <div class="footer-wrap">
      <div class="footer-note">
        Ghi chú: Điện/nước được ghi ngắn gọn để hóa đơn gọn hơn nhưng vẫn đủ đối chiếu số cũ, số mới và lượng dùng.
      </div>

      <div class="sign-row">
        <div>
          <div class="sign-title">Người lập phiếu</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div>
          <div class="sign-title">Người nộp tiền</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  function buildBatchCombinedHtml(invoices) {
    const pages = invoices
      .map((inv) => {
        const html = inv.printHtml && String(inv.printHtml).trim();
        if (html) {
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          const body = bodyMatch ? bodyMatch[1] : html;
          return `<div class="page">${body}</div>`;
        }

        return `
          <div class="page">
            <div style="padding:10mm; font-family:Arial,sans-serif;">
              <h2 style="text-align:center; margin:0 0 10px 0;">${escapeHtml(inv.title || BRAND.title)}</h2>
              <div><b>Phòng:</b> ${escapeHtml(inv.roomNumber)}</div>
              <div><b>Người thuê:</b> ${escapeHtml(inv.tenantName || "")}</div>
              <div><b>Ngày tạo:</b> ${escapeHtml(inv.issueDate || "")}</div>
              <div><b>Tổng tiền:</b> ${fmtMoney(inv.total || 0)} đ</div>
            </div>
          </div>
        `;
      })
      .join("");

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Toàn bộ hóa đơn</title>
  <style>
    @page { size: A5 landscape; margin: 7mm; }
    body { margin:0; font-family: Arial, sans-serif; }
    .toolbar {
      position: sticky;
      top: 0;
      background: #fff;
      z-index: 9999;
      border-bottom: 1px solid #ddd;
      padding: 8px;
      display:flex;
      gap:8px;
    }
    .toolbar button { padding: 6px 10px; cursor:pointer; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In / Save PDF</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>
  ${pages}
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
    depositAmount = 0,
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
        depositAmount: Number(depositAmount || 0),
      },
    };

    let saved;
    if (typeof window.addInvoice === "function") {
      saved = window.addInvoice(invoice);
    } else {
      if (!Array.isArray(appState.invoices)) appState.invoices = [];
      invoice.id = `inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      appState.invoices.unshift(invoice);
      if (window.saveAppState) window.saveAppState();
      saved = invoice;
    }

    if (saved) {
      saved.meta = saved.meta || {};
      saved.meta.depositAmount = Number(depositAmount || 0);
      if (!saved.printHtml) saved.printHtml = printHtml;
      if (window.saveAppState) window.saveAppState();
    }

    return saved;
  }

  function buildInvoiceDraft(room, appState, fromDate, toDate, tenantName, title) {
    const lines = buildInvoiceLines(room, appState, fromDate, toDate);
    const depositAmount = getRoomDeposit(room);
    const printHtml = buildPrintA5Html({
      title,
      room,
      fromDate,
      toDate,
      tenantName,
      lines,
      depositAmount,
    });

    return {
      room,
      tenantName,
      fromDate,
      toDate,
      title,
      lines,
      depositAmount,
      printHtml,
    };
  }

  async function saveAllInvoicesPdf(invoices) {
    if (!Array.isArray(invoices) || !invoices.length) {
      alert("Không có hóa đơn để lưu PDF.");
      return;
    }

    if (!window.html2pdf) {
      const html = buildBatchCombinedHtml(invoices);
      openPrintWindow(html);
      alert(
        "Chưa có thư viện html2pdf nên em mở cửa sổ in toàn bộ.\n" +
          "Sếp chọn Save as PDF để lưu.\n\n" +
          "Muốn tự tải file PDF bằng nút này thì thêm 2 script html2canvas + html2pdf vào nhatro.html."
      );
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.background = "#fff";
    wrapper.innerHTML = invoices
      .map((inv) => {
        const html = inv.printHtml && String(inv.printHtml).trim();
        if (html) {
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          const body = bodyMatch ? bodyMatch[1] : html;
          return `<div style="page-break-after:always;">${body}</div>`;
        }
        return `<div style="page-break-after:always; padding:10mm; font-family:Arial,sans-serif;">
          <h2>${escapeHtml(inv.title || BRAND.title)}</h2>
          <div>Phòng: ${escapeHtml(inv.roomNumber)}</div>
          <div>Người thuê: ${escapeHtml(inv.tenantName || "")}</div>
          <div>Tổng tiền: ${fmtMoney(inv.total || 0)} đ</div>
        </div>`;
      })
      .join("");

    document.body.appendChild(wrapper);

    try {
      await window
        .html2pdf()
        .set({
          margin: 0,
          filename: `hoa-don-phong-tro-${todayISO()}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a5", orientation: "landscape" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(wrapper)
        .save();
    } catch (err) {
      console.error(err);
      alert("Lưu PDF lỗi. Em sẽ mở cửa sổ in để sếp Save as PDF.");
      openPrintWindow(buildBatchCombinedHtml(invoices));
    } finally {
      wrapper.remove();
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

    return { close, overlay };
  }

  function renderBatchPreviewList(container, drafts) {
    const total = drafts.reduce((a, d) => {
      return a + d.lines.reduce((s, l) => s + Number(l.total || l.amount || 0), 0);
    }, 0);

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
        <div style="font-weight:800;">Danh sách hóa đơn sẽ tạo: ${drafts.length}</div>
        <div style="font-weight:800; color:#1d4ed8;">Tổng cộng: ${fmtMoney(total)} đ</div>
      </div>

      <div style="overflow:auto; border:1px solid #e5e7eb; border-radius:12px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:left;">Phòng</th>
              <th style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:left;">Người thuê</th>
              <th style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:left;">Kỳ</th>
              <th style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right;">Tổng</th>
              <th style="padding:8px; border-bottom:1px solid #e5e7eb; text-align:right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${drafts
              .map((d, idx) => {
                const totalRow = d.lines.reduce((s, l) => s + Number(l.total || l.amount || 0), 0);
                return `
                  <tr>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9;"><b>${escapeHtml(d.room.number)}</b></td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9;">${escapeHtml(d.tenantName || "")}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9;">${escapeHtml(d.fromDate)} → ${escapeHtml(d.toDate)}</td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; text-align:right;"><b>${fmtMoney(totalRow)} đ</b></td>
                    <td style="padding:8px; border-bottom:1px solid #f1f5f9; text-align:right;">
                      <button type="button" data-preview-index="${idx}" style="padding:6px 10px;">🖨 In</button>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getMonthTitleText(fromDate, toDate) {
    const ym = ymOf(toDate || fromDate || todayISO()) || ymOf(todayISO());
    const [y, m] = ym.split("-");
    return `tháng ${Number(m)}/${y}`;
  }

  function buildAcceptanceSheetHtml({ appState, fromDate, toDate }) {
  const rooms = getAllRooms(appState);

  const rows = rooms
    .map((room, idx) => {
      const occupied = isRoomOccupied(room);
      const tenantName = occupied ? getFirstTenantName(room) : "";

      const elec = getMeterLineData(appState, "electricity", room.number, ymOf(toDate), toDate);
      const water = getMeterLineData(appState, "water", room.number, ymOf(toDate), toDate);

      const rowClass = occupied ? "" : "room-empty";
      const roomNote = occupied ? "" : "PHÒNG TRỐNG";

      return `
          <tr class="${rowClass}">
            <td>${idx + 1}</td>
            <td><b>${escapeHtml(room.number)}</b></td>
            <td>${escapeHtml(tenantName)}</td>
            <td class="num">${elec.prev}</td>
            <td></td>
            <td class="num">${water.prev}</td>
            <td></td>
            <td>${escapeHtml(roomNote)}</td>
          </tr>
        `;
    })
    .join("");

  const title = `PHIẾU CHỐT SỐ ĐIỆN NƯỚC NHÀ TRỌ THIỆP MẾN ${getMonthTitleText(fromDate, toDate).toUpperCase()}`;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .toolbar {
      padding: 8px;
      border-bottom: 1px solid #d1d5db;
      display: flex;
      gap: 8px;
      background: #fff;
    }
    .toolbar button {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
    }
    .page { padding: 8px 0 0; }
    .title {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .subline {
      font-size: 14px;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #111827;
      padding: 6px 6px;
      vertical-align: middle;
      height: 32px;
    }
    th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
    }
    td.num { text-align: right; }

    .room-empty td {
      background: #eeeeee !important;
      color: #6b7280;
    }

    .note {
      margin-top: 8px;
      font-size: 12px;
      color: #374151;
    }
    .sign {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
    .sign-box {
      width: 260px;
      text-align: center;
      font-size: 13px;
    }
    .sign-space {
      height: 70px;
    }
    @media print {
      .toolbar { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>

  <div class="page">
    <div class="title">${escapeHtml(title)}</div>
    <div class="subline">Từ ngày <b>${escapeHtml(fromDate)}</b> đến ngày <b>${escapeHtml(toDate)}</b></div>

    <table>
      <thead>
        <tr>
          <th style="width:42px;">STT</th>
          <th style="width:80px;">Phòng</th>
          <th style="width:180px;">Tên chủ phòng</th>
          <th style="width:95px;">Số điện cũ</th>
          <th style="width:95px;">Số điện mới</th>
          <th style="width:95px;">Số nước cũ</th>
          <th style="width:95px;">Số nước mới</th>
          <th>Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="note">
      Dòng nền xám là phòng đang trống. Phòng trống vẫn giữ số điện/nước cũ để tiện theo dõi khi nghiệm thu.
    </div>

    <div class="sign">
      <div class="sign-box">
        <div>Ngày ..... / ..... / ..........</div>
        <div style="margin-top:6px;"><b>Người nghiệm thu</b></div>
        <div class="sign-space"></div>
        <div>(Ký, ghi rõ họ tên)</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

  function buildSummarySheetHtml({ appState, fromDate, toDate }) {
  const rooms = getAllRooms(appState);

  const costColumns = [];
  const seen = new Set();

  rooms.forEach((room) => {
    const items = Array.isArray(room.costItems) ? room.costItems : [];
    items.forEach((ci) => {
      const name = String(ci?.name || "").trim();
      if (!name) return;

      const n = normalizeText(name);
      if (
        n.includes("dien") ||
        n.includes("điện") ||
        n.includes("nuoc") ||
        n.includes("nước")
      ) {
        return;
      }

      if (!seen.has(name)) {
        seen.add(name);
        costColumns.push(name);
      }
    });
  });

  const headerExtra = costColumns
    .map((name) => `<th style="min-width:90px;">${escapeHtml(name)}</th>`)
    .join("");

  const rows = rooms
    .map((room, idx) => {
      const occupied = isRoomOccupied(room);
      const tenantName = occupied ? getFirstTenantName(room) : "";
      const rowClass = occupied ? "" : "room-empty";

      const elecMeter = getMeterLineData(appState, "electricity", room.number, ymOf(toDate), toDate);
      const waterMeter = getMeterLineData(appState, "water", room.number, ymOf(toDate), toDate);

      let elecLine = {
        oldReading: elecMeter.prev,
        newReading: occupied ? elecMeter.curr : "",
        used: occupied ? elecMeter.used : "",
        total: occupied ? 0 : "",
      };

      let waterLine = {
        oldReading: waterMeter.prev,
        newReading: occupied ? waterMeter.curr : "",
        used: occupied ? waterMeter.used : "",
        total: occupied ? 0 : "",
      };

      let extraCells = costColumns.map(() => `<td class="num"></td>`).join("");
      let total = "";
      let note = occupied ? "" : "PHÒNG TRỐNG";

      if (occupied) {
        const draft = buildInvoiceDraft(
          room,
          appState,
          fromDate,
          toDate,
          tenantName,
          `Hóa đơn phòng ${room.number} từ ${fromDate} đến ${toDate}`
        );

        elecLine =
          draft.lines.find((x) => x.type === "electricity") || {
            oldReading: elecMeter.prev,
            newReading: elecMeter.curr,
            used: elecMeter.used,
            total: 0,
          };

        waterLine =
          draft.lines.find((x) => x.type === "water") || {
            oldReading: waterMeter.prev,
            newReading: waterMeter.curr,
            used: waterMeter.used,
            total: 0,
          };

        const otherMap = {};
        draft.lines.forEach((line) => {
          if (line.type === "electricity" || line.type === "water") return;
          if (normalizeText(line.name) === normalizeText("Tiền phòng")) return;
          otherMap[line.name] = Number(line.total || line.amount || 0);
        });

        extraCells = costColumns
          .map((name) => `<td class="num">${fmtMoney(otherMap[name] || 0)}</td>`)
          .join("");

        total = fmtMoney(
          draft.lines.reduce((s, l) => s + Number(l.total || l.amount || 0), 0)
        );
      }

      return `
          <tr class="${rowClass}">
            <td>${idx + 1}</td>
            <td><b>${escapeHtml(room.number)}</b></td>
            <td>${escapeHtml(tenantName)}</td>

            <td class="num">${elecLine.oldReading ?? ""}</td>
            <td class="num">${elecLine.newReading ?? ""}</td>
            <td class="num">${elecLine.used ?? ""}</td>
            <td class="num">${elecLine.total !== "" ? fmtMoney(elecLine.total || 0) : ""}</td>

            <td class="num">${waterLine.oldReading ?? ""}</td>
            <td class="num">${waterLine.newReading ?? ""}</td>
            <td class="num">${waterLine.used ?? ""}</td>
            <td class="num">${waterLine.total !== "" ? fmtMoney(waterLine.total || 0) : ""}</td>

            ${extraCells}
            <td class="num"><b>${total}</b></td>
            <td>${escapeHtml(note)}</td>
          </tr>
        `;
    })
    .join("");

  const title = `PHIẾU TỔNG HỢP NHÀ TRỌ THIỆP MẾN ${getMonthTitleText(fromDate, toDate).toUpperCase()}`;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; }
    .toolbar {
      padding: 8px;
      border-bottom: 1px solid #d1d5db;
      display: flex;
      gap: 8px;
      background: #fff;
    }
    .toolbar button {
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 6px;
    }
    .page { padding-top: 8px; }
    .title {
      text-align: center;
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .subline {
      font-size: 13px;
      margin-bottom: 8px;
    }
    .table-wrap {
      overflow: visible;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #111827;
      padding: 4px 5px;
      vertical-align: middle;
      white-space: nowrap;
    }
    th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
    }
    td.num {
      text-align: right;
    }
    .small {
      font-size: 10px;
    }

    .room-empty td {
      background: #eeeeee !important;
      color: #6b7280;
    }

    @media print {
      .toolbar { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>

  <div class="page">
    <div class="title">${escapeHtml(title)}</div>
    <div class="subline">Từ ngày <b>${escapeHtml(fromDate)}</b> đến ngày <b>${escapeHtml(toDate)}</b></div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th rowspan="2">STT</th>
            <th rowspan="2">Phòng</th>
            <th rowspan="2">Tên chủ phòng</th>

            <th colspan="4">Điện</th>
            <th colspan="4">Nước</th>

            ${headerExtra}

            <th rowspan="2">Tổng số tiền</th>
            <th rowspan="2">Ghi chú</th>
          </tr>
          <tr>
            <th class="small">Cũ</th>
            <th class="small">Mới</th>
            <th class="small">Dùng</th>
            <th class="small">Thành tiền</th>

            <th class="small">Cũ</th>
            <th class="small">Mới</th>
            <th class="small">Dùng</th>
            <th class="small">Thành tiền</th>

            ${costColumns.map(() => `<th class="small">Tiền</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
  `.trim();
}

  function openInvoiceForRoom(roomNumber, appState) {
    ensureState(appState);

    const room = getRoom(appState, roomNumber);
    if (!room) return alert("Không tìm thấy phòng: " + roomNumber);

    const tenantName = getFirstTenantName(room);
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

      <div style="margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Tiền cọc hiện tại</label><br>
          <input id="inv-deposit-view" type="text" value="${fmtMoney(getRoomDeposit(room))} đ" disabled style="padding:8px; width:100%; background:#f3f4f6;">
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
        (titleInput.value || "").trim() || `Hóa đơn xuất phòng ${room.number} kỳ ${latestYM}`;

      return buildInvoiceDraft(room, appState, fromDate, toDate, tenantNameVal, titleVal);
    }

    function renderPreview() {
      const draft = buildDraft();
      const total = draft.lines.reduce((a, l) => a + Number(l.total || l.amount || 0), 0);

      previewBox.innerHTML = `
        <div style="font-weight:800; margin-bottom:8px;">${escapeHtml(draft.title)}</div>
        <div style="font-size:13px; color:#4b5563; margin-bottom:8px;">
          Phòng ${escapeHtml(draft.room.number)} |
          Cọc: ${fmtMoney(draft.depositAmount)} đ |
          ${escapeHtml(draft.fromDate)} → ${escapeHtml(draft.toDate)} |
          Người thuê: ${escapeHtml(draft.tenantName || "(chưa có)")}
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
        if (draft.fromDate > draft.toDate) {
          msgEl.style.color = "#b91c1c";
          msgEl.innerText = "Ngày bắt đầu không được lớn hơn ngày kết thúc.";
          return;
        }

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
          depositAmount: draft.depositAmount,
        });

        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã tạo hóa đơn cho phòng ${room.number}.`;
        renderPreview();
      };
    }

    if (printBtn) {
      printBtn.onclick = () => {
        const draft = buildDraft();
        if (draft.fromDate > draft.toDate) {
          msgEl.style.color = "#b91c1c";
          msgEl.innerText = "Ngày bắt đầu không được lớn hơn ngày kết thúc.";
          return;
        }

        const saved = saveInvoiceToState({
          appState,
          room: draft.room,
          tenantName: draft.tenantName,
          fromDate: draft.fromDate,
          toDate: draft.toDate,
          lines: draft.lines,
          title: draft.title,
          printHtml: draft.printHtml,
          metaType: "monthly",
          depositAmount: draft.depositAmount,
        });

        const html = saved?.printHtml || draft.printHtml;
        openPrintWindow(html);
        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã tạo hóa đơn và mở cửa sổ in cho phòng ${room.number}.`;
      };
    }

    renderPreview();
  }

  function openInvoicesForAllOccupiedRooms(appState) {
    ensureState(appState);

    const rooms = getOccupiedRooms(appState);
    if (!rooms.length) {
      alert("Không có phòng đang thuê để xuất hóa đơn.");
      return;
    }

    const today = todayISO();
    const currentYM = ymOf(today);
    let currentFromDate = firstDayOfMonth(currentYM);
    let currentToDate = today;
    let currentTitleTemplate = "Hóa đơn phòng {room} từ {from} đến {to}";

    function buildDrafts(fromDate, toDate, titleTemplate) {
      return rooms.map((room) => {
        const tenantName = getFirstTenantName(room);
        const title = String(titleTemplate || "Hóa đơn phòng {room}")
          .replaceAll("{room}", String(room.number))
          .replaceAll("{from}", fromDate)
          .replaceAll("{to}", toDate);

        return buildInvoiceDraft(room, appState, fromDate, toDate, tenantName, title);
      });
    }

    let drafts = buildDrafts(currentFromDate, currentToDate, currentTitleTemplate);

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin:0;">🧾 Xuất toàn bộ hóa đơn (phòng đang thuê)</h3>
        <button id="bulk-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Từ ngày</label><br>
          <input id="bulk-invoice-from-date" type="date" value="${currentFromDate}" style="padding:8px; width:100%;">
        </div>

        <div>
          <label style="font-size:13px;">Đến ngày</label><br>
          <input id="bulk-invoice-to-date" type="date" value="${currentToDate}" style="padding:8px; width:100%;">
        </div>

        <div style="grid-column:1 / -1;">
          <label style="font-size:13px;">Tiêu đề mẫu</label><br>
          <input
            id="bulk-invoice-title-template"
            type="text"
            value="${escapeHtml(currentTitleTemplate)}"
            style="padding:8px; width:100%;"
          >
          <div style="font-size:12px; color:#6b7280; margin-top:4px;">
            Dùng được: <b>{room}</b>, <b>{from}</b>, <b>{to}</b>
          </div>
        </div>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="bulk-refresh-btn" style="padding:8px 12px;">🔄 Cập nhật danh sách</button>
        <button id="bulk-create-btn" style="padding:8px 12px; font-weight:700;">💾 Tạo tất cả hóa đơn</button>
        <button id="bulk-print-all-btn" style="padding:8px 12px;">🖨 In toàn bộ</button>
        <button id="bulk-pdf-all-btn" style="padding:8px 12px;">⬇ Lưu toàn bộ PDF</button>
      </div>

      <div id="bulk-msg" style="margin-top:10px; font-size:12px;"></div>
      <div id="bulk-preview-box" style="margin-top:12px;"></div>
    `);

    const closeBtn = document.getElementById("bulk-close-btn");
    const fromInput = document.getElementById("bulk-invoice-from-date");
    const toInput = document.getElementById("bulk-invoice-to-date");
    const titleTemplateInput = document.getElementById("bulk-invoice-title-template");
    const refreshBtn = document.getElementById("bulk-refresh-btn");
    const createBtn = document.getElementById("bulk-create-btn");
    const printAllBtn = document.getElementById("bulk-print-all-btn");
    const pdfAllBtn = document.getElementById("bulk-pdf-all-btn");
    const msgEl = document.getElementById("bulk-msg");
    const previewBox = document.getElementById("bulk-preview-box");

    if (closeBtn) closeBtn.onclick = close;

    function rebuildDraftsFromInputs() {
      const fromDate = toISO10(fromInput?.value) || currentFromDate;
      const toDate = toISO10(toInput?.value) || currentToDate;
      const titleTemplate =
        (titleTemplateInput?.value || "").trim() || "Hóa đơn phòng {room} từ {from} đến {to}";

      if (fromDate > toDate) {
        msgEl.style.color = "#b91c1c";
        msgEl.innerText = "Ngày bắt đầu không được lớn hơn ngày kết thúc.";
        return false;
      }

      currentFromDate = fromDate;
      currentToDate = toDate;
      currentTitleTemplate = titleTemplate;
      drafts = buildDrafts(currentFromDate, currentToDate, currentTitleTemplate);

      renderBatchPreviewList(previewBox, drafts);
      msgEl.style.color = "#16a34a";
      msgEl.innerText = `Đã cập nhật danh sách hóa đơn theo khoảng ${currentFromDate} → ${currentToDate}.`;
      return true;
    }

    renderBatchPreviewList(previewBox, drafts);

    if (refreshBtn) {
      refreshBtn.onclick = () => {
        rebuildDraftsFromInputs();
      };
    }

    previewBox.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-preview-index]");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-preview-index"));
      const draft = drafts[idx];
      if (!draft) return;
      openPrintWindow(draft.printHtml);
    });

    function createAllInvoices() {
      const ok = rebuildDraftsFromInputs();
      if (!ok) return [];

      const created = drafts.map((draft) => {
        return saveInvoiceToState({
          appState,
          room: draft.room,
          tenantName: draft.tenantName,
          fromDate: draft.fromDate,
          toDate: draft.toDate,
          lines: draft.lines,
          title: draft.title,
          printHtml: draft.printHtml,
          metaType: "monthly",
          depositAmount: draft.depositAmount,
        });
      });

      return created.filter(Boolean);
    }

    if (createBtn) {
      createBtn.onclick = () => {
        const created = createAllInvoices();
        if (!created.length) return;

        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã tạo ${created.length} hóa đơn (${currentFromDate} → ${currentToDate}).`;
      };
    }

    if (printAllBtn) {
      printAllBtn.onclick = () => {
        const created = createAllInvoices();
        const useList = created.length ? created : drafts;
        if (!useList.length) return;

        const html = buildBatchCombinedHtml(useList);
        openPrintWindow(html);

        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã mở cửa sổ in toàn bộ ${useList.length} hóa đơn.`;
      };
    }

    if (pdfAllBtn) {
      pdfAllBtn.onclick = async () => {
        const created = createAllInvoices();
        const useList = created.length ? created : drafts;
        if (!useList.length) return;

        await saveAllInvoicesPdf(useList);

        msgEl.style.color = "#16a34a";
        msgEl.innerText = `Đã xử lý lưu PDF cho ${useList.length} hóa đơn.`;
      };
    }
  }

  function openAcceptanceSheetForAllOccupiedRooms(appState) {
    ensureState(appState);

    const rooms = getAllRooms(appState);
    if (!rooms.length) {
      alert("Không có phòng nào.");
      return;
    }

    const today = todayISO();
    const currentYM = ymOf(today);
    const defaultFrom = firstDayOfMonth(currentYM);
    const defaultTo = today;

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin:0;">🖨 In phiếu nghiệm thu</h3>
        <button id="acc-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Từ ngày</label><br>
          <input id="acc-from-date" type="date" value="${defaultFrom}" style="padding:8px; width:100%;">
        </div>
        <div>
          <label style="font-size:13px;">Đến ngày</label><br>
          <input id="acc-to-date" type="date" value="${defaultTo}" style="padding:8px; width:100%;">
        </div>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="acc-preview-btn" style="padding:8px 12px;">👁 Xem trước</button>
        <button id="acc-print-btn" style="padding:8px 12px; font-weight:700;">🖨 In phiếu nghiệm thu</button>
      </div>

      <div id="acc-msg" style="margin-top:10px; font-size:12px;"></div>
    `);

    const closeBtn = document.getElementById("acc-close-btn");
    const fromInput = document.getElementById("acc-from-date");
    const toInput = document.getElementById("acc-to-date");
    const previewBtn = document.getElementById("acc-preview-btn");
    const printBtn = document.getElementById("acc-print-btn");
    const msgEl = document.getElementById("acc-msg");

    if (closeBtn) closeBtn.onclick = close;

    function buildHtml() {
      const fromDate = toISO10(fromInput?.value) || defaultFrom;
      const toDate = toISO10(toInput?.value) || defaultTo;
      return buildAcceptanceSheetHtml({ appState, fromDate, toDate });
    }

    if (previewBtn) {
      previewBtn.onclick = () => {
        openPrintWindow(buildHtml());
        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã mở xem trước phiếu nghiệm thu.";
      };
    }

    if (printBtn) {
      printBtn.onclick = () => {
        openPrintWindow(buildHtml());
        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã mở cửa sổ in phiếu nghiệm thu.";
      };
    }
  }

  function openSummarySheetForAllOccupiedRooms(appState) {
    ensureState(appState);

    const rooms = getAllRooms(appState);
    if (!rooms.length) {
      alert("Không có phòng nào.");
      return;
    }

    const today = todayISO();
    const currentYM = ymOf(today);
    const defaultFrom = firstDayOfMonth(currentYM);
    const defaultTo = today;

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin:0;">🖨 In phiếu tổng hợp</h3>
        <button id="sum-close-btn" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        <div>
          <label style="font-size:13px;">Từ ngày</label><br>
          <input id="sum-from-date" type="date" value="${defaultFrom}" style="padding:8px; width:100%;">
        </div>
        <div>
          <label style="font-size:13px;">Đến ngày</label><br>
          <input id="sum-to-date" type="date" value="${defaultTo}" style="padding:8px; width:100%;">
        </div>
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button id="sum-preview-btn" style="padding:8px 12px;">👁 Xem trước</button>
        <button id="sum-print-btn" style="padding:8px 12px; font-weight:700;">🖨 In phiếu tổng hợp</button>
      </div>

      <div id="sum-msg" style="margin-top:10px; font-size:12px;"></div>
    `);

    const closeBtn = document.getElementById("sum-close-btn");
    const fromInput = document.getElementById("sum-from-date");
    const toInput = document.getElementById("sum-to-date");
    const previewBtn = document.getElementById("sum-preview-btn");
    const printBtn = document.getElementById("sum-print-btn");
    const msgEl = document.getElementById("sum-msg");

    if (closeBtn) closeBtn.onclick = close;

    function buildHtml() {
      const fromDate = toISO10(fromInput?.value) || defaultFrom;
      const toDate = toISO10(toInput?.value) || defaultTo;
      return buildSummarySheetHtml({ appState, fromDate, toDate });
    }

    if (previewBtn) {
      previewBtn.onclick = () => {
        openPrintWindow(buildHtml());
        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã mở xem trước phiếu tổng hợp.";
      };
    }

    if (printBtn) {
      printBtn.onclick = () => {
        openPrintWindow(buildHtml());
        msgEl.style.color = "#16a34a";
        msgEl.innerText = "Đã mở cửa sổ in phiếu tổng hợp.";
      };
    }
  }

  window.openInvoiceForRoom = openInvoiceForRoom;
  window.openInvoicesForAllOccupiedRooms = openInvoicesForAllOccupiedRooms;
  window.openAcceptanceSheetForAllOccupiedRooms = openAcceptanceSheetForAllOccupiedRooms;
  window.openSummarySheetForAllOccupiedRooms = openSummarySheetForAllOccupiedRooms;
  window.__invoiceBuildBatchCombinedHtml = buildBatchCombinedHtml;
  window.__invoiceSaveAllInvoicesPdf = saveAllInvoicesPdf;
  window.__invoiceOpenPrintWindow = openPrintWindow;
})();
