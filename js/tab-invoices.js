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

  function openPrintWindow(html) {
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
    const total = Number(inv.totalAmount != null ? inv.totalAmount : inv.total || 0);

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Hóa đơn ${escapeHtml(inv.id)}</title>
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
    <div class="h">PHIẾU THU TIỀN PHÒNG TRỌ THIỆP MẾN</div>
    <div class="meta">
      <div><b>Phòng:</b> ${escapeHtml(inv.roomNumber)}</div>
      <div><b>Người thuê:</b> ${escapeHtml(inv.tenantName || "(chưa có)")}</div>
      <div><b>Ngày tạo:</b> ${escapeHtml(inv.issueDate || "")}</div>
      <div><b>Kỳ:</b> ${escapeHtml(inv.periodFrom || "")} → ${escapeHtml(inv.periodTo || "")}</div>
      <div><b>Trạng thái:</b> ${escapeHtml(inv.status || "")}
        ${inv.status === "partial" ? ` (còn thiếu ${fmtMoney(inv.missingAmount)}đ)` : ""}
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

  function statusColor(s) {
    if (s === "paid") return "#16a34a";
    if (s === "partial") return "#f59e0b";
    return "#ef4444";
  }

  function ensureInvoices(appState) {
    if (!Array.isArray(appState.invoices)) appState.invoices = [];

    appState.invoices.forEach((iv) => {
      if (!iv) return;

      if (!iv.invoiceDate) iv.invoiceDate = iv.issueDate || "";
      if (iv.totalAmount == null) iv.totalAmount = Number(iv.total || 0);
      if (iv.total == null) iv.total = Number(iv.totalAmount || 0);
      if (iv.deleted == null && iv.isDeleted != null) iv.deleted = !!iv.isDeleted;
      if (iv.isDeleted == null && iv.deleted != null) iv.isDeleted = !!iv.deleted;

      if (!iv.title) {
        const dt = (iv.invoiceDate || iv.issueDate || "").slice(0, 10);
        if (window.buildInvoiceTitle) {
          iv.title = window.buildInvoiceTitle(iv.roomNumber, dt, iv.meta?.type);
        } else {
          iv.title = `Hóa đơn phòng ${iv.roomNumber}`;
        }
      }

      if (!iv.code) {
        const dt = (iv.invoiceDate || iv.issueDate || "").slice(0, 10);
        if (window.buildInvoiceCode) {
          iv.code = window.buildInvoiceCode(iv.roomNumber, dt);
        }
      }
    });
  }

  function renderInvoices(mainContent, appState) {
    ensureInvoices(appState);

    mainContent.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <h2 style="margin:0;">🧾 Hóa đơn</h2>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="font-size:13px;">
            <input type="checkbox" id="inv-show-deleted"> Hiện hóa đơn đã xóa
          </label>
          <input id
