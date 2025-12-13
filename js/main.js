// js/main.js

// ===== STATE CHUNG =====
const appState = {
  currentView: "overview",      // overview | rooms | costs | devices | settings | roomDetail
  currentRoomNumber: null,      // phòng đang xem chi tiết

  rooms: [],                    // { number, price, tenants? }
  costs: [],                    // chi phí khác (không phải điện/nước): { name, amount, unit, type }
  devices: [],                  // { id, name, totalQty, price, note }
  deviceAssignments: [],        // { deviceId, roomNumber }

  // Đơn giá điện / nước
  costUnitPrices: {
    electricity: { price: 0, unit: "kWh" },
    water: { price: 0, unit: "m³" },
  },

  // Công tơ điện / nước
  meters: {
    electricity: {
      lastReadings: {}, // { roomNumber: number }
      history: [],      // { period, roomNumber, prev, curr, used }
    },
    water: {
      lastReadings: {},
      history: [],
    },
  },
};

// ===== LOCAL STORAGE =====
const STORAGE_KEY = "nhatro_app_state_v1";

function saveAppState() {
  const data = {
    rooms: appState.rooms,
    costs: appState.costs,
    devices: appState.devices,
    deviceAssignments: appState.deviceAssignments,
    costUnitPrices: appState.costUnitPrices,
    meters: appState.meters,
    invoices: appState.invoices,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Nếu bật auto-sync cloud (Firebase) thì lên lịch đồng bộ (không làm gián đoạn offline)
    try { window.scheduleAutoSync?.(); } catch (e) {}
  } catch (e) {
    console.error("Lỗi lưu appState:", e);
  }
}

function loadAppState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.rooms)) appState.rooms = data.rooms;
    if (Array.isArray(data.costs)) appState.costs = data.costs;
    if (Array.isArray(data.devices)) appState.devices = data.devices;
    if (Array.isArray(data.deviceAssignments)) appState.deviceAssignments = data.deviceAssignments;

    if (data.costUnitPrices) {
      appState.costUnitPrices = {
        electricity: { price: 0, unit: "kWh" },
        water: { price: 0, unit: "m³" },
        ...data.costUnitPrices,
      };
    }

    if (data.invoices) {
      appState.invoices = Array.isArray(data.invoices) ? data.invoices : [];
    } else {
      appState.invoices = [];
    }

    if (data.meters) {
      appState.meters = {
        electricity: {
          lastReadings: {},
          history: [],
          ...(data.meters.electricity || {}),
        },
        water: {
          lastReadings: {},
          history: [],
          ...(data.meters.water || {}),
        },
      };
    }
  } catch (e) {
    console.error("Lỗi đọc appState:", e);
  }
}

// Cho các file tab gọi sau khi thay đổi dữ liệu
window.saveAppState = saveAppState;
window.loadAppState = loadAppState;

// ===== INVOICE APIs (Tab Hóa đơn) =====
function ensureInvoicesState() {
  if (!Array.isArray(appState.invoices)) appState.invoices = [];
}

// Helpers tương thích với invoice.js / checkout.js
function toISO10(v) {
  if (!v) return "";
  if (typeof v === "string") return v.length >= 10 ? v.slice(0, 10) : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function pad2(n) { return String(n).padStart(2, "0"); }
function pad3(n) { return String(n).padStart(3, "0"); }
function ddmmyyyyFromISO(dateISO) {
  const iso = toISO10(dateISO);
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${pad2(d)}${pad2(m)}${y}`;
}
function buildInvoiceTitle(roomNumber, dateISO, kind) {
  const iso = toISO10(dateISO) || toISO10(new Date());
  const [y,m,d] = iso.split("-");
  if (kind === "checkout") return `Hóa đơn trả phòng ${roomNumber} ngày ${pad2(d)} tháng ${pad2(m)} năm ${y}`;
  return `Hóa đơn xuất phòng ${roomNumber} ngày ${pad2(d)} tháng ${pad2(m)} năm ${y}`;
}
function nextInvoiceSeq(roomNumber, dateISO) {
  ensureInvoicesState();
  const rn = String(roomNumber);
  const key = ddmmyyyyFromISO(dateISO);
  let maxSeq = 0;
  appState.invoices.forEach(iv => {
    if (iv?.deleted) return;
    if (String(iv.roomNumber) !== rn) return;
    const ivKey = iv.invoiceDateKey || ddmmyyyyFromISO(iv.invoiceDate || iv.issueDate);
    if (ivKey !== key) return;
    const m = String(iv.code || "").match(/HD(\d{3})$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  });
  return maxSeq + 1;
}
function buildInvoiceCode(roomNumber, dateISO) {
  const rn = String(roomNumber);
  const key = ddmmyyyyFromISO(dateISO);
  const seq = nextInvoiceSeq(rn, dateISO);
  return `${rn}TM${key}HD${pad3(seq)}`;
}

function addInvoice(inv) {
  ensureInvoicesState();

  const issueDate = toISO10(inv.issueDate) || toISO10(inv.invoiceDate) || toISO10(new Date());
  inv.issueDate = issueDate;
  inv.invoiceDate = toISO10(inv.invoiceDate) || issueDate;
  inv.invoiceDateKey = inv.invoiceDateKey || ddmmyyyyFromISO(inv.invoiceDate);

  if (!inv.id) inv.id = `inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // auto title/code nếu thiếu
  const kind = inv.meta?.type === "checkout" ? "checkout" : "monthly";
  if (!inv.title) inv.title = buildInvoiceTitle(inv.roomNumber, inv.invoiceDate, kind);
  if (!inv.code) inv.code = buildInvoiceCode(inv.roomNumber, inv.invoiceDate);

  if (!inv.status) inv.status = "unpaid"; // paid | unpaid | partial
  if (inv.missingAmount == null) inv.missingAmount = 0;
  if (inv.deleted == null) inv.deleted = false;

  appState.invoices.unshift(inv); // mới nhất lên đầu
  saveAppState();
  return inv;
}

function updateInvoice(id, patch) {
  ensureInvoicesState();
  const iv = appState.invoices.find(x => x.id === id);
  if (!iv) return null;
  Object.assign(iv, patch || {});
  saveAppState();
  return iv;
}

function softDeleteInvoice(id) {
  return updateInvoice(id, { deleted: true, deletedAt: new Date().toISOString() });
}

window.addInvoice = addInvoice;
window.updateInvoice = updateInvoice;
window.softDeleteInvoice = softDeleteInvoice;
window.buildInvoiceTitle = buildInvoiceTitle;
window.buildInvoiceCode = buildInvoiceCode;


// Tải dữ liệu khi khởi động
loadAppState();


// ===== ELEMENTS =====
const loginScreen = document.getElementById("login-screen");
const mainScreen  = document.getElementById("main-screen");

const loginBtn   = document.getElementById("login-btn");
const loginId    = document.getElementById("login-id");
const loginPass  = document.getElementById("login-pass");
const loginError = document.getElementById("login-error");

const menuToggle = document.getElementById("menu-toggle");
const rightMenu  = document.getElementById("right-menu");
const logoutBtn  = document.getElementById("logout-btn");

const mainContent = document.getElementById("main-content");

// Menu items
const menuOverview = document.getElementById("menu-overview");
const menuRooms    = document.getElementById("menu-rooms");
const menuCosts    = document.getElementById("menu-costs");
const menuDevices  = document.getElementById("menu-devices");
const menuSettings = document.getElementById("menu-settings");
const menuInvoices = document.getElementById("menu-invoices");


// ===== LOGIN (Firebase Email/Password) =====
function showLogin() {
  mainScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}
function showMain() {
  loginScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
}

// Nếu Firebase chưa load (quên add script), báo lỗi rõ ràng
function ensureFirebaseAuth() {
  if (!window.fbAuth || !window.fbAuth.signInWithEmailAndPassword) {
    throw new Error("Firebase chưa sẵn sàng. Kiểm tra đã thêm firebase-auth và firebase-init.js chưa?");
  }
  return window.fbAuth;
}

loginBtn.onclick = async () => {
  const email = (loginId.value || "").trim();
  const pass  = (loginPass.value || "").trim();
  loginError.innerText = "";

  if (!email || !pass) {
    loginError.innerText = "Nhập email và mật khẩu!";
    return;
  }

  try {
    const auth = ensureFirebaseAuth();
    await auth.signInWithEmailAndPassword(email, pass);
    // UI sẽ được cập nhật bởi onAuthStateChanged bên dưới
  } catch (e) {
    loginError.innerText = e?.message || "Đăng nhập thất bại!";
  }
};

// Theo dõi trạng thái đăng nhập để tự vào app khi refresh
try {
  if (window.fbAuth && window.fbAuth.onAuthStateChanged) {
    window.fbAuth.onAuthStateChanged(async (user) => {
      if (user) {
        showMain();
        loginError.innerText = "";
        // Không auto-load cloud để tránh ghi đè local ngoài ý muốn.
        setView(appState.currentView || "overview");
      } else {
        showLogin();
      }
    });
  } else {
    // Chưa có Firebase: vẫn cho hiện login screen để sếp nhìn thấy lỗi
    showLogin();
  }
} catch (e) {
  showLogin();
}


// ===== MENU TOGGLE (ĐIỆN THOẠI) =====
menuToggle.onclick = () => {
  rightMenu.classList.toggle("show");
};


// ===== LOGOUT =====
logoutBtn.onclick = async () => {
  try {
    if (window.fbAuth && window.fbAuth.signOut) await window.fbAuth.signOut();
  } catch (e) {
    console.warn("Logout Firebase lỗi:", e);
  }

  mainScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  loginId.value = "";
  loginPass.value = "";
  appState.currentView = "overview";
  appState.currentRoomNumber = null;
};


// ===== HỖ TRỢ CHUYỂN VIEW =====
function clearActiveMenu() {
  [
    menuOverview,
    menuRooms,
    menuCosts,
    menuDevices,
    menuSettings,
    menuInvoices, // ✅ thêm dòng này
  ]
    .filter(Boolean)
    .forEach((el) => el.classList.remove("active"));
}
// Cho các file khác dùng
function setView(viewName) {
  appState.currentView = viewName;
  renderView();
  // Ẩn menu bên phải khi trên điện thoại
  rightMenu.classList.remove("show");
}
window.setView = setView;

// Hàm để mở chi tiết phòng, cho tab-rooms.js gọi
function openRoomDetail(roomNumber) {
  appState.currentRoomNumber = roomNumber;
  setView("roomDetail");
}
window.openRoomDetail = openRoomDetail;


function renderView() {
  clearActiveMenu();

  switch (appState.currentView) {
    case "overview":
      menuOverview.classList.add("active");
      window.renderOverview(mainContent, appState);
      break;

    case "rooms":
      menuRooms.classList.add("active");
      window.renderRooms(mainContent, appState);
      break;

    case "settings":
      menuSettings.classList.add("active");
      window.renderSettings(mainContent, appState);
      break;

    case "costs":
      menuCosts.classList.add("active");
      window.renderCosts(mainContent, appState);
      break;

    case "devices":
      menuDevices.classList.add("active");
      window.renderDevices(mainContent, appState);
      break;

    case "invoices":
      if (typeof menuInvoices !== "undefined" && menuInvoices) menuInvoices.classList.add("active");
      if (window.renderInvoices) window.renderInvoices(mainContent, appState);
      else mainContent.innerHTML = "<p>Thiếu tab-invoices.js (window.renderInvoices)</p>";
      break;

    case "roomDetail":
      // vẫn để menu "Phòng" active
      menuRooms.classList.add("active");
      if (appState.currentRoomNumber) {
        window.renderRoomDetail(
          mainContent,
          appState,
          appState.currentRoomNumber
        );
      } else {
        mainContent.innerHTML = "<p>Không xác định được phòng.</p>";
      }
      break;
  }
}


// ===== GÁN SỰ KIỆN CLICK MENU =====
menuOverview.onclick = () => setView("overview");
menuRooms.onclick    = () => setView("rooms");
menuCosts.onclick    = () => setView("costs");
menuDevices.onclick  = () => setView("devices");
menuSettings.onclick = () => setView("settings");
if (menuInvoices) menuInvoices.onclick = () => setView("invoices");


// ===== XUẤT DỮ LIỆU RA EXCEL (.xlsx) =====
function exportToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Chưa tải được thư viện XLSX (xlsx.full.min.js).");
    return;
  }

  const wb = XLSX.utils.book_new();

  // --- SHEET ROOMS (đầy đủ hơn) ---
  const roomsSheetData = (appState.rooms || []).map((r) => {
    const tenants = r.tenants || [];
    const tenantNames = tenants
      .map((t) => t.fullName || "")
      .filter((x) => x)
      .join(", ");

    const assignments = (appState.deviceAssignments || []).filter(
      (a) => a.roomNumber === r.number
    );
    const deviceNames = assignments
      .map((a) => {
        const d = (appState.devices || []).find((dv) => dv.id === a.deviceId);
        return d ? d.name : "";
      })
      .filter((x) => x)
      .join(", ");

    return {
      roomNumber: r.number,
      price: r.price || 0,
      tenantCount: tenants.length,
      tenantNames,
      deviceNames,
    };
  });
  const wsRooms = XLSX.utils.json_to_sheet(roomsSheetData);
  XLSX.utils.book_append_sheet(wb, wsRooms, "Rooms");

  // --- SHEET TENANTS ---
  const tenantsRows = [];
  (appState.rooms || []).forEach((r) => {
    (r.tenants || []).forEach((t) => {
      tenantsRows.push({
        roomNumber: r.number,
        fullName: t.fullName || "",
        gender: t.gender || "",
        dob: t.dob || "",
        relationship: t.relationship || "",
        isOwner: t.isOwner ? 1 : 0,
        address: t.address || "",
        hometown: t.hometown || "",
        phone: t.phone || "",
        note: t.note || "",
      });
    });
  });
  const wsTenants = XLSX.utils.json_to_sheet(tenantsRows);
  XLSX.utils.book_append_sheet(wb, wsTenants, "Tenants");

  // --- SHEET COSTS (chi phí khác) ---
  const wsCosts = XLSX.utils.json_to_sheet(appState.costs || []);
  XLSX.utils.book_append_sheet(wb, wsCosts, "OtherCosts");

  // --- SHEET COST UNIT PRICES (điện, nước) ---
  const cup = appState.costUnitPrices || {};
  const cupRows = [
    {
      key: "electricity",
      price: cup.electricity?.price || 0,
      unit: cup.electricity?.unit || "kWh",
    },
    {
      key: "water",
      price: cup.water?.price || 0,
      unit: cup.water?.unit || "m³",
    },
  ];
  const wsUnitPrices = XLSX.utils.json_to_sheet(cupRows);
  XLSX.utils.book_append_sheet(wb, wsUnitPrices, "UnitPrices");

  // --- SHEET DEVICES ---
  const wsDevices = XLSX.utils.json_to_sheet(appState.devices || []);
  XLSX.utils.book_append_sheet(wb, wsDevices, "Devices");

  // --- SHEET DEVICE ASSIGNMENTS ---
  const daRows = (appState.deviceAssignments || []).map((a) => {
    const dev = (appState.devices || []).find((d) => d.id === a.deviceId);
    return {
      deviceId: a.deviceId,
      deviceName: dev ? dev.name : "",
      roomNumber: a.roomNumber,
    };
  });
  const wsDA = XLSX.utils.json_to_sheet(daRows);
  XLSX.utils.book_append_sheet(wb, wsDA, "DeviceAssignments");

  // --- SHEET METERS ---
  const elec = appState.meters?.electricity || { history: [] };
  const water = appState.meters?.water || { history: [] };

  const wsElec = XLSX.utils.json_to_sheet(elec.history || []);
  XLSX.utils.book_append_sheet(wb, wsElec, "Meters_Electricity");

  const wsWater = XLSX.utils.json_to_sheet(water.history || []);
  XLSX.utils.book_append_sheet(wb, wsWater, "Meters_Water");

  // Ghi file
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nhatro_data.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.exportToExcel = exportToExcel;
