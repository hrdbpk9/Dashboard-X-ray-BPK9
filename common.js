/* ==========================================================================
   BPK9 Radiology Ops — shared utilities
   ========================================================================== */

// ⚠️ ตั้งค่าตรงนี้ให้ตรงกับไฟล์ Google Sheet จริงของแผนก
const SHEET_ID = "18AzF55gPVcpmbPdEjKGGENAHZ1srb1Htq2DKsGyxVLk";

// ชื่อแท็บ (Tab) ต้องตรงกับ Google Sheet เป๊ะๆ (รวมช่องว่าง/จุด) — แก้ตรงนี้ถ้าไม่ตรง
const SHEETS = {
  dailySignoff: "ลงนามรับทราบประจำวัน เริ่ม 1 ก.ค.69",
  nightShift: "ส่งเวรดึก",
  training: "ข้อมูลอบรม",
};

// ตั้งค่า URL ของ Apps Script Web App หลัง deploy แล้ว (ดูขั้นตอนใน apps-script/Code.gs)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz0t-MNKInkcsvqE4WaAtwTkm6Uod7xX1F2WwqUVHBNSYS-S4MyzjnNy84cjyXC7p406Q/exec";

/* ---------- gviz fetch (อ่านข้อมูลจาก Google Sheet ผ่าน docs.google.com — ไม่โดนบล็อกโดย wifi รพ.) ---------- */
async function fetchGvizSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`โหลดชีต "${sheetName}" ไม่สำเร็จ (HTTP ${res.status})`);
  const text = await res.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error(`ไม่พบชีตชื่อ "${sheetName}" ในไฟล์ กรุณาตรวจสอบชื่อแท็บให้ตรงกับ Google Sheet`);
  const data = JSON.parse(match[1]);
  if (data.status === "error") {
    const msg = (data.errors && data.errors[0] && data.errors[0].detailed_message) || "เกิดข้อผิดพลาดในการอ่านข้อมูล";
    throw new Error(msg);
  }
  const cols = data.table.cols.map((c, i) => (c.label || c.id || `col${i}`).trim());
  const rows = (data.table.rows || []).map((r) =>
    r.c.map((cell) => {
      if (!cell) return "";
      if (cell.f !== undefined && cell.f !== null) return cell.f; // formatted string (dates etc.)
      return cell.v === null || cell.v === undefined ? "" : cell.v;
    })
  );
  return { cols, rows };
}

// แปลง array-of-arrays ให้เป็น array of object {colName: value}
function rowsToObjects(cols, rows) {
  return rows.map((r) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = r[i] !== undefined ? r[i] : ""));
    return obj;
  });
}

/* ---------- date helpers ---------- */
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// gviz มักส่งวันที่แบบ "Date(2026,6,16,7,4,28)" มาใน cell.v ถ้าไม่มี .f — เผื่อไว้
function parseGvizDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const m = value.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
    if (m) {
      return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    const d = new Date(value);
    if (!isNaN(d)) return d;
  }
  return null;
}

function toBEDate(d) {
  if (!d) return "-";
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function toBEDateFull(d) {
  if (!d) return "-";
  return `${d.getDate()} ${THAI_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function toISODate(d) {
  if (!d) return "";
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toTimeHM(d) {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

/* ---------- zone tag coloring (สีเวรตามระบบของแผนกเอง) ---------- */
const ZONE_MAP = [
  { key: "ส้ม", color: "var(--zone-orange)" },
  { key: "เหลือง", color: "var(--zone-yellow)" },
  { key: "ฟ้า", color: "var(--zone-blue)" },
  { key: "ม่วง", color: "var(--zone-purple)" },
  { key: "ชมพู", color: "var(--zone-pink)" },
  { key: "เขียว", color: "var(--zone-green)" },
  { key: "แดง", color: "var(--zone-red)" },
  { key: "ใส", color: "var(--zone-clear)" },
];
function zoneTagsHTML(text) {
  if (!text) return "";
  const found = ZONE_MAP.filter((z) => text.includes(z.key));
  if (!found.length) {
    return `<span class="zone-tag" style="background:var(--slate-light)"><span class="dot"></span>${escapeHTML(text)}</span>`;
  }
  return found
    .map((z) => `<span class="zone-tag" style="background:${z.color}"><span class="dot"></span>${escapeHTML(text)}</span>`)
    .join(" ");
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- toast ---------- */
let toastTimer;
function showToast(msg, type = "ok") {
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "toast show" + (type === "error" ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ---------- shared header / footer ---------- */
function renderChrome() {
  const path = location.pathname.split("/").pop() || "index.html";
  const nav = [
    { href: "index.html", label: "หน้าแรก" },
    { href: "daily-signoff.html", label: "ลงนามรับทราบประจำวัน" },
    { href: "night-shift.html", label: "ส่งเวรดึก" },
    { href: "training.html", label: "ข้อมูลอบรม" },
  ];
  const header = document.getElementById("app-header");
  if (header) {
    header.innerHTML = `
      <div class="topbar-inner">
        <a class="brand" href="index.html">
          <img src="assets/bpk9-logo.png" alt="BPK9 International Hospital" />
          <span class="brand-text"><b>แผนกรังสีวิทยา</b><span>BPK9 International Hospital</span></span>
        </a>
        <nav class="topnav">
          ${nav.map(n => `<a href="${n.href}"${n.href === path ? ' class="active"' : ''}>${n.label}</a>`).join("")}
        </nav>
      </div>`;
  }
  const footer = document.getElementById("app-footer");
  if (footer) {
    footer.innerHTML = `
      <span>© โรงพยาบาลบางปะกอก 9 อินเตอร์เนชั่นแนล · แผนกรังสีวิทยา</span>
      <span>จัดทำโดยฝ่ายพัฒนาทรัพยากรบุคคล (HRD)</span>`;
  }
}
document.addEventListener("DOMContentLoaded", renderChrome);
