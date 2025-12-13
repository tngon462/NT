// js/tab-rooms.js
(function () {
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function isFutureDate(dateStr) {
    if (!dateStr) return false;
    // so sánh theo YYYY-MM-DD
    return dateStr > todayISO();
  }

  function getRoomStatus(room) {
    const tenants = Array.isArray(room.tenants) ? room.tenants.length : 0;
    if (tenants > 0) return "occupied";
    if (isFutureDate(room.moveInDate)) return "reserved";
    return "vacant";
  }

  function renderRooms(mainContent, appState) {
    if (!Array.isArray(appState.rooms)) appState.rooms = [];

    const rooms = [...appState.rooms].sort((a, b) => {
      const na = Number(a.number);
      const nb = Number(b.number);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a.number).localeCompare(String(b.number));
    });

    const tiles = rooms
      .map((r) => {
        const st = getRoomStatus(r);
        let bg = "#9ca3af"; // xám
        if (st === "occupied") bg = "#22c55e"; // xanh
        if (st === "reserved") bg = "#f59e0b"; // vàng

        const sub =
          st === "occupied"
            ? "Đang thuê"
            : st === "reserved"
            ? `Đặt trước: ${r.moveInDate || ""}`
            : "Trống";

        return `
          <button class="room-tile"
            data-room="${String(r.number)}"
            style="
              background:${bg};
              color:white;
              border:none;
              border-radius:14px;
              padding:14px 12px;
              min-width:110px;
              min-height:74px;
              cursor:pointer;
              display:flex;
              flex-direction:column;
              align-items:flex-start;
              justify-content:center;
              gap:4px;
              box-shadow:0 6px 16px rgba(0,0,0,.12);
            ">
            <div style="font-size:18px; font-weight:800;">${String(r.number)}</div>
            <div style="font-size:12px; opacity:.95;">${sub}</div>
          </button>
        `;
      })
      .join("");

    mainContent.innerHTML = `
      <h3>🏠 Phòng</h3>
      <div style="font-size:13px; color:#4b5563; margin-bottom:10px;">
        Màu <b>xanh</b>: đang thuê • <b>xám</b>: trống • <b>vàng</b>: đã đặt trước (ngày vào phòng ở tương lai)
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        ${tiles || `<p>Chưa có phòng nào. Vào tab Cài đặt để thêm phòng.</p>`}
      </div>
    `;

    mainContent.querySelectorAll(".room-tile").forEach((btn) => {
    btn.onclick = () => {
  const roomNo = btn.getAttribute("data-room");
  if (window.openRoomDetail) window.openRoomDetail(roomNo);
};
    });
  }

  window.renderRooms = renderRooms;
})();