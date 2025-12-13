// js/tab-overview.js
// Màn tổng quan: phòng, doanh thu, công nợ, danh sách hóa đơn chưa thanh toán
(function () {
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtMoney(n) {
    const x = Number(n || 0);
    if (Number.isNaN(x)) return "0";
    return x.toLocaleString("vi-VN");
  }

  function statusColor(st) {
    if (st === "paid") return "#16a34a";
    if (st === "partial") return "#f59e0b";
    return "#dc2626";
  }

  function statusText(st) {
    if (st === "paid") return "Đã thanh toán";
    if (st === "partial") return "Thanh toán thiếu";
    return "Chưa thanh toán";
  }

  function yyyymm(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function monthLabel(ym) {
    // ym = "2025-12"
    const [y, m] = String(ym || "").split("-");
    if (!y || !m) return ym || "";
    return `${m}/${y}`;
  }

  function getInvoiceMonth(inv) {
    // ưu tiên issueDate "YYYY-MM-DD"
    const s = String(inv.issueDate || "").trim();
    if (s && s.length >= 7) return s.slice(0, 7);
    // fallback createdAt ISO
    const c = String(inv.createdAt || "").trim();
    if (c && c.length >= 7) return c.slice(0, 7);
    return "";
  }

  function getUnpaidAmount(inv) {
    // unpaid => total; partial => missingAmount (nếu trống thì coi như total)
    const total = Number(inv.total || 0);
    if (inv.status === "partial") {
      const miss = Number(inv.missingAmount || 0);
      return miss > 0 ? miss : total;
    }
    if (inv.status === "unpaid") return total;
    return 0;
  }

  function openPrintWindow(html) {
    const w = window.open("", "_blank");
    if (!w) return alert("Trình duyệt đang chặn popup. Hãy cho phép popup.");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  function buildSimpleInvoiceHtml(inv) {
    const title = escapeHtml(inv.title || `Hóa đơn phòng ${inv.roomNumber || ""}`);
    return `
      <!doctype html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${title}</title>
        <style>
          body{font-family:Arial, sans-serif; padding:18px;}
          .row{display:flex; justify-content:space-between; gap:12px; margin:6px 0;}
          .muted{color:#6b7280; font-size:12px;}
          .box{border:1px solid #e5e7eb; border-radius:12px; padding:12px;}
          h2{margin:0 0 8px 0;}
          table{width:100%; border-collapse:collapse; margin-top:10px;}
          td{padding:6px 0; border-bottom:1px dashed #e5e7eb;}
          .right{text-align:right;}
        </style>
      </head>
      <body>
        <div class="box">
          <h2>${title}</h2>
          <div class="muted">Mã: ${escapeHtml(inv.code || "")}</div>
          <div class="row"><div>Phòng</div><div><b>${escapeHtml(inv.roomNumber || "")}</b></div></div>
          <div class="row"><div>Khách</div><div><b>${escapeHtml(inv.tenantName || "")}</b></div></div>
          <div class="row"><div>Ngày tạo</div><div>${escapeHtml(inv.issueDate || "")}</div></div>
          <div class="row"><div>Trạng thái</div><div style="color:${statusColor(inv.status)}"><b>${statusText(inv.status)}</b></div></div>

          <table>
            <tr>
              <td><b>Tổng tiền</b></td>
              <td class="right"><b>${fmtMoney(inv.total)} đ</b></td>
            </tr>
            ${
              inv.status === "partial"
                ? `<tr><td>Còn thiếu</td><td class="right">${fmtMoney(inv.missingAmount || 0)} đ</td></tr>`
                : ""
            }
          </table>
        </div>

        <script>
          setTimeout(() => window.print(), 250);
        </script>
      </body>
      </html>
    `;
  }

  function renderOverview(mainContent, appState) {
    if (!Array.isArray(appState.rooms)) appState.rooms = [];
    if (!Array.isArray(appState.invoices)) appState.invoices = [];

    const rooms = appState.rooms || [];
    const invoices = appState.invoices || [];

    const occupiedRooms = rooms.filter((r) => Array.isArray(r.tenants) && r.tenants.length > 0);
    const vacantRooms = rooms.filter((r) => !(Array.isArray(r.tenants) && r.tenants.length > 0));

    const totalRooms = rooms.length;
    const occupiedCount = occupiedRooms.length;

    const now = new Date();
    const thisMonth = yyyymm(now);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = yyyymm(lastMonthDate);

    // Chỉ tính doanh thu/công nợ trên hóa đơn KHÔNG bị xóa mềm
    const activeInvoices = invoices.filter((x) => !x.isDeleted);

    const paidLastMonth = activeInvoices
      .filter((inv) => inv.status === "paid" && getInvoiceMonth(inv) === lastMonth)
      .reduce((s, inv) => s + Number(inv.total || 0), 0);

    const paidThisMonth = activeInvoices
      .filter((inv) => inv.status === "paid" && getInvoiceMonth(inv) === thisMonth)
      .reduce((s, inv) => s + Number(inv.total || 0), 0);

    // Doanh thu dự kiến tháng này = tổng tất cả hóa đơn tháng này (paid/unpaid/partial), miễn không bị xóa mềm
    const forecastThisMonth = activeInvoices
      .filter((inv) => getInvoiceMonth(inv) === thisMonth)
      .reduce((s, inv) => s + Number(inv.total || 0), 0);

    // Tổng tiền khách chưa thanh toán = sum unpaid + missing(partial)
    const totalUnpaid = activeInvoices
      .filter((inv) => inv.status !== "paid")
      .reduce((s, inv) => s + getUnpaidAmount(inv), 0);

    // List hóa đơn chưa thanh toán (giống tab hóa đơn)
    const unpaidList = activeInvoices
      .filter((inv) => inv.status !== "paid")
      .slice()
      .sort((a, b) => String(b.issueDate || "").localeCompare(String(a.issueDate || "")));

    mainContent.innerHTML = `
      <h3 class="overview-title">📊 Tổng quan</h3>

      <div class="overview-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px;">
        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Số phòng đang cho thuê</div>
          <div style="font-size:22px; font-weight:900; margin-top:4px;">${occupiedCount}/${totalRooms}</div>
        </div>

        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Các phòng đang trống</div>
          <div style="margin-top:6px; font-weight:800;">
            ${
              vacantRooms.length
                ? vacantRooms.map((r) => escapeHtml(r.number)).join(", ")
                : `<span style="color:#16a34a;">Không có</span>`
            }
          </div>
        </div>

        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Tổng doanh thu tháng trước (${monthLabel(lastMonth)})</div>
          <div style="font-size:20px; font-weight:900; margin-top:4px;">${fmtMoney(paidLastMonth)} đ</div>
        </div>

        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Doanh thu hiện tại (${monthLabel(thisMonth)})</div>
          <div style="font-size:20px; font-weight:900; margin-top:4px;">${fmtMoney(paidThisMonth)} đ</div>
        </div>

        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Doanh thu dự kiến tháng này (${monthLabel(thisMonth)})</div>
          <div style="font-size:20px; font-weight:900; margin-top:4px;">${fmtMoney(forecastThisMonth)} đ</div>
        </div>

        <div class="overview-card" style="border:1px solid #e5e7eb; border-radius:14px; padding:12px;">
          <div style="font-size:12px; color:#6b7280;">Tổng số tiền khách chưa thanh toán</div>
          <div style="font-size:20px; font-weight:900; margin-top:4px; color:#dc2626;">${fmtMoney(totalUnpaid)} đ</div>
        </div>
      </div>

      <div style="margin-top:14px; display:flex; align-items:flex-end; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div>
          <h4 style="margin:0;">Danh sách hóa đơn chưa thanh toán</h4>
          <div style="font-size:12px; color:#6b7280; margin-top:4px;">
            Hiển thị các hóa đơn trạng thái <b>Chưa thanh toán</b> / <b>Thanh toán thiếu</b>.
          </div>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <button id="ov-go-invoices" style="padding:8px 10px;">➡ Mở tab Hóa đơn</button>
          <button id="ov-refresh" style="padding:8px 10px;">⟲ Làm mới</button>
        </div>
      </div>

      <div style="margin-top:10px; overflow:auto; border:1px solid #e5e7eb; border-radius:14px;">
        <table style="width:100%; border-collapse:collapse; min-width:920px;">
          <thead style="background:#f8fafc;">
            <tr>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:120px;">Mã hóa đơn</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:90px;">Phòng</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:180px;">Tên khách</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:130px;">Ngày tạo</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:right; width:140px;">Tổng tiền</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:left; width:170px;">Trạng thái</th>
              <th style="border-bottom:1px solid #e5e7eb; padding:10px; text-align:right; width:260px;">Thao tác</th>
            </tr>
          </thead>
          <tbody id="ov-unpaid-tbody"></tbody>
        </table>
      </div>

      <div id="ov-msg" style="margin-top:10px; font-size:12px; color:#6b7280;"></div>
    `;

    const tbody = document.getElementById("ov-unpaid-tbody");
    const msg = document.getElementById("ov-msg");

    function rowHtml(inv) {
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px;"><b>${escapeHtml(inv.code || inv.id || "")}</b></td>
          <td style="padding:10px;"><b>${escapeHtml(inv.roomNumber || "")}</b></td>
          <td style="padding:10px;">${escapeHtml(inv.tenantName || "")}</td>
          <td style="padding:10px;">${escapeHtml(inv.issueDate || "")}</td>
          <td style="padding:10px; text-align:right;"><b>${fmtMoney(inv.total)} đ</b></td>
          <td style="padding:10px;">
            <span style="font-weight:900; color:${statusColor(inv.status)};">
              ${statusText(inv.status)}
            </span>
          </td>
          <td style="padding:10px; text-align:right; white-space:nowrap;">
            <button data-act="print" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px;">🖨 In</button>
            <button data-act="pdf" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px;">⬇ PDF</button>
            <button data-act="delete" data-id="${escapeHtml(inv.id)}" style="padding:7px 10px;">🗑 Xóa</button>
          </td>
        </tr>
      `;
    }

    function renderUnpaidTable() {
      tbody.innerHTML = unpaidList.length
        ? unpaidList.map(rowHtml).join("")
        : `<tr><td colspan="7" style="padding:14px; color:#6b7280;">Không có hóa đơn nào chưa thanh toán 🎉</td></tr>`;

      msg.textContent = `Đang hiển thị: ${unpaidList.length} hóa đơn chưa thanh toán.`;
    }

    function getInvoiceById(id) {
      return (appState.invoices || []).find((x) => String(x.id) === String(id));
    }

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      const inv = getInvoiceById(id);
      if (!inv) return alert("Không tìm thấy hóa đơn.");

      if (act === "print" || act === "pdf") {
        const html = inv.printHtml && String(inv.printHtml).trim()
          ? inv.printHtml
          : buildSimpleInvoiceHtml(inv);
        openPrintWindow(html);
        return;
      }

      if (act === "delete") {
        const ok = confirm(
          `Xóa hóa đơn (xóa mềm) của phòng ${inv.roomNumber} ngày ${inv.issueDate}?\n` +
          `Hóa đơn sẽ không mất hẳn, chỉ chuyển trạng thái đã xóa.`
        );
        if (!ok) return;

        inv.isDeleted = true;
        inv.deletedAt = new Date().toISOString();
        if (window.saveAppState) window.saveAppState();

        // re-render overview
        renderOverview(mainContent, appState);
        return;
      }
    });

    document.getElementById("ov-refresh").onclick = () => renderOverview(mainContent, appState);

    document.getElementById("ov-go-invoices").onclick = () => {
      if (window.setView) window.setView("invoices");
      else alert("Thiếu main.js / setView().");
    };

    renderUnpaidTable();
  }

  window.renderOverview = renderOverview;
})();