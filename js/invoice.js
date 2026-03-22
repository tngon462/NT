// js/invoice.js
// Tạo hóa đơn tháng cho 1 phòng (A5 dọc) + lưu vào Tab Hóa đơn
(function () {
  const BRAND = {
    title: "PHIẾU THU TIỀN PHÒNG TRỌ THIỆP MẾN",
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
    if (!Array.isArray(appState.invoices)) appState.invoices = [];
  }

  function getRoom(appState, roomNumber) {
    return (appState.rooms || []).find((r) => String(r.number) === String(roomNumber));
  }

  function getFirstTenantName(room) {
    if (!room || !Array.isArray(room.tenants) || room.tenants.length === 0) return "";
    return room.tenants[0]?.fullName || "";
  }

  function normalizeText(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  // ===== lấy đơn giá điện / nước từ hệ thống =====
  function getUtilityConfig(appState, type) {
    const costs = Array.isArray(appState.costs) ? appState.costs : [];
    const fromUnitPrices = appState.costUnitPrices?.[type] || {};

    const keywords =
      type === "electricity"
        ? ["dien", "tien dien", "dien sinh hoat", "điện", "tiền điện"]
        : ["nuoc", "tien nuoc", "nuoc sinh hoat", "nước", "tiền nước"];

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

  // ===== meters calc =====
  function getMeterHistory(appState, type) {
    const meter = (appState.meters && appState.meters[type]) || {};
    return Array.isArray(meter.history) ? meter.history : [];
  }

  function latestReadingInMonth(appState, type, roomNumber, ym) {
    const hist = getMeterHistory(appState, type);
    let best = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) !== String(roomNumber)) continue;
      if (!h.date) continue;
      if (ymOf(h.date) !== ym) continue;
      best = h;
      break;
    }
    return best; // {prev,curr,used,date,period}
  }

  function latestReadingUpToDate(appState, type, roomNumber, toDate) {
    const hist = getMeterHistory(appState, type);
    let best = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) !== String(roomNumber)) continue;
      if (!h.date) continue;
      if (toISO10(h.date) > toDate) continue;
      best = h;
      break;
    }
    return best;
  }

  function prevReadingBeforeMonth(appState, type, roomNumber, ym) {
    const start = firstDayOfMonth(ym);
    const hist = getMeterHistory(appState, type);
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      if (String(h.roomNumber) !== String(roomNumber)) continue;
      if (!h.date) continue;
      if (h.date < start) return Number(h.curr || 0);
    }
    return 0;
  }

  function getMeterLineData(appState, type, roomNumber, ym, toDate) {
    const recInMonth = latestReadingInMonth(appState, type, roomNumber, ym);
    const recAny = latestReadingUpToDate(appState, type, roomNumber, toDate);

    const rec = recInMonth || recAny;

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
        source: recInMonth ? "month" : "latest",
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

  // ===== lines =====
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
  function buildPrintA5Html({ title, room, fromDate, toDate, tenantName, lines }) {
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
    .title { font-size: 15px; font-weight: 900; letter-spacing: .2px; }
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

  // ===== UI =====
  function openInvoiceForRoom(roomNumber, appState) {
    ensureState(appState);

    const room = getRoom(appState, roomNumber);
    if (!room) return alert("Không tìm thấy phòng: " + roomNumber);

    const tenantName = getFirstTenantName(room);

    const now = new Date();
    const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

    const { close } = openModal(`
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">🧾 Tạo hóa đơn phòng ${escapeHtml(room.number)}</h3>
        <button id="iv-close" style="padding:6px 10px;">✖ Đóng</button>
      </div>

      <div style="margin-top:10px; display:grid; gap:12px;">
        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Chọn kỳ hóa đơn</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <label><input type="radio" name="iv-period" value="prev" checked> Tháng trước (${escapeHtml(prevYM)})</label>
            <label><input type="radio" name="iv-period" value="this"> Tháng này (${escapeHtml(thisYM)})</label>
            <label><input type="radio" name="iv-period" value="custom"> Khác</label>
            <input id="iv-custom-ym" type="month" value="${escapeHtml(thisYM)}" style="padding:6px; display:none;">
          </div>
          <div style="margin-top:8px; font-size:12px; color:#6b7280;">
            Gợi ý: muốn “lẻ ngày” thì sửa <b>từ/đến</b> ở bước tiếp theo trước khi xác nhận.
          </div>
        </section>

        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Khoảng thời gian (có thể sửa tay)</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <div>
              <div style="font-size:12px; color:#6b7280;">Từ</div>
              <input id="iv-from" type="date" style="padding:8px; width:170px;">
            </div>
            <div>
              <div style="font-size:12px; color:#6b7280;">Đến</div>
              <input id="iv-to" type="date" style="padding:8px; width:170px;">
            </div>
            <button id="iv-apply" style="padding:8px 12px;">↻ Áp dụng</button>
          </div>
        </section>

        <section style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
          <div style="font-weight:900; margin-bottom:6px;">Chi phí (có thể sửa tay)</div>

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
              <tbody id="iv-body"></tbody>
            </table>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
            <button id="iv-add-line" style="padding:8px 12px;">➕ Thêm khoản khác</button>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <div style="font-weight:900; font-size:16px;">Tổng cộng: <span id="iv-sum">0</span> đ</div>
          </div>
        </section>

        <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
          <button id="iv-confirm" style="padding:10px 14px; font-weight:900;">✅ Xác nhận & in</button>
        </div>
      </div>
    `);

    document.getElementById("iv-close").onclick = close;

    const customYM = document.getElementById("iv-custom-ym");
    const fromInput = document.getElementById("iv-from");
    const toInput = document.getElementById("iv-to");

    function currentYMSelected() {
      const v = document.querySelector('input[name="iv-period"]:checked')?.value || "prev";
      if (v === "prev") return prevYM;
      if (v === "this") return thisYM;
      return customYM.value || thisYM;
    }

    function applyPeriod() {
      const ym = currentYMSelected();
      fromInput.value = firstDayOfMonth(ym);
      toInput.value = lastDayOfMonth(ym);
      buildLines();
    }

    document.querySelectorAll('input[name="iv-period"]').forEach((r) => {
      r.addEventListener("change", () => {
        customYM.style.display = r.value === "custom" && r.checked ? "inline-block" : "none";
        applyPeriod();
      });
    });

    customYM.addEventListener("change", applyPeriod);
    document.getElementById("iv-apply").onclick = buildLines;

    // ===== lines table =====
    const body = document.getElementById("iv-body");
    const sumEl = document.getElementById("iv-sum");
    const addLineBtn = document.getElementById("iv-add-line");

    const elecCfg = getUtilityConfig(appState, "electricity");
    const waterCfg = getUtilityConfig(appState, "water");

    const lines = [];

    function ensureMeterLines(ym, toDate) {
      const elecData = getMeterLineData(appState, "electricity", room.number, ym, toDate);
      const waterData = getMeterLineData(appState, "water", room.number, ym, toDate);

      lines.push({
        name: "Tiền điện",
        unitPrice: Number(elecCfg.price || 0),
        qty: Number(elecData.used || 0),
        unit: elecCfg.unit || "kWh",
        total: Number(elecData.used || 0) * Number(elecCfg.price || 0),
        note: elecData.hasData
          ? `Số cũ: ${fmtMoney(elecData.prev)} | Số mới: ${fmtMoney(elecData.curr)} | Dùng: ${fmtMoney(elecData.used)} ${escapeHtml(elecCfg.unit || "kWh")} | Ngày chốt: ${elecData.date || ""}`
          : `Chưa có số điện. Số cũ hiện lưu: ${fmtMoney(elecData.prev)}`,
        oldReading: Number(elecData.prev || 0),
        newReading: Number(elecData.curr || 0),
        readingDate: elecData.date || "",
        period: elecData.period || ym,
        _meterType: "electricity",
      });

      lines.push({
        name: "Tiền nước",
        unitPrice: Number(waterCfg.price || 0),
        qty: Number(waterData.used || 0),
        unit: waterCfg.unit || "m³",
        total: Number(waterData.used || 0) * Number(waterCfg.price || 0),
        note: waterData.hasData
          ? `Số cũ: ${fmtMoney(waterData.prev)} | Số mới: ${fmtMoney(waterData.curr)} | Dùng: ${fmtMoney(waterData.used)} ${escapeHtml(waterCfg.unit || "m³")} | Ngày chốt: ${waterData.date || ""}`
          : `Chưa có số nước. Số cũ hiện lưu: ${fmtMoney(waterData.prev)}`,
        oldReading: Number(waterData.prev || 0),
        newReading: Number(waterData.curr || 0),
        readingDate: waterData.date || "",
        period: waterData.period || ym,
        _meterType: "water",
      });
    }

    function renderRows() {
      body.innerHTML = lines
        .map((l, i) => {
          const isMeter = !!l._meterType;
          const disableDel = isMeter ? "disabled" : "";
          const noteHtml = l.note
            ? `<div style="font-size:11px; color:#6b7280; margin-top:2px; white-space:pre-line;">${escapeHtml(l.note)}</div>`
            : "";

          return `
            <tr data-idx="${i}">
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="iv-name" type="text" value="${escapeHtml(l.name)}" style="width:100%; padding:6px; font-weight:800;">
                ${noteHtml}
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="iv-up" type="number" value="${Number(l.unitPrice || 0)}" style="width:100%; padding:6px;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px;">
                <input class="iv-qty" type="number" value="${Number(l.qty || 0)}" style="width:100%; padding:6px;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">
                <input class="iv-unit" type="text" value="${escapeHtml(l.unit || "")}" style="width:100%; padding:6px; text-align:center;">
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:right;">
                <b class="iv-total">${fmtMoney(l.total || 0)}</b>
              </td>
              <td style="border:1px solid #e5e7eb; padding:6px; text-align:center;">
                <button class="iv-del" ${disableDel} style="padding:6px 8px;">🗑</button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    function recalcFromDOM() {
      let sum = 0;
      const trs = body.querySelectorAll("tr[data-idx]");

      trs.forEach((tr) => {
        const idx = Number(tr.getAttribute("data-idx"));
        const name = tr.querySelector(".iv-name").value || "";
        const up = Number(tr.querySelector(".iv-up").value || 0);
        const qty = Number(tr.querySelector(".iv-qty").value || 0);
        const unit = tr.querySelector(".iv-unit").value || "";
        const total = up * qty;

        Object.assign(lines[idx], { name, unitPrice: up, qty, unit, total });
        tr.querySelector(".iv-total").innerText = fmtMoney(total);
        sum += total;
      });

      sumEl.textContent = fmtMoney(sum);
      return sum;
    }

    function wireHandlers() {
      body.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalcFromDOM));
      body.querySelectorAll(".iv-del").forEach((btn) => {
        btn.onclick = (e) => {
          const tr = e.target.closest("tr[data-idx]");
          const idx = Number(tr.getAttribute("data-idx"));
          if (lines[idx]._meterType) return;
          lines.splice(idx, 1);
          renderRows();
          wireHandlers();
          recalcFromDOM();
        };
      });
    }

    function buildLines() {
      const fromDate = toISO10(fromInput.value);
      const toDate = toISO10(toInput.value);
      if (!fromDate || !toDate) return;

      lines.length = 0;

      const base = buildBaseLines(room, appState, fromDate, toDate);
      base.forEach((b) => lines.push({ ...b }));

      const ym = ymOf(toDate) || currentYMSelected();
      ensureMeterLines(ym, toDate);

      renderRows();
      wireHandlers();
      recalcFromDOM();
    }

    addLineBtn.onclick = () => {
      const meterCount = lines.filter((x) => x._meterType).length;
      const insertAt = Math.max(0, lines.length - meterCount);
      lines.splice(insertAt, 0, {
        name: "Khoản khác",
        unitPrice: 0,
        qty: 1,
        unit: "",
        total: 0,
        note: "",
      });
      renderRows();
      wireHandlers();
      recalcFromDOM();
    };

    // init
    applyPeriod();

    document.getElementById("iv-confirm").onclick = () => {
      const fromDate = toISO10(fromInput.value);
      const toDate = toISO10(toInput.value);
      if (!fromDate || !toDate) return alert("Thiếu ngày từ/đến.");

      const total = recalcFromDOM();

      const printHtml = buildPrintA5Html({
        title: BRAND.title,
        room,
        fromDate,
        toDate,
        tenantName,
        lines,
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
          lines: lines.map((x) => ({ ...x })),
          meta: {
            type: "monthly",
            periodFrom: fromDate,
            periodTo: toDate,
            ym: ymOf(toDate),
          },
          printHtml,
        });
      }

      if (window.saveAppState) window.saveAppState();

      close();
      openPrintWindow(printHtml);
      if (window.setView) window.setView("invoices");
    };
  }

  window.openInvoiceForRoom = openInvoiceForRoom;
})();
