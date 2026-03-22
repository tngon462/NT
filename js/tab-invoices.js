// js/tab-invoices.js
(function () {
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

  function isDeletedInvoice(inv) {
    return !!(inv && (inv.deleted || inv.isDeleted));
  }

  function markDeletedInvoice(inv) {
    if (!inv) return;
    inv.deleted = true;
    inv.isDeleted = true;
    inv.deletedAt = new Date().toISOString();
  }

  function openPrintWindow(html) {
    const fn = window.__invoiceOpenPrintWindow;
    if (typeof fn === "function") return fn(html);

    const w = window.open("", "_blank");
    if (!w) {
      alert("Trình duyệt đang chặn pop-up. Cho phép pop-up để in / lưu PDF.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function buildSimpleInvoiceHtml(inv) {
    const total = Number(inv.total || inv.totalAmount || 0);
    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Hóa đơn ${escapeHtml(inv.id || "")}</title>
  <style>
    @page { size: A5 portrait; margin: 8mm; }
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; }
    .toolbar { padding: 8px; border-bottom: 1px solid #ddd; display:flex; gap:8px; align-items:center; }
    .toolbar button { padding: 6px 10px; font-size: 12px; cursor:pointer; }
    .box { padding: 10px; }
    .h { font-weight:900; font-size: 14px; text-align:center; }
    .meta { margin-top:10px; line-height:1.6; }
    .row { display:flex; justify-content:space-between; border:1px solid #333; padding:8px; margin-top:10px; font-weight:900; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 In / Save PDF</button>
    <button onclick="window.close()">✖ Đóng</button>
  </div>
  <div class="box">
    <div class="h">${escapeHtml(inv.title || "PHIẾU THU TIỀN PHÒNG TRỌ THIỆP MẾN")}</div>
    <div class="meta">
      <div><b>Phòng:</b> ${escapeHtml(inv.roomNumber)}</div>
      <div><b>Người thuê:</b> ${escapeHtml(inv.tenantName || "(chưa có)")}</div>
      <div><b>Ngày tạo:</b> ${escapeHtml(inv.issueDate || "")}</div>
      <div><b>Kỳ:</b> ${escapeHtml(inv.periodFrom || "")} → ${escapeHtml(inv.periodTo || "")}</div>
      <div><b>Mã hóa đơn:</b> ${escapeHtml(inv.code || "")}</div>
      <div><b>Trạng thái:</b> ${escapeHtml(inv.status || "")}
        ${inv.status === "partial" ? ` (còn thiếu ${fmtMoney(inv.missingAmount)} đ)` : ""}
      </div>
    </div>
    <div class="row">
      <div>Tổng cộng</div>
      <div>${fmtMoney(total)} đ</div>
    </div>
  </div>
</body>
</html>
`.trim();
  }

  function statusLabel(s) {
    if (s === "paid") return "Đã thanh toán";
    if (s === "partial") return "Thanh toán thiếu";
    return "Chưa thanh toán";
  }

  function statusColor(s) {
    if (s === "paid") return "#16a34a";
    if (s === "partial") return "#f59e0b";
    return "#ef4444";
  }

  function ensureInvoices(appState) {
    if (!Array.isArray(appState.invoices)) appState.invoices = [];

    appState.invoices.forEach((iv) => {
      if (!iv) return;

      if (iv.deleted && !iv.isDeleted) iv.isDeleted = true;
      if (iv.isDeleted && !iv.deleted) iv.deleted = true;

      if (!iv.invoiceDate) iv.invoiceDate = iv.issueDate || "";
      if (!iv.title) {
        const dt = (iv.invoiceDate || iv.issueDate || "").slice(0, 10);
        if (window.buildInvoiceTitle) iv.title = window.buildInvoiceTitle(iv.roomNumber, dt, iv.meta?.type);
        else iv.title = `Hóa đơn phòng ${iv.roomNumber}`;
      }
      if (!iv.code) {
        const dt = (iv.invoiceDate || iv.issueDate || "").slice(0, 10);
        if (window.buildInvoiceCode) iv.code = window.buildInvoiceCode(iv.roomNumber, dt);
      }
      if (!iv.status) iv.status = "unpaid";
      if (iv.missingAmount == null) iv.missingAmount = 0;
      if (!Array.isArray(iv.lines) && Array.isArray(iv.items)) iv.lines = iv.items;
      if (!Array.isArray(iv.items) && Array.isArray(iv.lines)) iv.items = iv.lines;
      if (iv.total == null && iv.totalAmount != null) iv.total = iv.totalAmount;
      if (iv.totalAmount == null && iv.total != null) iv.totalAmount = iv.total;
    });
  }

  function renderInvoices(mainContent, appState) {
    ensureInvoices(appState);

    mainContent.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <h2 style="margin:0;">🧾 Hóa đơn</h2>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <button id="inv-print-all-visible" style="padding:8px 12px;">🖨 In tất cả đang lọc</button>
          <button id="inv-pdf-all-visible" style="padding:8px 12px;">⬇ PDF tất cả đang lọc</button>
          <label style="font-size:13px;">
            <input type="checkbox" id="inv-show-deleted"> Hiện hóa đơn đã xóa
          </label>
          <input id="inv-search" placeholder="Tìm: phòng, tên, mã, ngày..." style="padding:8px; width:min(320px, 70vw);">
          <button id="inv-refresh" style="padding:8px 12px;">↻ Làm mới</button>
        </div>
      </div>

      <div style="margin-top:10px; font-size:12px; color:#6b7280;">
        Hóa đơn batch tạo từ mục “Xuất toàn bộ hóa đơn” cũng sẽ hiển thị ở đây.
      </div>

      <div style="margin-top:10px; overflow:auto; border:1px solid #e5e7eb; border-radius:12px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:70px;">Phòng</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; min-width:260px;">Tên hóa đơn</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left;">Người thuê</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:120px;">Ngày tạo</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:right; width:120px;">Tổng tiền</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:190px;">Trạng thái</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:right; width:250px;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>

      <div id="inv-msg" style="margin-top:10px; font-size:12px;"></div>
    `;

    const showDeletedEl = document.getElementById("inv-show-deleted");
    const searchEl = document.getElementById("inv-search");
    const tbody = document.getElementById("inv-tbody");
    const msg = document.getElementById("inv-msg");
    const btnPrintAllVisible = document.getElementById("inv-print-all-visible");
    const btnPdfAllVisible = document.getElementById("inv-pdf-all-visible");

    function rowHtml(inv) {
      const deleted = isDeletedInvoice(inv);

      const deletedBadge = deleted
        ? `<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#fee2e2; color:#991b1b; margin-left:6px;">đã xóa</span>`
        : "";

      const missingBox =
        inv.status === "partial"
          ? `
            <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
              <span style="font-size:12px; color:#6b7280;">Còn thiếu</span>
              <input data-act="missing" data-id="${escapeHtml(inv.id)}" type="number"
                value="${Number(inv.missingAmount || 0)}"
                style="padding:6px; width:120px;">
              <span style="font-size:12px; color:#6b7280;">đ</span>
            </div>
          `
          : "";

      return `
        <tr data-id="${escapeHtml(inv.id)}" style="border-bottom:1px solid #f1f5f9; ${deleted ? "opacity:.55;" : ""}">
          <td style="padding:10px;"><b>${escapeHtml(inv.roomNumber)}</b>${deletedBadge}</td>
          <td style="padding:10px;">
            <div style="font-weight:800;">${escapeHtml(inv.title || ("Hóa đơn phòng " + inv.roomNumber))}</div>
            <div style="font-size:11px; color:#6b7280;">${escapeHtml(inv.code || "")}</div>
          </td>
          <td style="padding:10px;">${escapeHtml(inv.tenantName || "")}</td>
          <td style="padding:10px;">${escapeHtml(inv.issueDate || "")}</td>
          <td style="padding:10px; text-align:right;"><b>${fmtMoney(inv.total || inv.totalAmount || 0)} đ</b></td>
          <td style="padding:10px;">
            <select data-act="status" data-id="${escapeHtml(inv.id)}" style="padding:7px; width:180px; border-radius:10px; border:1px solid #e5e7eb; color:${statusColor(inv.status)}; font-weight:800;">
              <option value="paid" ${inv.status === "paid" ? "selected" : ""}>Đã thanh toán</option>
              <option value="unpaid" ${inv.status === "unpaid" ? "selected" : ""}>Chưa thanh toán</option>
              <option value="partial" ${inv.status === "partial" ? "selected" : ""}>Thanh toán thiếu</option>
            </select>
            ${missingBox}
          </td>
          <td style="padding:10px; text-align:right; white-space:nowrap;">
            <button data-act="print" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px;">🖨 In</button>
            <button data-act="pdf" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px;">⬇ PDF</button>
            <button data-act="delete" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px; ${deleted ? "opacity:.6;" : ""}">
              🗑 Xóa
            </button>
          </td>
        </tr>
      `;
    }

    function applyFilters(list) {
      const showDeleted = !!showDeletedEl.checked;
      const q = (searchEl.value || "").trim().toLowerCase();

      let out = list.slice();

      if (!showDeleted) out = out.filter((x) => !isDeletedInvoice(x));

      if (q) {
        out = out.filter((inv) => {
          const a = String(inv.roomNumber || "").toLowerCase();
          const b = String(inv.tenantName || "").toLowerCase();
          const c = String(inv.issueDate || "").toLowerCase();
          const d = String(inv.periodFrom || "").toLowerCase();
          const e = String(inv.periodTo || "").toLowerCase();
          const f = String(inv.code || "").toLowerCase();
          const g = String(inv.title || "").toLowerCase();
          return `${a} ${b} ${c} ${d} ${e} ${f} ${g}`.includes(q);
        });
      }

      return out;
    }

    function getFilteredList() {
      return applyFilters(appState.invoices || []);
    }

    function renderTable() {
      const list = getFilteredList();
      tbody.innerHTML = list.map(rowHtml).join("");

      msg.style.color = "#6b7280";
      msg.textContent =
        `Đang hiển thị: ${list.length} hóa đơn | Tổng kho: ${(appState.invoices || []).length}`;
    }

    function getInvoiceById(id) {
      return (appState.invoices || []).find((x) => x.id === id);
    }

    function getInvoiceHtml(inv) {
      return inv.printHtml && String(inv.printHtml).trim()
        ? inv.printHtml
        : buildSimpleInvoiceHtml(inv);
    }

    function printOrPdfAllVisible() {
      const list = getFilteredList();
      if (!list.length) {
        alert("Không có hóa đơn nào trong danh sách đang lọc.");
        return [];
      }
      return list;
    }

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      const inv = getInvoiceById(id);
      if (!inv) return alert("Không tìm thấy hóa đơn.");

      if (act === "print" || act === "pdf") {
        openPrintWindow(getInvoiceHtml(inv));
        return;
      }

      if (act === "delete") {
        if (isDeletedInvoice(inv)) {
          alert("Hóa đơn này đã ở trạng thái xóa mềm rồi.");
          return;
        }

        const ok = confirm(
          `Xóa hóa đơn (xóa mềm) của phòng ${inv.roomNumber} ngày ${inv.issueDate}?\n` +
          `Hóa đơn sẽ không mất hẳn, chỉ chuyển trạng thái đã xóa.`
        );
        if (!ok) return;

        if (typeof window.softDeleteInvoice === "function") {
          window.softDeleteInvoice(inv.id);
        } else {
          markDeletedInvoice(inv);
          if (window.saveAppState) window.saveAppState();
        }

        renderTable();
      }
    });

    tbody.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-act='status']");
      if (!sel) return;

      const id = sel.getAttribute("data-id");
      const inv = getInvoiceById(id);
      if (!inv) return;

      inv.status = sel.value;
      if (inv.status !== "partial") inv.missingAmount = 0;

      if (typeof window.updateInvoice === "function") {
        window.updateInvoice(id, {
          status: inv.status,
          missingAmount: inv.missingAmount,
        });
      } else if (window.saveAppState) {
        window.saveAppState();
      }

      renderTable();
    });

    tbody.addEventListener("input", (e) => {
      const inp = e.target.closest("input[data-act='missing']");
      if (!inp) return;

      const id = inp.getAttribute("data-id");
      const inv = getInvoiceById(id);
      if (!inv) return;

      const v = Number(inp.value || 0);
      inv.missingAmount = Number.isNaN(v) ? 0 : v;

      if (typeof window.updateInvoice === "function") {
        window.updateInvoice(id, { missingAmount: inv.missingAmount });
      } else if (window.saveAppState) {
        window.saveAppState();
      }
    });

    btnPrintAllVisible.onclick = () => {
      const list = printOrPdfAllVisible();
      if (!list.length) return;

      if (typeof window.__invoiceBuildBatchCombinedHtml === "function") {
        const html = window.__invoiceBuildBatchCombinedHtml(list);
        openPrintWindow(html);
      } else {
        openPrintWindow(list.map(getInvoiceHtml).join("\n\n"));
      }
    };

    btnPdfAllVisible.onclick = async () => {
      const list = printOrPdfAllVisible();
      if (!list.length) return;

      if (typeof window.__invoiceSaveAllInvoicesPdf === "function") {
        await window.__invoiceSaveAllInvoicesPdf(list);
      } else if (typeof window.__invoiceBuildBatchCombinedHtml === "function") {
        const html = window.__invoiceBuildBatchCombinedHtml(list);
        openPrintWindow(html);
      } else {
        openPrintWindow(list.map(getInvoiceHtml).join("\n\n"));
      }
    };

    document.getElementById("inv-refresh").onclick = renderTable;
    showDeletedEl.onchange = renderTable;
    searchEl.oninput = renderTable;

    renderTable();
  }

  window.renderInvoices = renderInvoices;
})();
