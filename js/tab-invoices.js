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
      alert("Trình duyệt chặn popup.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ================== BUILD HTML INVOICE ==================
  function buildInvoiceHtml(inv) {
    const items = Array.isArray(inv.items) ? inv.items : [];
    const total = Number(inv.totalAmount || 0);

    return `
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Hóa đơn ${escapeHtml(inv.code || "")}</title>
<style>
  body { font-family: Arial; font-size: 13px; }
  .wrap { padding: 10px; }
  .title { text-align:center; font-weight:bold; font-size:16px; }
  table { width:100%; border-collapse: collapse; margin-top:10px; }
  td, th { border:1px solid #333; padding:6px; }
  .right { text-align:right; }
</style>
</head>
<body>
<div class="wrap">

<div class="title">HÓA ĐƠN TIỀN PHÒNG</div>

<p><b>Phòng:</b> ${escapeHtml(inv.roomNumber)}</p>
<p><b>Ngày:</b> ${escapeHtml(inv.issueDate || "")}</p>

<table>
<tr>
<th>Nội dung</th>
<th>Chi tiết</th>
<th>Thành tiền</th>
</tr>

${items.map(item => {
  if (item.type === "electricity" || item.type === "water") {
    return `
    <tr>
      <td>${item.type === "electricity" ? "Tiền điện" : "Tiền nước"}</td>
      <td>
        Số cũ: ${item.oldReading || 0}<br>
        Số mới: ${item.newReading || 0}<br>
        Tiêu thụ: ${item.usage || 0} ${item.unit || ""}<br>
        Đơn giá: ${fmtMoney(item.unitPrice)} / ${item.unit}
      </td>
      <td class="right">${fmtMoney(item.amount)} đ</td>
    </tr>
    `;
  }

  return `
    <tr>
      <td>${escapeHtml(item.label)}</td>
      <td></td>
      <td class="right">${fmtMoney(item.amount)} đ</td>
    </tr>
  `;
}).join("")}

<tr>
<td colspan="2"><b>Tổng cộng</b></td>
<td class="right"><b>${fmtMoney(total)} đ</b></td>
</tr>

</table>

</div>
</body>
</html>
`;
  }

  // ================== FIX DATA ==================
  function ensureInvoices(appState) {
    if (!Array.isArray(appState.invoices)) {
      appState.invoices = [];
    }

    appState.invoices.forEach(iv => {
      if (!iv) return;

      if (!iv.totalAmount) {
        iv.totalAmount = Number(iv.total || 0);
      }

      if (!iv.code && window.buildInvoiceCode) {
        iv.code = window.buildInvoiceCode(iv.roomNumber, iv.issueDate);
      }

      if (!iv.title && window.buildInvoiceTitle) {
        iv.title = window.buildInvoiceTitle(iv.roomNumber, iv.issueDate);
      }
    });
  }

  // ================== RENDER ==================
  function renderInvoices(mainContent, appState) {
    ensureInvoices(appState);

    const list = appState.invoices || [];

    mainContent.innerHTML = `
      <h3>🧾 Hóa đơn</h3>

      ${list.length === 0 ? "<p>Chưa có hóa đơn.</p>" : ""}

      <div>
        ${list.map((iv, idx) => `
          <div style="border:1px solid #ddd; padding:10px; margin-bottom:10px;">
            
            <div><b>${escapeHtml(iv.title || "Hóa đơn")}</b></div>
            <div>Mã: ${escapeHtml(iv.code || "")}</div>
            <div>Phòng: ${escapeHtml(iv.roomNumber)}</div>
            <div>Tổng: <b>${fmtMoney(iv.totalAmount)} đ</b></div>

            <div style="margin-top:6px;">
              <button class="print-btn" data-idx="${idx}">🖨 In</button>
              <button class="delete-btn" data-idx="${idx}" style="margin-left:6px;">🗑 Xóa</button>
            </div>

          </div>
        `).join("")}
      </div>
    `;

    // ===== EVENTS =====
    mainContent.querySelectorAll(".print-btn").forEach(btn => {
      btn.onclick = () => {
        const idx = btn.dataset.idx;
        const inv = appState.invoices[idx];
        const html = buildInvoiceHtml(inv);
        openPrintWindow(html);
      };
    });

    mainContent.querySelectorAll(".delete-btn").forEach(btn => {
      btn.onclick = () => {
        const idx = btn.dataset.idx;
        if (!confirm("Xóa hóa đơn này?")) return;

        appState.invoices.splice(idx, 1);

        if (window.saveAppState) window.saveAppState();

        renderInvoices(mainContent, appState);
      };
    });
  }

  // export
  window.renderInvoices = renderInvoices;

})();
