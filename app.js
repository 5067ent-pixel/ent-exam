import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, orderBy, limit, writeBatch, serverTimestamp, FieldPath, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/* ---------- 常數 ---------- */
// 依專科醫師甄審原則公告之筆試範圍
const CATS = {
  otology: "耳科學",
  rhinology: "鼻科學",
  laryngology: "咽喉科學",
  headneck: "頭頸外科學",
  facialplastic: "顏面整形重建外科學",
  pediatric: "小兒耳鼻喉科學",
  sleep: "睡眠醫學",
  audiology: "臨床聽力及言語學",
  special: "我國特殊耳鼻喉疾病"
};
// 各科顏色（點、標籤、文字）
const CAT_COLOR = {
  otology: ["#2563EB", "#E3ECFD", "#1E40AF"],
  rhinology: ["#059669", "#DDF3EA", "#065F46"],
  laryngology: ["#D97706", "#FDF0DC", "#92400E"],
  headneck: ["#7C3AED", "#EFE7FD", "#5B21B6"],
  facialplastic: ["#DB2777", "#FCE4EF", "#9D174D"],
  pediatric: ["#0891B2", "#DDF2F7", "#155E75"],
  sleep: ["#4F46E5", "#E6E6FC", "#3730A3"],
  audiology: ["#65A30D", "#EAF5DA", "#3F6212"],
  special: ["#DC2626", "#FCE5E5", "#991B1B"]
};
const catColor = (k) => CAT_COLOR[k] || ["#5B6B73", "#EEF2F4", "#3E4F57"];
const catTagStyle = (k) => `background:${catColor(k)[1]};color:${catColor(k)[2]}`;
const LETTERS = "ABCDEF";
const BANK_KEY = "ent-bank-v1";
const PREF_KEY = "ent-prefs-v1";
const SEC_PER_Q = 60; // 模擬考每題秒數
const SNAP_KEEP = 20;  // 題庫備份保留份數
const SNAP_CHUNK = 150; // 每個備份分塊的題數（Firestore 單一文件上限 1 MB）
// 教科書全名（題目 source 寫 "Scott-Brown 8e, Vol 2, Ch 45" 時展開）
const SB_FULL = "Scott-Brown's Otorhinolaryngology and Head and Neck Surgery, 8th ed. (2018)";
const SB_VOL = {
  "1": "Vol 1: Basic Sciences, Endocrine Surgery, Rhinology",
  "2": "Vol 2: Paediatrics, The Ear, and Skull Base Surgery",
  "3": "Vol 3: Head and Neck Surgery, Plastic Surgery"
};

/* ---------- 網站版本（每次更新程式請改這裡） ---------- */
const APP_VERSION = "1.6.0";
const CHANGELOG = [
  { v: "1.6.0", date: "2026-11-12", notes: [
    "全新介面：Noto Sans TC 字體、圓角卡片、深藍綠主色",
    "首頁主卡：完成進度環、答對率、待複習錯題、連續練習天數，一鍵「繼續練習」（優先出沒做過的題）",
    "首頁快捷鍵：錯題本、星號題目、模擬考",
    "各科答對率改為彩色橫條（低於 60% 標橘色），並提示弱科、一鍵練弱科",
    "九個科目各有專屬顏色",
    "作答畫面：頂部進度條與答對／答錯計數、大圓角選項、底部固定按鈕；送出後標出「你的答案」與「正解」"
  ]},
  { v: "1.5.0", date: "2026-11-12", notes: [
    "管理者：新增「使用者作答情形」，可看每位使用者的作答題數、答對率、錯題數、最近作答時間",
    "管理者：點開使用者可看各科答對率、最近 10 次練習／模擬考成績與錯題清單",
    "版本資訊改為只有管理者看得到"
  ]},
  { v: "1.4.0", date: "2026-11-12", notes: [
    "管理者：匯入時可一次選多個題庫檔",
    "管理者：新增「取代整個題庫」選項，匯入後自動刪除不在檔案裡的舊題（會先備份，可還原）"
  ]},
  { v: "1.3.0", date: "2026-11-11", notes: [
    "參考資料新增「📄 開啟本章 PDF」：直接在 Google Drive 找到這題出處的那一章（需有該資料夾的檢視權限）",
    "參考資料可顯示「📍 本題依據」：頁碼、段落標題或 KEY POINTS 第幾點；管理者可在題目編輯器填寫"
  ]},
  { v: "1.2.0", date: "2026-11-11", notes: [
    "詳解可開關：關閉時作答後只顯示對錯，需要時再點開詳解（設定會記住，換裝置也一樣）",
    "每題詳解下方列出教科書參考資料（Scott-Brown 冊別、章號、章名），方便回書查閱",
    "新增星號：做題、錯題本、成績檢討都可以按 ☆ 收藏題目",
    "星號題目可放進自己建立的群組，群組可新增、改名、刪除；一題可放多個群組",
    "首頁出題可選「★ 星號題目」並指定群組",
    "管理者：題目可加「其他參考資料」（指引、期刊、網址）"
  ]},
  { v: "1.1.0", date: "2026-11-11", notes: [
    "做題前可複選這次要複習的科目，並選擇「全部／沒做過／錯題複習」",
    "新增錯題本：依科目瀏覽錯題、看詳解、手動移出已會的題目",
    "錯題複習時答對的題目會自動移出錯題本",
    "網頁底部顯示網站版本與題庫更新時間",
    "管理者：題庫每次變更前自動備份，可一鍵還原到先前版本"
  ]},
  { v: "1.0.0", date: "2026-11-11", notes: [
    "初版：邀請制登入、練習模式、限時模擬考、個人進度、管理後台"
  ]}
];

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- 狀態 ---------- */
// stars: { [qid]: { t, g: [groupId] } }；groups: { [gid]: { name, t } }
const S = {
  user: null, admin: false, bank: [], bankMeta: null, progress: {}, quiz: null, timer: null, registering: false,
  stars: {}, groups: {}, prefs: { expl: true }
};

/* ---------- 小工具 ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => esc(s).replace(/\n/g, "<br>");
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
// 錯題：最近一次答錯，且沒有被手動移出錯題本
const isWrong = (p) => !!p && p.last === false && !p.m;
const shortStem = (q, n) => esc(q.stem.replace(/\s+/g, " ").slice(0, n)) + (q.stem.length > n ? "…" : "");
function show(name) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
  window.scrollTo(0, 0);
}
function toast(msg, ms = 2800) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function errMsg(e) {
  const m = {
    "auth/invalid-credential": "Email 或密碼錯誤",
    "auth/wrong-password": "Email 或密碼錯誤",
    "auth/user-not-found": "Email 或密碼錯誤",
    "auth/email-already-in-use": "這個 Email 已註冊，請直接登入",
    "auth/weak-password": "密碼至少 6 個字元",
    "auth/invalid-email": "Email 格式不正確",
    "auth/too-many-requests": "嘗試太多次，請稍後再試",
    "auth/network-request-failed": "網路連線失敗",
    "permission-denied": "沒有權限（帳號未受邀或 Email 尚未驗證）"
  };
  return m[e?.code] || e?.message || String(e);
}
// 寫入自己的 users/{uid} 文件（args 為 FieldPath, value 交錯）
async function saveUser(...args) {
  if (!S.user || !args.length) return;
  try { await updateDoc(doc(db, "users", S.user.uid), ...args); }
  catch (e) { console.error(e); toast("儲存失敗：" + errMsg(e)); }
}

/* ---------- 登入 / 註冊 ---------- */
let authMode = "login";
function setAuthMode(m) {
  authMode = m;
  const reg = m === "register";
  $("auth-title").textContent = reg ? "註冊（受邀用戶）" : "登入";
  $("auth-submit").textContent = reg ? "註冊" : "登入";
  $("wrap-pass2").hidden = !reg;
  $("auth-pass2").required = reg;
  $("auth-pass").autocomplete = reg ? "new-password" : "current-password";
  $("auth-toggle").textContent = reg ? "已有帳號？回到登入" : "受邀新用戶？註冊帳號";
  $("auth-err").textContent = "";
}
$("auth-toggle").onclick = () => setAuthMode(authMode === "login" ? "register" : "login");

$("form-auth").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim().toLowerCase();
  const pw = $("auth-pass").value;
  $("auth-err").textContent = "";
  $("auth-submit").disabled = true;
  try {
    if (authMode === "register") {
      if (pw !== $("auth-pass2").value) throw { message: "兩次輸入的密碼不一致" };
      S.registering = true;
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      const inv = await getDoc(doc(db, "allowlist", email)).catch(() => null);
      if (!inv || !inv.exists()) {
        await cred.user.delete().catch(() => signOut(auth));
        throw { message: "這個 Email 不在邀請名單中，請聯絡管理員。" };
      }
      await sendEmailVerification(cred.user);
      S.registering = false;
      await handleUser(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, pw);
    }
  } catch (err) {
    S.registering = false;
    $("auth-err").textContent = errMsg(err);
  } finally {
    $("auth-submit").disabled = false;
  }
};

$("auth-reset").onclick = async () => {
  const email = $("auth-email").value.trim();
  if (!email) { $("auth-err").textContent = "請先在上方輸入 Email"; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast("如果此 Email 已註冊，重設密碼信已寄出", 4000);
  } catch (e) { $("auth-err").textContent = errMsg(e); }
};

$("verify-done").onclick = async () => {
  const u = auth.currentUser;
  if (!u) return;
  await u.reload();
  if (auth.currentUser.emailVerified) {
    await auth.currentUser.getIdToken(true); // 讓規則讀到 email_verified = true
    handleUser(auth.currentUser);
  } else toast("尚未完成驗證，請點信中的連結");
};
$("verify-resend").onclick = async () => {
  try { await sendEmailVerification(auth.currentUser); toast("已重新寄出驗證信"); }
  catch (e) { toast(errMsg(e)); }
};
$("verify-logout").onclick = () => signOut(auth);
$("btn-logout").onclick = async () => {
  stopTimer(); S.quiz = null;
  try { localStorage.removeItem(BANK_KEY); } catch {}
  await signOut(auth);
};

async function handleUser(u) {
  S.user = u;
  if (!u) { $("nav").hidden = true; S.admin = false; $("btn-changelog").hidden = true; S.stars = {}; S.groups = {}; show("auth"); return; }
  if (S.registering) return;
  if (!u.emailVerified) {
    $("verify-email").textContent = u.email;
    $("nav").hidden = true; show("verify"); return;
  }
  show("loading");
  try {
    const email = u.email.toLowerCase();
    const inv = await getDoc(doc(db, "allowlist", email));
    if (!inv.exists()) {
      await signOut(auth);
      $("auth-err").textContent = "此帳號不在邀請名單中（或已被移除），請聯絡管理員。";
      return;
    }
    S.admin = inv.data().role === "admin";
    const uref = doc(db, "users", u.uid);
    await setDoc(uref, { email, lastLogin: serverTimestamp() }, { merge: true });
    const snap = await getDoc(uref);
    const d = snap.data() || {};
    S.progress = d.progress || {};
    S.stars = d.starred || {};
    S.groups = d.groups || {};
    S.prefs = { expl: true, ...readLocalPrefs(), ...(d.prefs || {}) };
    syncPrefUI();
    await loadBank();
    $("nav").hidden = false;
    $("nav-admin").hidden = !S.admin;
    $("btn-changelog").hidden = !S.admin;
    renderHome(); renderFooter(); show("home");
  } catch (e) {
    console.error(e);
    $("auth-err").textContent = "載入失敗：" + errMsg(e);
    $("nav").hidden = true; show("auth");
  }
}
onAuthStateChanged(auth, handleUser);

/* ---------- 偏好設定：詳解開關 ---------- */
function readLocalPrefs() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } }
function syncPrefUI() {
  document.querySelectorAll(".pref-expl").forEach((i) => (i.checked = !!S.prefs.expl));
}
function setExplPref(v) {
  S.prefs.expl = v;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs)); } catch {}
  syncPrefUI();
  document.querySelectorAll("details.expl-box").forEach((d) => (d.open = v));
  saveUser(new FieldPath("prefs", "expl"), v);
}
document.addEventListener("change", (e) => {
  if (e.target.classList?.contains("pref-expl")) setExplPref(e.target.checked);
});
syncPrefUI();

/* ---------- 題庫載入（有版本快取，避免每次都重抓） ---------- */
function readCache() { try { return JSON.parse(localStorage.getItem(BANK_KEY)); } catch { return null; } }
function writeCache(version) {
  try { localStorage.setItem(BANK_KEY, JSON.stringify({ version, questions: S.bank })); } catch {}
}
async function loadBank(force = false) {
  const meta = await getDoc(doc(db, "meta", "bank"));
  S.bankMeta = meta.exists() ? meta.data() : null;
  const version = S.bankMeta?.version || 0;
  const cached = readCache();
  if (!force && cached && cached.version === version && Array.isArray(cached.questions)) {
    S.bank = cached.questions;
  } else {
    const snap = await getDocs(collection(db, "questions"));
    S.bank = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    writeCache(version);
  }
  S.bank.sort((a, b) => a.id.localeCompare(b.id));
}
async function bumpVersion() {
  const version = Date.now();
  await setDoc(doc(db, "meta", "bank"), { version, count: S.bank.length, updatedAt: serverTimestamp() }, { merge: true });
  S.bankMeta = { ...(S.bankMeta || {}), version, count: S.bank.length };
  writeCache(version);
  renderFooter();
}

/* ---------- 版本資訊 ---------- */
function fmtTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function renderFooter() {
  let t = `網站版本 v${APP_VERSION}`;
  if (S.user && S.bankMeta?.version) t += `　·　題庫更新於 ${fmtTime(S.bankMeta.version)}（${S.bank.length} 題）`;
  $("footer-text").textContent = t;
}
$("btn-changelog").onclick = () => {
  if (!S.admin) return;
  $("changelog").innerHTML = CHANGELOG.map((c) =>
    `<div class="changelog-item"><b>v${c.v}</b> <span class="muted small">${c.date}</span><ul>${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`
  ).join("");
  $("dlg-changelog").showModal();
};
$("changelog-close").onclick = () => $("dlg-changelog").close();
renderFooter();

/* ---------- 導覽 ---------- */
function go(name) {
  stopTimer();
  if (name === "home") { S.quiz = null; renderHome(); show("home"); }
  if (name === "admin" && S.admin) { S.quiz = null; renderAdmin(); }
  if (name === "wrong") { S.quiz = null; renderWrongBook(); show("wrong"); }
  if (name === "starred") { S.quiz = null; renderStarred(); show("starred"); }
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (!g) return;
  if (S.quiz && !S.quiz.done && !confirm("離開會放棄這次作答，確定嗎？")) return;
  go(g.dataset.go);
});

/* ---------- 詳解與參考資料 ---------- */
function linkify(s) {
  return esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
function refList(q) {
  const out = [];
  const m = /Scott-Brown\s*8e\s*,\s*Vol\s*(\d)\s*,\s*Ch\s*([0-9]+[a-z]?)/i.exec(q.source || "");
  if (m) {
    out.push(`${SB_FULL}. ${SB_VOL[m[1]] || "Vol " + m[1]}. Chapter ${m[2]}${q.chapter ? `: ${q.chapter}` : ""}.`);
  } else if (q.source) {
    out.push(q.source + (q.chapter ? `：${q.chapter}` : ""));
  } else if (q.chapter) {
    out.push(q.chapter);
  }
  if ((q.tags || []).includes("AJCC v9 註記")) out.push("AJCC Cancer Staging System, Version 9（American College of Surgeons）— 詳解中的第 9 版更新註記");
  for (const r of q.refs || []) if (r) out.push(r);
  return out;
}
// 單章 PDF 檔名為 Vol{冊}_Ch{三位章號}_{章名}.pdf，用 Drive 搜尋檔名開頭找到該章
function chapterKey(q) {
  const m = /Scott-Brown\s*8e\s*,\s*Vol\s*(\d)\s*,\s*Ch\s*([0-9]+)([a-z]?)/i.exec(q.source || "");
  return m ? `Vol${m[1]}_Ch${m[2].padStart(3, "0")}${m[3].toLowerCase()}` : "";
}
function pdfHTML(q) {
  const k = chapterKey(q);
  if (!k) return "";
  const url = "https://drive.google.com/drive/search?q=" + encodeURIComponent(k);
  return `<div class="pdf-link"><a href="${url}" target="_blank" rel="noopener">📄 開啟本章 PDF（Google Drive：${k}）</a></div>`;
}
// 本題依據的段落（頁碼、段落標題、KEY POINTS 第幾點），不含原文
function locHTML(q) {
  const loc = (q.loc || []).filter(Boolean);
  if (!loc.length) return "";
  return `<div class="loc"><b>📍 本題依據</b><ul>${loc.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
}
function refHTML(q) {
  const refs = refList(q);
  if (!refs.length) return "";
  return `<div class="refs"><div class="refs-h">📖 參考資料</div><ul>${refs.map((r) => `<li>${linkify(r)}</li>`).join("")}</ul>${locHTML(q)}${pdfHTML(q)}</div>`;
}
function explBlock(q) {
  return `<details class="expl-box" ${S.prefs.expl ? "open" : ""}><summary>詳解與參考資料</summary>` +
    `<div class="expl">${fmt(q.explanation || "（尚無詳解）")}</div>${refHTML(q)}</details>`;
}
function feedbackHTML(q, sel) {
  const ok = sel === q.answer;
  const icon = ok ? `<path d="M5 12.5l4.5 4.5L19 7.5"></path>` : `<path d="M6 6l12 12M18 6L6 18"></path>`;
  return `<div class="verdict ${ok ? "ok" : "bad"}"><span class="v-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span>
    <span><b>${ok ? "答對了" : sel == null ? `沒有作答，正解是 ${LETTERS[q.answer]}` : `答錯了，正解是 ${LETTERS[q.answer]}`}</b>${ok ? "" : `<small>已加入錯題本，之後答對會自動移出</small>`}</span></div>` +
    explBlock(q) +
    (q.reviewed ? "" : `<div class="src">⚠ 本題尚未經審題，如有疑問請回報管理員</div>`);
}

/* ---------- 星號與群組 ---------- */
const isStar = (id) => !!S.stars[id];
function starBtn(id) {
  const on = isStar(id);
  return `<button type="button" class="star ${on ? "on" : ""}" data-star="${esc(id)}" title="${on ? "取消星號" : "加星號"}" aria-label="${on ? "取消星號" : "加星號"}">${on ? "★" : "☆"}</button>`;
}
function groupTags(id) {
  const g = (S.stars[id]?.g || []).filter((x) => S.groups[x]);
  return g.map((x) => `<span class="gtag">${esc(S.groups[x].name)}</span>`).join("");
}
function sortedGroups() {
  return Object.entries(S.groups).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
}
function inStarSel(id, sel) {
  const s = S.stars[id];
  if (!s) return false;
  if (sel === "all") return true;
  if (sel === "none") return !(s.g || []).some((x) => S.groups[x]);
  return (s.g || []).includes(sel);
}
function refreshStarUI() {
  document.querySelectorAll("[data-star]").forEach((b) => {
    const on = isStar(b.dataset.star);
    b.classList.toggle("on", on);
    b.textContent = on ? "★" : "☆";
    b.title = on ? "取消星號" : "加星號";
  });
  if (S.quiz && !$("view-quiz").hidden) renderQuizStar();
  if (!$("view-starred").hidden) renderStarred();
  if (!$("view-home").hidden) renderStarTotal();
}
function toggleStar(id) {
  if (isStar(id)) {
    const hasG = (S.stars[id].g || []).length;
    if (hasG && !confirm("取消星號後，這題也會從所有群組中移除。確定嗎？")) return;
    delete S.stars[id];
    saveUser(new FieldPath("starred", id), deleteField());
    toast("已取消星號");
  } else {
    S.stars[id] = { t: Date.now(), g: [] };
    saveUser(new FieldPath("starred", id), S.stars[id]);
    toast(Object.keys(S.groups).length ? "已加星號，可按「分類」放進群組" : "已加星號");
  }
  refreshStarUI();
}
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-star]");
  const g = e.target.closest("[data-grp]");
  if (!s && !g) return;
  e.preventDefault(); e.stopPropagation(); // 按鈕在 <summary> 裡時不要展開/收合
  if (s) toggleStar(s.dataset.star);
  else openGroupPicker(g.dataset.grp);
}, true);

// 群組分類對話框
let grpFor = null;
function renderGroupBoxes(checked) {
  const gs = sortedGroups();
  $("grp-boxes").innerHTML = gs.length
    ? gs.map(([gid, g]) => `<label><input type="checkbox" value="${esc(gid)}" ${checked.has(gid) ? "checked" : ""}> ${esc(g.name)}</label>`).join("")
    : `<span class="muted small">還沒有群組，請在下方輸入名稱新增。</span>`;
}
function openGroupPicker(id) {
  const q = S.bank.find((x) => x.id === id);
  if (!q) return;
  grpFor = id;
  $("grp-q").textContent = q.stem.replace(/\s+/g, " ").slice(0, 70) + (q.stem.length > 70 ? "…" : "");
  $("grp-save").textContent = isStar(id) ? "儲存" : "儲存並加星號";
  $("grp-new").value = "";
  renderGroupBoxes(new Set(S.stars[id]?.g || []));
  $("dlg-groups").showModal();
}
function createGroup(name) {
  name = name.trim();
  if (!name) return null;
  if (Object.values(S.groups).some((g) => g.name === name)) { toast("已經有同名的群組"); return null; }
  const gid = "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  S.groups[gid] = { name, t: Date.now() };
  saveUser(new FieldPath("groups", gid), S.groups[gid]);
  return gid;
}
$("grp-add").onclick = () => {
  const checked = new Set([...$("grp-boxes").querySelectorAll("input:checked")].map((i) => i.value));
  const gid = createGroup($("grp-new").value);
  if (!gid) return;
  checked.add(gid);
  $("grp-new").value = "";
  renderGroupBoxes(checked);
};
$("grp-new").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("grp-add").click(); } };
$("grp-cancel").onclick = () => $("dlg-groups").close();
$("grp-save").onclick = () => {
  const id = grpFor;
  const g = [...$("grp-boxes").querySelectorAll("input:checked")].map((i) => i.value);
  S.stars[id] = { t: S.stars[id]?.t || Date.now(), g };
  saveUser(new FieldPath("starred", id), S.stars[id]);
  $("dlg-groups").close();
  toast(g.length ? `已放進 ${g.length} 個群組` : "已加星號（未分類）");
  refreshStarUI();
};

/* ---------- 星號題目頁 ---------- */
let svSel = "all";
function starredList(sel) {
  return S.bank.filter((q) => inStarSel(q.id, sel)).sort((a, b) => (S.stars[b.id].t || 0) - (S.stars[a.id].t || 0));
}
function renderStarTotal() {
  const n = S.bank.filter((q) => isStar(q.id)).length;
  const g = Object.keys(S.groups).length;
  $("star-total").textContent = n ? `${n} 題${g ? `・${g} 群組` : ""}` : "還沒有收藏";
}
function renderStarred() {
  if (svSel !== "all" && svSel !== "none" && !S.groups[svSel]) svSel = "all";
  const cnt = (sel) => S.bank.filter((q) => inStarSel(q.id, sel)).length;
  const chips = [["all", "全部星號"], ["none", "未分類"], ...sortedGroups().map(([gid, g]) => [gid, g.name])];
  $("sv-groups").innerHTML = chips.map(([k, name]) =>
    `<button type="button" class="chip ${svSel === k ? "on" : ""}" data-sv="${esc(k)}">${esc(name)} <span class="muted">${cnt(k)}</span></button>`
  ).join("");
  const isG = svSel !== "all" && svSel !== "none";
  $("sv-rename").hidden = !isG;
  $("sv-delete").hidden = !isG;
  const list = starredList(svSel);
  $("sv-count").textContent = `共 ${list.length} 題`;
  $("sv-practice").disabled = !list.length;
  $("sv-list").innerHTML = list.map((q) => {
    const p = S.progress[q.id];
    const opts = q.options.map((o, k) =>
      `<div class="ropt ${k === q.answer ? "correct" : ""}"><b>${LETTERS[k]}.</b> ${fmt(o)}${k === q.answer ? "　✓ 正解" : ""}</div>`
    ).join("");
    const stat = p ? `作答 ${p.n} 次、答錯 ${p.w} 次${p.last ? "，上次答對" : "，上次答錯"}` : "還沒做過";
    return `<details class="rq st"><summary>${starBtn(q.id)}<span class="tag">${esc(CATS[q.category] || q.category)}</span> ${shortStem(q, 46)}<br>
      ${groupTags(q.id)}<span class="muted small">${stat}</span></summary>
      <p>${fmt(q.stem)}</p>${opts}
      <div class="feedback">${explBlock(q)}</div>
      <div class="row"><button class="link" data-grp="${esc(q.id)}">分類到群組</button></div></details>`;
  }).join("") || `<p class="muted">${svSel === "all" ? "還沒有星號題目。做題時按題目上方的 ☆ 就能收藏。" : "這個群組目前沒有題目。"}</p>`;
}
$("sv-groups").onclick = (e) => {
  const b = e.target.closest("[data-sv]");
  if (!b) return;
  svSel = b.dataset.sv;
  renderStarred();
};
$("sv-new").onclick = () => {
  const name = prompt("新群組名稱（例如：NPC 必考、待問主治）");
  if (name == null) return;
  const gid = createGroup(name);
  if (gid) { svSel = gid; renderStarred(); toast("已新增群組，做題時按「分類」就能把題目放進來"); }
};
$("sv-rename").onclick = () => {
  const g = S.groups[svSel];
  if (!g) return;
  const name = prompt("群組新名稱", g.name);
  if (name == null || !name.trim() || name.trim() === g.name) return;
  if (Object.values(S.groups).some((x) => x.name === name.trim())) { toast("已經有同名的群組"); return; }
  g.name = name.trim();
  saveUser(new FieldPath("groups", svSel, "name"), g.name);
  renderStarred();
};
$("sv-delete").onclick = () => {
  const gid = svSel, g = S.groups[gid];
  if (!g) return;
  const n = Object.values(S.stars).filter((s) => (s.g || []).includes(gid)).length;
  if (!confirm(`刪除群組「${g.name}」？\n裡面的 ${n} 題仍會保留星號，只是不再屬於這個群組。`)) return;
  delete S.groups[gid];
  const args = [new FieldPath("groups", gid), deleteField()];
  for (const [qid, s] of Object.entries(S.stars)) {
    if ((s.g || []).includes(gid)) {
      s.g = s.g.filter((x) => x !== gid);
      args.push(new FieldPath("starred", qid, "g"), s.g);
    }
  }
  saveUser(...args);
  svSel = "all";
  renderStarred();
  toast("已刪除群組");
};
$("sv-practice").onclick = () => {
  const list = starredList(svSel);
  if (!list.length) return;
  startQuiz(shuffle(list.slice()).slice(0, 100), "practice", "starred");
};

/* ---------- 首頁 ---------- */
function catOptionsHTML(withAll) {
  return (withAll ? `<option value="all">全部範圍</option>` : "") +
    Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
}
function renderSetupGroups() {
  const sel = $("setup-group"), prev = sel.value || "all";
  sel.innerHTML = `<option value="all">全部星號題目</option><option value="none">未分類</option>` +
    sortedGroups().map(([gid, g]) => `<option value="${esc(gid)}">${esc(g.name)}</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === prev) ? prev : "all";
  $("setup-group-wrap").hidden = setupFilter() !== "starred";
}
function renderHome() {
  const per = {};
  for (const k of Object.keys(CATS)) per[k] = { total: 0, ans: 0, cor: 0, wrong: 0 };
  let ans = 0, cor = 0, wrong = 0;
  for (const q of S.bank) {
    const c = per[q.category] || (per[q.category] = { total: 0, ans: 0, cor: 0, wrong: 0 });
    c.total++;
    const p = S.progress[q.id];
    if (p) { c.ans++; ans++; if (p.last) { c.cor++; cor++; } }
    if (isWrong(p)) { c.wrong++; wrong++; }
  }
  // 主卡：進度環、問候、統計
  const total = S.bank.length, ratio = total ? ans / total : 0;
  const C = 2 * Math.PI * 44, dash = Math.round(C * ratio);
  $("hero-ring").innerHTML = `<svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label="已完成 ${Math.round(ratio * 100)}%">
    <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="10"></circle>
    <circle cx="52" cy="52" r="44" fill="none" stroke="#FFB867" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} ${Math.round(C)}" transform="rotate(-90 52 52)"></circle>
    <text x="52" y="52" text-anchor="middle" fill="#fff" font-size="24" font-weight="900">${Math.round(ratio * 100)}%</text>
    <text x="52" y="71" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="11">已完成</text></svg>`;
  const hr = new Date().getHours();
  $("hero-hi").textContent = `${hr < 11 ? "早安" : hr < 18 ? "午安" : "晚安"}，今天也來練幾題`;
  $("hero-count").innerHTML = `${ans.toLocaleString()}<small> / ${total.toLocaleString()} 題</small>`;
  $("hero-sub").textContent = ans ? `還有 ${(total - ans).toLocaleString()} 題沒做過` : "從第一題開始吧";
  const streak = calcStreak();
  $("hero-stats").innerHTML = [[pct(cor, ans), "答對率"], [wrong, "待複習錯題"], [`${streak} 天`, "連續練習"]]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");

  // 各科答對率橫條
  const rows = Object.entries(per).filter(([, c]) => c.total);
  $("cat-bars").innerHTML = rows.map(([k, c]) => {
    const r = c.ans ? c.cor / c.ans : null;
    const cls = r == null ? "" : r >= 0.8 ? "good" : r >= 0.6 ? "mid" : "low";
    return `<button class="bar-row" data-only-cat="${k}" aria-label="只練${esc(CATS[k] || k)}">
      <span class="bar-name"><i style="background:${catColor(k)[0]}"></i>${esc(CATS[k] || k)}</span>
      <span class="bar"><span class="${cls}" style="width:${r == null ? 0 : Math.round(r * 100)}%"></span></span>
      <span class="bar-pct ${cls}">${r == null ? "—" : Math.round(r * 100) + "%"}</span>
      <span class="bar-meta">${c.ans}/${c.total}</span></button>`;
  }).join("");
  const weak = rows.filter(([, c]) => c.ans >= 5 && c.cor / c.ans < 0.6).sort((a, b) => a[1].cor / a[1].ans - b[1].cor / b[1].ans).slice(0, 2);
  $("weak-hint").innerHTML = weak.length ? `<div class="weak">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"></path><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>
    <span>弱科：${weak.map(([k]) => esc(CATS[k] || k)).join("、")}</span>
    <button class="link" id="weak-go" data-cats="${weak.map(([k]) => k).join(",")}">練弱科</button></div>` : "";

  $("wrong-total").textContent = wrong ? `${wrong} 題` : "目前沒有錯題";
  renderStarTotal();

  // 範圍選擇（保留原本勾選）
  const box = $("cat-boxes");
  const prev = new Set([...box.querySelectorAll("input:checked")].map((i) => i.value));
  const first = !box.children.length;
  box.innerHTML = Object.entries(CATS).map(([k, v]) =>
    `<label><input type="checkbox" value="${k}" ${first || prev.has(k) ? "checked" : ""}><i class="dot" style="background:${catColor(k)[0]}"></i>${v} <span class="muted">${per[k].total}</span>${per[k].wrong ? ` <span class="wrong-n">錯${per[k].wrong}</span>` : ""}</label>`
  ).join("");
  renderSetupGroups();
  syncPrefUI();
  updatePoolInfo();
  renderRecent();
}
function buildPool() {
  const cats = [...document.querySelectorAll("#cat-boxes input:checked")].map((i) => i.value);
  const f = setupFilter();
  const gsel = $("setup-group").value || "all";
  return S.bank.filter((q) => {
    if (!cats.includes(q.category)) return false;
    const p = S.progress[q.id];
    if (f === "new") return !p;
    if (f === "wrong") return isWrong(p);
    if (f === "starred") return inStarSel(q.id, gsel);
    return true;
  });
}

/* ---------- 錯題複習 ---------- */
function wrongPool(cat) {
  return S.bank.filter((q) => (cat === "all" || q.category === cat) && isWrong(S.progress[q.id]));
}
function startWrongReview(cat) {
  const pool = wrongPool(cat);
  if (!pool.length) { toast("這個範圍沒有錯題"); return; }
  // 答錯次數多的優先，同次數隨機；一次最多 50 題
  const qs = shuffle(pool.slice()).sort((a, b) => (S.progress[b.id].w || 0) - (S.progress[a.id].w || 0)).slice(0, 50);
  startQuiz(qs, "practice", "review");
}
$("wrong-book-open").onclick = () => go("wrong");
function selectCats(cats, msg) {
  document.querySelectorAll("#cat-boxes input").forEach((i) => (i.checked = cats.includes(i.value)));
  updatePoolInfo();
  $("form-setup").scrollIntoView({ behavior: "smooth", block: "start" });
  if (msg) toast(msg);
}
$("cat-bars").onclick = (e) => {
  const b = e.target.closest("[data-only-cat]");
  if (b) selectCats([b.dataset.onlyCat], `已只選「${CATS[b.dataset.onlyCat]}」，設定好題數後按開始`);
};
$("weak-hint").onclick = (e) => {
  const b = e.target.closest("#weak-go");
  if (b) selectCats(b.dataset.cats.split(","), "已選好弱科，設定好題數後按開始");
};
// 連續練習天數：以每題作答時間計，今天或昨天有練就算連續
function calcStreak() {
  const days = new Set(Object.values(S.progress).map((p) => p.t && new Date(p.t).toDateString()).filter(Boolean));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// 主卡「繼續練習」：全部科目，優先出沒做過的題目
$("hero-go").onclick = () => {
  const fresh = S.bank.filter((q) => !S.progress[q.id]);
  const pool = fresh.length ? fresh : S.bank;
  if (!pool.length) { toast("題庫還是空的"); return; }
  startQuiz(shuffle(pool.slice()).slice(0, 20), "practice");
};
$("tile-exam").onclick = () => {
  document.querySelector("input[name=mode][value=exam]").checked = true;
  $("form-setup").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("已切到模擬考，選好科目與題數後按開始");
};

/* ---------- 錯題本 ---------- */
function renderWrongBook() {
  const sel = $("wb-cat");
  if (!sel.options.length) sel.innerHTML = catOptionsHTML(true);
  const cat = sel.value || "all";
  const list = wrongPool(cat);
  if ($("wb-sort").value === "most") list.sort((a, b) => (S.progress[b.id].w - S.progress[a.id].w) || (S.progress[b.id].t - S.progress[a.id].t));
  else list.sort((a, b) => S.progress[b.id].t - S.progress[a.id].t);
  $("wb-count").textContent = `共 ${list.length} 題`;
  $("wb-review").disabled = !list.length;
  $("wb-list").innerHTML = list.map((q) => {
    const p = S.progress[q.id];
    const opts = q.options.map((o, k) =>
      `<div class="ropt ${k === q.answer ? "correct" : k === p.sel ? "wrong" : ""}"><b>${LETTERS[k]}.</b> ${fmt(o)}${k === p.sel ? "　← 你上次的答案" : ""}${k === q.answer ? "　✓ 正解" : ""}</div>`
    ).join("");
    return `<details class="rq bad"><summary>${starBtn(q.id)}<span class="tag">${esc(CATS[q.category] || q.category)}</span> ${shortStem(q, 46)}<br><span class="muted small">答錯 ${p.w} 次／共作答 ${p.n} 次</span></summary>
      <p>${fmt(q.stem)}</p>${opts}
      <div class="feedback">${explBlock(q)}</div>
      <div class="row"><button class="link" data-master="${esc(q.id)}">我已經會了，移出錯題本</button><button class="link" data-grp="${esc(q.id)}">★ 分類到群組</button></div></details>`;
  }).join("") || `<p class="muted">這個範圍沒有錯題。</p>`;
}
$("wb-cat").onchange = renderWrongBook;
$("wb-sort").onchange = renderWrongBook;
$("wb-review").onclick = () => startWrongReview($("wb-cat").value || "all");
$("wb-list").onclick = async (e) => {
  const b = e.target.closest("[data-master]");
  if (!b) return;
  const id = b.dataset.master;
  S.progress[id] = { ...S.progress[id], m: true };
  renderWrongBook();
  try { await updateDoc(doc(db, "users", S.user.uid), new FieldPath("progress", id, "m"), true); toast("已移出錯題本"); }
  catch (err) { toast("儲存失敗：" + errMsg(err)); }
};
function updatePoolInfo() { $("pool-info").textContent = `符合條件的題目：${buildPool().length} 題`; }
$("cat-boxes").onchange = updatePoolInfo;
const setupFilter = () => document.querySelector("input[name=filter]:checked").value;
$("setup-filter-group").onchange = () => {
  $("setup-group-wrap").hidden = setupFilter() !== "starred";
  updatePoolInfo();
};
$("setup-group").onchange = updatePoolInfo;
$("cat-all").onclick = () => { document.querySelectorAll("#cat-boxes input").forEach((i) => (i.checked = true)); updatePoolInfo(); };
$("cat-none").onclick = () => { document.querySelectorAll("#cat-boxes input").forEach((i) => (i.checked = false)); updatePoolInfo(); };

async function renderRecent() {
  const ul = $("recent");
  try {
    const snap = await getDocs(query(collection(db, "users", S.user.uid, "exams"), orderBy("ts", "desc"), limit(5)));
    if (snap.empty) { ul.innerHTML = `<li class="muted">還沒有紀錄</li>`; return; }
    ul.innerHTML = snap.docs.map((d) => {
      const x = d.data(), dt = new Date(x.ts);
      return `<li>${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}　${x.mode === "exam" ? "模擬考" : "練習"}　${x.correct}/${x.total}（${pct(x.correct, x.total)}）</li>`;
    }).join("");
  } catch (e) { ul.innerHTML = `<li class="muted">無法讀取紀錄</li>`; }
}

/* ---------- 作答 ---------- */
$("form-setup").onsubmit = (e) => {
  e.preventDefault();
  const pool = buildPool();
  if (!pool.length) { toast("沒有符合條件的題目"); return; }
  const n = +$("setup-count").value;
  const mode = document.querySelector("input[name=mode]:checked").value;
  const f = setupFilter();
  if (f === "wrong") {
    // 錯題複習：答錯次數多的優先
    const qs = shuffle(pool.slice()).sort((a, b) => (S.progress[b.id].w || 0) - (S.progress[a.id].w || 0)).slice(0, n);
    startQuiz(qs, mode, "review");
  } else startQuiz(shuffle(pool.slice()).slice(0, n), mode, f === "starred" ? "starred" : "normal");
};

function startQuiz(qs, mode, kind = "normal") {
  S.quiz = {
    qs, mode, kind, i: 0, done: false, start: Date.now(),
    answers: Array(qs.length).fill(null),
    revealed: Array(qs.length).fill(false)
  };
  $("quiz-timer").textContent = "";
  $("quiz-grid").hidden = mode !== "exam";
  $("quiz-finish").hidden = mode !== "exam";
  $("quiz-expl-wrap").hidden = mode === "exam";
  syncPrefUI();
  if (mode === "exam") { S.quiz.deadline = Date.now() + qs.length * SEC_PER_Q * 1000; startTimer(); }
  renderQ(); show("quiz");
}

function renderQuizStar() {
  const q = S.quiz.qs[S.quiz.i];
  $("quiz-star").innerHTML = `${starBtn(q.id)}<button type="button" class="link small" data-grp="${esc(q.id)}">分類</button> ${groupTags(q.id)}`;
}

function renderQ() {
  const Q = S.quiz, q = Q.qs[Q.i], sel = Q.answers[Q.i];
  const rev = Q.mode === "practice" && Q.revealed[Q.i];
  const last = Q.i === Q.qs.length - 1;
  const label = { review: "錯題複習　", starred: "★ 星號題目　" }[Q.kind] || "";
  $("quiz-pos").textContent = `${label}第 ${Q.i + 1} / ${Q.qs.length} 題`;
  $("quiz-pos-big").textContent = `${label}第 ${Q.i + 1} / ${Q.qs.length} 題`;
  const done = Q.mode === "practice" ? Q.revealed.filter(Boolean).length : Q.answers.filter((a) => a != null).length;
  $("quiz-bar").style.width = Math.round((done / Q.qs.length) * 100) + "%";
  if (Q.mode === "practice") {
    const okN = Q.qs.filter((x, i) => Q.revealed[i] && Q.answers[i] === x.answer).length;
    $("quiz-score").textContent = `答對 ${okN}・答錯 ${done - okN}`;
  } else $("quiz-score").textContent = `已作答 ${done}`;
  $("quiz-cat").textContent = CATS[q.category] || q.category;
  $("quiz-cat").style.cssText = catTagStyle(q.category);
  renderQuizStar();
  $("quiz-stem").innerHTML = fmt(q.stem);
  $("quiz-options").innerHTML = q.options.map((o, k) => {
    let cls = "opt";
    if (sel === k) cls += " selected";
    if (rev) { if (k === q.answer) cls += " correct"; else if (k === sel) cls += " wrong"; }
    const tag = rev ? (k === q.answer ? `<em>正解</em>` : k === sel ? `<em>你的答案</em>` : "") : "";
    return `<button class="${cls}" data-k="${k}" ${rev ? "disabled" : ""}><b>${LETTERS[k]}</b><span>${fmt(o)}</span>${tag}</button>`;
  }).join("");
  const fb = $("quiz-feedback");
  fb.hidden = !rev;
  if (rev) fb.innerHTML = feedbackHTML(q, sel);

  if (Q.mode === "practice") {
    $("quiz-prev").hidden = true;
    $("quiz-submit").hidden = rev;
    $("quiz-submit").disabled = sel == null;
    $("quiz-next").hidden = !rev;
    $("quiz-next").disabled = false;
    $("quiz-next").textContent = last ? "看結果" : "下一題";
  } else {
    $("quiz-prev").hidden = false;
    $("quiz-prev").disabled = Q.i === 0;
    $("quiz-submit").hidden = true;
    $("quiz-next").hidden = false;
    $("quiz-next").disabled = last;
    $("quiz-next").textContent = "下一題";
    $("quiz-grid").innerHTML = Q.qs.map((_, i) =>
      `<button data-i="${i}" class="${Q.answers[i] != null ? "done" : ""} ${i === Q.i ? "cur" : ""}">${i + 1}</button>`
    ).join("");
  }
}

$("quiz-options").onclick = (e) => {
  const b = e.target.closest("button.opt");
  if (!b || b.disabled) return;
  S.quiz.answers[S.quiz.i] = +b.dataset.k;
  renderQ();
};
$("quiz-submit").onclick = () => {
  const Q = S.quiz, q = Q.qs[Q.i];
  if (Q.answers[Q.i] == null) return;
  Q.revealed[Q.i] = true;
  renderQ();
  recordAnswers([{ id: q.id, ok: Q.answers[Q.i] === q.answer, sel: Q.answers[Q.i] }]);
};
$("quiz-next").onclick = () => {
  const Q = S.quiz;
  if (Q.mode === "practice" && Q.i === Q.qs.length - 1) { finishQuiz(); return; }
  if (Q.i < Q.qs.length - 1) { Q.i++; renderQ(); window.scrollTo(0, 0); }
};
$("quiz-prev").onclick = () => { if (S.quiz.i > 0) { S.quiz.i--; renderQ(); } };
$("quiz-grid").onclick = (e) => {
  const b = e.target.closest("button[data-i]");
  if (b) { S.quiz.i = +b.dataset.i; renderQ(); }
};
$("quiz-finish").onclick = () => {
  const un = S.quiz.answers.filter((a) => a == null).length;
  if (un && !confirm(`還有 ${un} 題沒作答，確定交卷？`)) return;
  finishQuiz();
};
$("quiz-x").onclick = () => $("quiz-quit").click();
$("quiz-quit").onclick = () => {
  const Q = S.quiz;
  if (Q.mode === "practice") {
    if (Q.revealed.some(Boolean)) finishQuiz(); else go("home");
  } else if (confirm("放棄這次模擬考？成績不會記錄。")) { Q.done = true; go("home"); }
};

function startTimer() {
  stopTimer();
  const tick = () => {
    if (!S.quiz) return stopTimer();
    const left = S.quiz.deadline - Date.now();
    if (left <= 0) {
      $("quiz-timer").textContent = "00:00";
      stopTimer(); toast("時間到，自動交卷"); finishQuiz(); return;
    }
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    $("quiz-timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    $("quiz-timer").classList.toggle("warn", left < 5 * 60000);
  };
  tick();
  S.timer = setInterval(tick, 1000);
}
function stopTimer() { clearInterval(S.timer); S.timer = null; }

async function recordAnswers(list) {
  const args = [];
  for (const { id, ok, sel } of list) {
    const p = S.progress[id] || { n: 0, w: 0 };
    // 重新作答後清除「手動移出」標記；sel 記錄這次選的答案（未作答為 -1）
    const np = { n: p.n + 1, w: p.w + (ok ? 0 : 1), last: ok, t: Date.now(), sel: sel ?? -1 };
    S.progress[id] = np;
    args.push(new FieldPath("progress", id), np);
  }
  if (!args.length) return;
  try { await updateDoc(doc(db, "users", S.user.uid), ...args); }
  catch (e) { console.error(e); toast("作答紀錄儲存失敗：" + errMsg(e)); }
}

function finishQuiz() {
  const Q = S.quiz;
  if (!Q || Q.done) return;
  Q.done = true; stopTimer();
  const idx = Q.qs.map((_, i) => i).filter((i) => Q.mode === "exam" || Q.revealed[i]);
  const items = idx.map((i) => ({ n: i + 1, q: Q.qs[i], sel: Q.answers[i], ok: Q.answers[i] === Q.qs[i].answer }));
  if (Q.mode === "exam") recordAnswers(items.map((x) => ({ id: x.q.id, ok: x.ok, sel: x.sel })));
  const correct = items.filter((x) => x.ok).length;

  $("result-title").textContent = Q.kind === "review" ? "錯題複習結果" : Q.kind === "starred" ? "星號題目練習結果" : "成績";
  const note = $("result-note");
  note.hidden = Q.kind !== "review";
  if (Q.kind === "review") {
    const left = S.bank.filter((q) => isWrong(S.progress[q.id])).length;
    note.textContent = `這次答對的 ${correct} 題已移出錯題本，錯題本還有 ${left} 題。`;
  }

  $("result-score").innerHTML = `${correct} / ${items.length}　<span class="muted">${pct(correct, items.length)}</span>`;
  const per = {};
  for (const x of items) {
    const c = per[x.q.category] || (per[x.q.category] = { t: 0, c: 0 });
    c.t++; if (x.ok) c.c++;
  }
  $("result-cats").innerHTML = `<tr><th>範圍</th><th class="num">答對</th><th class="num">答對率</th></tr>` +
    Object.entries(per).map(([k, c]) => `<tr><td>${esc(CATS[k] || k)}</td><td class="num">${c.c}/${c.t}</td><td class="num">${pct(c.c, c.t)}</td></tr>`).join("");

  const sorted = [...items.filter((x) => !x.ok), ...items.filter((x) => x.ok)];
  $("result-list").innerHTML = sorted.map((x) => {
    const opts = x.q.options.map((o, k) =>
      `<div class="ropt ${k === x.q.answer ? "correct" : k === x.sel ? "wrong" : ""}"><b>${LETTERS[k]}.</b> ${fmt(o)}${k === x.sel ? "　← 你的答案" : ""}</div>`
    ).join("");
    return `<details class="rq ${x.ok ? "ok" : "bad"}"><summary>${starBtn(x.q.id)}${x.ok ? "✓" : "✗"} 第 ${x.n} 題　${shortStem(x.q, 40)}${x.sel == null ? "（未作答）" : ""}</summary>
      <p>${fmt(x.q.stem)}</p>${opts}<div class="feedback">${feedbackHTML(x.q, x.sel)}</div>
      <div class="row"><button class="link" data-grp="${esc(x.q.id)}">★ 分類到群組</button></div></details>`;
  }).join("") || `<p class="muted">沒有作答的題目</p>`;

  addDoc(collection(db, "users", S.user.uid, "exams"), {
    ts: Date.now(), mode: Q.mode, total: items.length, correct,
    sec: Math.round((Date.now() - Q.start) / 1000)
  }).catch(console.error);
  show("result");
}

/* ---------- 管理：邀請 ---------- */
function renderAdmin() {
  $("adm-count").textContent = S.bank.length;
  if (!$("adm-cat").options.length) $("adm-cat").innerHTML = catOptionsHTML(true);
  renderInvites(); renderUserStats(); renderQList(); renderSnapshots(); show("admin");
}

/* ---------- 管理：使用者作答情形 ---------- */
let usersCache = [];
function userSummary(d) {
  const prog = d.progress || {};
  const bankIds = new Set(S.bank.map((q) => q.id));
  let ans = 0, cor = 0, wrong = 0, total = 0, last = 0;
  for (const [id, p] of Object.entries(prog)) {
    if (!bankIds.has(id)) continue;
    ans++; total += p.n || 0;
    if (p.last) cor++;
    if (isWrong(p)) wrong++;
    if ((p.t || 0) > last) last = p.t;
  }
  return { ans, cor, wrong, total, last, stars: Object.keys(d.starred || {}).length };
}
async function renderUserStats() {
  const t = $("us-list");
  t.innerHTML = `<tr><td class="muted">載入中…</td></tr>`;
  try {
    const snap = await getDocs(collection(db, "users"));
    usersCache = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).map((u) => ({ ...u, sum: userSummary(u) }));
    const key = $("us-sort").value;
    usersCache.sort((a, b) => key === "email" ? String(a.email).localeCompare(String(b.email))
      : key === "ans" ? b.sum.ans - a.sum.ans
      : key === "rate" ? (b.sum.ans ? b.sum.cor / b.sum.ans : -1) - (a.sum.ans ? a.sum.cor / a.sum.ans : -1)
      : b.sum.last - a.sum.last);
    $("us-count").textContent = `共 ${usersCache.length} 位使用者`;
    t.innerHTML = `<tr><th>使用者</th><th class="num">已做</th><th class="num">答對率</th><th class="num">錯題</th><th class="num">最近作答</th></tr>` +
      (usersCache.map((u) =>
        `<tr class="clickable" data-uid="${esc(u.uid)}"><td>${esc(u.email || u.uid)}</td><td class="num">${u.sum.ans}</td>
         <td class="num">${pct(u.sum.cor, u.sum.ans)}</td><td class="num">${u.sum.wrong}</td>
         <td class="num small">${u.sum.last ? fmtTime(u.sum.last) : "—"}</td></tr>`
      ).join("") || `<tr><td colspan="5" class="muted">還沒有使用者登入過。</td></tr>`);
  } catch (e) {
    t.innerHTML = `<tr><td class="err">讀取失敗：${esc(errMsg(e))}（請確認 Firestore 規則已更新為 v1.5.0 版）</td></tr>`;
  }
}
async function openUserDetail(uid) {
  const u = usersCache.find((x) => x.uid === uid);
  if (!u) return;
  const prog = u.progress || {};
  const per = {};
  for (const k of Object.keys(CATS)) per[k] = { total: 0, ans: 0, cor: 0, wrong: 0 };
  for (const q of S.bank) {
    const c = per[q.category] || (per[q.category] = { total: 0, ans: 0, cor: 0, wrong: 0 });
    c.total++;
    const p = prog[q.id];
    if (p) { c.ans++; if (p.last) c.cor++; }
    if (isWrong(p)) c.wrong++;
  }
  const s = u.sum;
  const wrongQs = S.bank.filter((q) => isWrong(prog[q.id]))
    .sort((a, b) => (prog[b.id].w - prog[a.id].w) || (prog[b.id].t - prog[a.id].t));
  $("ud-title").textContent = u.email || u.uid;
  $("ud-body").innerHTML =
    `<div class="stats">${[["已做題數", s.ans], ["最近一次答對率", pct(s.cor, s.ans)], ["待複習錯題", s.wrong], ["星號題目", s.stars]]
      .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
     <p class="muted small">累計作答 ${s.total} 次・最近作答 ${s.last ? fmtTime(s.last) : "—"}・最近登入 ${u.lastLogin?.toMillis ? fmtTime(u.lastLogin.toMillis()) : "—"}</p>
     <h3>各科</h3>
     <table class="tbl"><tr><th>範圍</th><th class="num">已做/題數</th><th class="num">答對率</th><th class="num">錯題</th></tr>
     ${Object.entries(per).filter(([, c]) => c.total).map(([k, c]) =>
       `<tr><td>${esc(CATS[k] || k)}</td><td class="num">${c.ans}/${c.total}</td><td class="num">${pct(c.cor, c.ans)}</td><td class="num">${c.wrong}</td></tr>`).join("")}</table>
     <h3>最近紀錄</h3><ul class="list" id="ud-exams"><li class="muted">載入中…</li></ul>
     <h3>錯題（${wrongQs.length} 題，答錯次數多的在前）</h3>
     ${wrongQs.slice(0, 100).map((q) => {
       const p = prog[q.id];
       return `<details class="rq bad"><summary><span class="tag">${esc(CATS[q.category] || q.category)}</span> ${shortStem(q, 40)}<br>
         <span class="muted small">${esc(q.id)}・答錯 ${p.w} 次／作答 ${p.n} 次・上次選 ${p.sel >= 0 ? LETTERS[p.sel] : "未作答"}，正解 ${LETTERS[q.answer]}</span></summary>
         <p>${fmt(q.stem)}</p>${q.options.map((o, k) => `<div class="ropt ${k === q.answer ? "correct" : k === p.sel ? "wrong" : ""}"><b>${LETTERS[k]}.</b> ${fmt(o)}</div>`).join("")}</details>`;
     }).join("") || `<p class="muted">沒有錯題。</p>`}
     ${wrongQs.length > 100 ? `<p class="muted small">只顯示前 100 題</p>` : ""}`;
  $("dlg-user").showModal();
  try {
    const ex = await getDocs(query(collection(db, "users", uid, "exams"), orderBy("ts", "desc"), limit(10)));
    $("ud-exams").innerHTML = ex.empty ? `<li class="muted">還沒有紀錄</li>` : ex.docs.map((d) => {
      const x = d.data();
      return `<li>${fmtTime(x.ts)}　${x.mode === "exam" ? "模擬考" : "練習"}　${x.correct}/${x.total}（${pct(x.correct, x.total)}）${x.sec ? `　${Math.round(x.sec / 60)} 分鐘` : ""}</li>`;
    }).join("");
  } catch (e) { $("ud-exams").innerHTML = `<li class="err">讀取失敗：${esc(errMsg(e))}</li>`; }
}
$("us-list").onclick = (e) => {
  const r = e.target.closest("[data-uid]");
  if (r) openUserDetail(r.dataset.uid);
};
$("us-sort").onchange = renderUserStats;
$("us-refresh").onclick = renderUserStats;
$("ud-close").onclick = () => $("dlg-user").close();
async function renderInvites() {
  const t = $("inv-list");
  try {
    const snap = await getDocs(collection(db, "allowlist"));
    const me = S.user.email.toLowerCase();
    t.innerHTML = `<tr><th>Email</th><th>身分</th><th></th></tr>` + snap.docs.map((d) =>
      `<tr><td>${esc(d.id)}</td><td>${d.data().role === "admin" ? "管理員" : "使用者"}</td>
       <td class="num">${d.id === me ? "（你）" : `<button class="link danger-link" data-del="${esc(d.id)}">移除</button>`}</td></tr>`
    ).join("");
  } catch (e) { t.innerHTML = `<tr><td class="err">讀取失敗：${esc(errMsg(e))}</td></tr>`; }
}
$("inv-add").onclick = async () => {
  const emails = [...new Set($("inv-emails").value.split(/[\s,;，]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return;
  const bad = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) { toast("格式不正確：" + bad.join(", "), 4000); return; }
  const role = $("inv-role").value;
  try {
    const b = writeBatch(db);
    for (const e of emails) b.set(doc(db, "allowlist", e), { role, invitedAt: serverTimestamp(), invitedBy: S.user.email });
    await b.commit();
    $("inv-emails").value = "";
    toast(`已加入 ${emails.length} 位`);
    renderInvites();
  } catch (e) { toast("失敗：" + errMsg(e), 4000); }
};
$("inv-list").onclick = async (e) => {
  const b = e.target.closest("[data-del]");
  if (!b || !confirm(`移除 ${b.dataset.del} 的使用權？（對方將無法再讀取題庫）`)) return;
  try { await deleteDoc(doc(db, "allowlist", b.dataset.del)); renderInvites(); }
  catch (err) { toast("失敗：" + errMsg(err)); }
};
$("inv-copy").onclick = async () => {
  const url = location.origin + location.pathname;
  const text = `你已受邀使用 ENT 專科考試練習網站：\n${url}\n\n請點「受邀新用戶？註冊帳號」，用收到這則訊息的 Email 註冊，並到信箱完成 Email 驗證後即可登入。`;
  try { await navigator.clipboard.writeText(text); toast("已複製邀請訊息"); }
  catch { prompt("請手動複製：", text); }
};

/* ---------- 管理：題庫備份與還原 ---------- */
async function createSnapshot(note) {
  const id = String(Date.now());
  const chunks = [];
  for (let i = 0; i < S.bank.length; i += SNAP_CHUNK) chunks.push(S.bank.slice(i, i + SNAP_CHUNK));
  for (let i = 0; i < chunks.length; i += 400) {
    const b = writeBatch(db);
    chunks.slice(i, i + 400).forEach((c, j) => b.set(doc(db, "bankSnapshots", id, "chunks", String(i + j)), { qs: c }));
    await b.commit();
  }
  // 分塊寫完才寫索引文件，確保列出來的備份都是完整的
  await setDoc(doc(db, "bankSnapshots", id), {
    createdAt: Date.now(), note, count: S.bank.length, chunks: chunks.length, by: S.user.email
  });
  pruneSnapshots().catch(console.error);
  return id;
}
async function listSnapshots() {
  const snap = await getDocs(query(collection(db, "bankSnapshots"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function deleteSnapshot(id) {
  const ch = await getDocs(collection(db, "bankSnapshots", id, "chunks"));
  const b = writeBatch(db);
  ch.docs.forEach((d) => b.delete(d.ref));
  b.delete(doc(db, "bankSnapshots", id));
  await b.commit();
}
async function pruneSnapshots() {
  const all = await listSnapshots();
  for (const s of all.slice(SNAP_KEEP)) await deleteSnapshot(s.id);
}
async function renderSnapshots() {
  const t = $("snap-list");
  try {
    const all = await listSnapshots();
    t.innerHTML = `<tr><th>備份時間</th><th>說明</th><th class="num">題數</th><th></th></tr>` + (all.map((s) =>
      `<tr><td>${fmtTime(s.createdAt)}</td><td>${esc(s.note)}<br><span class="muted small">${esc(s.by || "")}</span></td><td class="num">${s.count}</td>
       <td class="num"><button class="link" data-restore="${s.id}">還原</button></td></tr>`
    ).join("") || `<tr><td colspan="4" class="muted">還沒有備份，第一次匯入或編輯題目時會自動建立。</td></tr>`);
  } catch (e) { t.innerHTML = `<tr><td class="err">讀取失敗：${esc(errMsg(e))}（請確認已更新 Firestore 規則）</td></tr>`; }
}
async function restoreSnapshot(id) {
  const meta = await getDoc(doc(db, "bankSnapshots", id));
  if (!meta.exists()) { toast("找不到這份備份"); return; }
  const m = meta.data();
  if (!confirm(`確定把題庫還原到 ${fmtTime(m.createdAt)} 的版本（${m.count} 題）？\n目前的題庫會先自動備份，之後仍可以還原回來。`)) return;
  toast("還原中…", 10000);
  const ch = await getDocs(collection(db, "bankSnapshots", id, "chunks"));
  const qs = ch.docs.sort((a, b) => +a.id - +b.id).flatMap((d) => d.data().qs || []);
  if (qs.length !== m.count) { toast("備份資料不完整，已取消還原", 5000); return; }
  await createSnapshot(`還原前自動備份（還原到 ${fmtTime(m.createdAt)}）`);
  const keep = new Set(qs.map((q) => q.id));
  const ops = [
    ...S.bank.filter((q) => !keep.has(q.id)).map((q) => (b) => b.delete(doc(db, "questions", q.id))),
    ...qs.map((q) => (b) => b.set(doc(db, "questions", q.id), q))
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
  S.bank = qs.sort((a, b) => a.id.localeCompare(b.id));
  await bumpVersion();
  toast(`已還原到 ${fmtTime(m.createdAt)} 的版本`);
  renderAdmin();
}
$("snap-list").onclick = async (e) => {
  const b = e.target.closest("[data-restore]");
  if (!b) return;
  try { await restoreSnapshot(b.dataset.restore); } catch (err) { toast("還原失敗：" + errMsg(err), 5000); }
};
$("snap-manual").onclick = async () => {
  const note = prompt("備份說明（例如：第二批審題完成）", "手動備份");
  if (note === null) return;
  try { await createSnapshot(note || "手動備份"); toast("已建立備份"); renderSnapshots(); }
  catch (e) { toast("備份失敗：" + errMsg(e), 5000); }
};

/* ---------- 管理：題庫 ---------- */
function normQ(q) {
  if (!q || typeof q !== "object") return q;
  let answer = q.answer;
  if (typeof answer === "string") {
    answer = /^\d+$/.test(answer) ? +answer : LETTERS.indexOf(answer.trim().toUpperCase());
  }
  return {
    id: String(q.id ?? "").trim(),
    category: String(q.category ?? "").trim(),
    chapter: q.chapter ? String(q.chapter) : "",
    source: q.source ? String(q.source) : "",
    stem: String(q.stem ?? "").trim(),
    options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : q.options,
    answer,
    explanation: q.explanation ? String(q.explanation) : "",
    refs: Array.isArray(q.refs) ? q.refs.map((r) => String(r).trim()).filter(Boolean) : [],
    loc: Array.isArray(q.loc) ? q.loc.map((r) => String(r).trim()).filter(Boolean) : [],
    difficulty: [1, 2, 3].includes(+q.difficulty) ? +q.difficulty : 2,
    tags: Array.isArray(q.tags) ? q.tags.map(String) : [],
    reviewed: !!q.reviewed
  };
}
function validateQ(q) {
  if (!q || typeof q !== "object") return "不是物件";
  if (!/^[A-Za-z0-9_-]+$/.test(q.id)) return "id 只能用英數字、- 或 _";
  if (!CATS[q.category]) return `category 必須是：${Object.keys(CATS).join(", ")}`;
  if (!q.stem) return "缺少題幹 stem";
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) return "options 需要 2–6 個選項";
  if (q.options.some((o) => !o)) return "有空白選項";
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return "answer 超出選項範圍";
  return null;
}
const impMsg = (m) => ($("imp-msg").textContent = m);

// 選擇的檔案內容（可多個）；大檔不放進文字框，避免手機卡住
let impFiles = null;
$("imp-file").onchange = async (e) => {
  const files = [...e.target.files];
  impFiles = null;
  if (!files.length) return;
  try {
    impFiles = [];
    for (const f of files) {
      let d = JSON.parse(await f.text());
      if (!Array.isArray(d)) d = d?.questions;
      if (!Array.isArray(d)) throw new Error(`${f.name} 找不到題目陣列`);
      impFiles.push(...d);
    }
    $("imp-text").value = "";
    impMsg(`已讀取 ${files.length} 個檔案，共 ${impFiles.length} 題。按「匯入」開始。`);
  } catch (err) { impFiles = null; impMsg("檔案讀取失敗：" + err.message); }
};
$("imp-text").oninput = () => { if ($("imp-text").value.trim()) { impFiles = null; $("imp-file").value = ""; } };
$("imp-go").onclick = async () => {
  let data = impFiles;
  if (!data) {
    try { data = JSON.parse($("imp-text").value); } catch (e) { impMsg("JSON 格式錯誤：" + e.message); return; }
    if (!Array.isArray(data)) data = data?.questions;
  }
  if (!Array.isArray(data) || !data.length) { impMsg("找不到題目陣列"); return; }
  const qs = data.map(normQ), errs = [], seen = new Set();
  qs.forEach((q, i) => {
    const r = validateQ(q);
    if (r) errs.push(`第 ${i + 1} 題（${q?.id || "無 id"}）：${r}`);
    else if (seen.has(q.id)) errs.push(`第 ${i + 1} 題：id ${q.id} 在檔案中重複`);
    seen.add(q?.id);
  });
  if (errs.length) { impMsg(errs.slice(0, 30).join("\n") + (errs.length > 30 ? `\n…共 ${errs.length} 個錯誤` : "")); return; }
  const existing = new Set(S.bank.map((q) => q.id));
  const dup = qs.filter((q) => existing.has(q.id)).length;
  const replace = $("imp-replace").checked;
  const removeIds = replace ? S.bank.map((q) => q.id).filter((id) => !seen.has(id)) : [];
  const ask = `將匯入 ${qs.length} 題（其中 ${dup} 題 id 已存在，會被更新）。` +
    (replace ? `\n取代模式：會刪除目前題庫中不在檔案裡的 ${removeIds.length} 題${removeIds.length ? `（例如 ${removeIds.slice(0, 3).join("、")}${removeIds.length > 3 ? "…" : ""}）` : ""}。` : "") +
    `\n匯入前會自動備份。繼續？`;
  if (!confirm(ask)) return;
  try {
    $("imp-go").disabled = true;
    impMsg("備份目前題庫中…");
    await createSnapshot(`匯入前自動備份（匯入 ${qs.length} 題：新增 ${qs.length - dup}、更新 ${dup}${replace ? `、刪除 ${removeIds.length}` : ""}）`);
    for (let i = 0; i < qs.length; i += 400) {
      const b = writeBatch(db);
      qs.slice(i, i + 400).forEach((q) => b.set(doc(db, "questions", q.id), q));
      await b.commit();
      impMsg(`匯入中… ${Math.min(i + 400, qs.length)} / ${qs.length}`);
    }
    for (let i = 0; i < removeIds.length; i += 400) {
      const b = writeBatch(db);
      removeIds.slice(i, i + 400).forEach((id) => b.delete(doc(db, "questions", id)));
      await b.commit();
    }
    const map = replace ? new Map() : new Map(S.bank.map((q) => [q.id, q]));
    qs.forEach((q) => map.set(q.id, q));
    S.bank = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
    await bumpVersion();
    impMsg(`完成：新增 ${qs.length - dup} 題、更新 ${dup} 題${replace ? `、刪除 ${removeIds.length} 題` : ""}，目前共 ${S.bank.length} 題。匯入前的題庫已備份，可在「題庫版本紀錄」還原。`);
    renderSnapshots();
    $("imp-text").value = ""; $("imp-file").value = ""; impFiles = null; $("imp-replace").checked = false;
    $("adm-count").textContent = S.bank.length;
    renderQList();
  } catch (e) { impMsg("匯入失敗：" + errMsg(e)); }
  finally { $("imp-go").disabled = false; }
};
$("adm-export").onclick = () => {
  const blob = new Blob([JSON.stringify(S.bank, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `ent-questions-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

function renderQList() {
  const cat = $("adm-cat").value || "all";
  const s = $("adm-search").value.trim().toLowerCase();
  const all = S.bank.filter((q) => (cat === "all" || q.category === cat) &&
    (!s || `${q.id} ${q.stem} ${q.source} ${q.chapter}`.toLowerCase().includes(s)));
  const list = all.slice(0, 50);
  $("adm-qlist").innerHTML = list.map((q) => `
    <div class="qitem">
      <div class="small muted">${esc(q.id)} · ${esc(CATS[q.category] || q.category)} · ${q.reviewed ? "已審" : "未審"}${q.source ? " · " + esc(q.source) : ""}</div>
      <div>${esc(q.stem.slice(0, 90))}${q.stem.length > 90 ? "…" : ""}</div>
      <div class="row"><button class="link" data-edit="${esc(q.id)}">編輯</button><button class="link danger-link" data-qdel="${esc(q.id)}">刪除</button></div>
    </div>`).join("") + `<p class="muted small">顯示 ${list.length} / ${all.length} 題${all.length > 50 ? "（請用搜尋縮小範圍）" : ""}</p>`;
}
$("adm-cat").onchange = renderQList;
$("adm-search").oninput = renderQList;
$("adm-qlist").onclick = async (e) => {
  const ed = e.target.closest("[data-edit]");
  if (ed) { openEditor(S.bank.find((q) => q.id === ed.dataset.edit)); return; }
  const del = e.target.closest("[data-qdel]");
  if (del && confirm(`刪除題目 ${del.dataset.qdel}？`)) {
    try {
      await createSnapshot(`刪除 ${del.dataset.qdel} 前自動備份`);
      await deleteDoc(doc(db, "questions", del.dataset.qdel));
      S.bank = S.bank.filter((q) => q.id !== del.dataset.qdel);
      await bumpVersion();
      $("adm-count").textContent = S.bank.length;
      renderQList(); renderSnapshots(); toast("已刪除");
    } catch (err) { toast("失敗：" + errMsg(err)); }
  }
};

/* ---------- 單題編輯器 ---------- */
let editing = null;
function openEditor(q) {
  editing = q || null;
  $("edit-title").textContent = q ? "編輯題目" : "新增題目";
  $("ed-category").innerHTML = catOptionsHTML(false);
  $("ed-answer").innerHTML = [...LETTERS].map((l, i) => `<option value="${i}">${l}</option>`).join("");
  $("ed-id").value = q?.id || "";
  $("ed-id").readOnly = !!q;
  $("ed-category").value = q?.category || "otology";
  $("ed-difficulty").value = String(q?.difficulty || 2);
  $("ed-chapter").value = q?.chapter || "";
  $("ed-source").value = q?.source || "";
  $("ed-stem").value = q?.stem || "";
  $("ed-options").value = (q?.options || []).join("\n");
  $("ed-answer").value = String(q?.answer ?? 0);
  $("ed-explanation").value = q?.explanation || "";
  $("ed-refs").value = (q?.refs || []).join("\n");
  $("ed-loc").value = (q?.loc || []).join("\n");
  $("ed-reviewed").checked = !!q?.reviewed;
  $("ed-err").textContent = "";
  $("dlg-edit").showModal();
}
$("adm-new").onclick = () => openEditor(null);
$("ed-cancel").onclick = () => $("dlg-edit").close();
$("ed-save").onclick = async () => {
  const q = normQ({
    id: $("ed-id").value, category: $("ed-category").value, difficulty: $("ed-difficulty").value,
    chapter: $("ed-chapter").value, source: $("ed-source").value, stem: $("ed-stem").value,
    options: $("ed-options").value.split("\n").map((s) => s.trim()).filter(Boolean),
    answer: +$("ed-answer").value, explanation: $("ed-explanation").value,
    refs: $("ed-refs").value.split("\n"),
    loc: $("ed-loc").value.split("\n"),
    reviewed: $("ed-reviewed").checked, tags: editing?.tags || []
  });
  const r = validateQ(q);
  if (r) { $("ed-err").textContent = r; return; }
  if (!editing && S.bank.some((x) => x.id === q.id)) { $("ed-err").textContent = "這個 id 已經存在"; return; }
  try {
    await createSnapshot(`${editing ? "編輯" : "新增"} ${q.id} 前自動備份`);
    await setDoc(doc(db, "questions", q.id), q);
    const i = S.bank.findIndex((x) => x.id === q.id);
    if (i >= 0) S.bank[i] = q; else S.bank.push(q);
    S.bank.sort((a, b) => a.id.localeCompare(b.id));
    await bumpVersion();
    $("dlg-edit").close();
    $("adm-count").textContent = S.bank.length;
    renderQList(); renderSnapshots(); toast("已儲存");
  } catch (e) { $("ed-err").textContent = "儲存失敗：" + errMsg(e); }
};
