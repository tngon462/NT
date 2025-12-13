// js/tab-room-checkout.js
// Sau này sẽ triển khai logic trả phòng:
// - Hỏi số điện/nước hiện tại
// - Chốt hóa đơn đến ngày trả
// - Xóa người thuê khỏi phòng
// - Đánh dấu phòng trống

function startRoomCheckout(roomNumber, appState, msgElement) {
  // Tạm thời chỉ báo placeholder
  if (msgElement) {
    msgElement.style.color = "#6b7280";
    msgElement.innerText =
      `Chức năng "Trả phòng ${roomNumber}" sẽ được triển khai sau (nhập số điện, nước, chốt hóa đơn...).`;
  } else {
    console.log("Trả phòng", roomNumber, "chưa được triển khai.");
  }
}

window.startRoomCheckout = startRoomCheckout;