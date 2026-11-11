import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, orderBy, limit, writeBatch, serverTimestamp, FieldPath
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
const LETTERS = "ABCDEF";
const BANK_KEY = "ent-bank-v1";
const SEC_PER_Q = 60; // 模擬考每題秒數

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- 狀態 ---------- */
const S = { user: null, admin: false, bank: [], progress: {}, quiz: null, timer: null, registering: false };

/* ---------- 小工具 ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => esc(s).replace(/\n/g, "<br>");
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "—");
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
  if (!u) { $("nav").hidden = true; show("auth"); return; }
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
    S.progress = snap.data()?.progress || {};
    await loadBank();
    $("nav").hidden = false;
    $("nav-admin").hidden = !S.admin;
    renderHome(); show("home");
  } catch (e) {
    console.error(e);
    $("auth-err").textContent = "載入失敗：" + errMsg(e);
    $("nav").hidden = true; show("auth");
  }
}
onAuthStateChanged(auth, handleUser);

/* ---------- 題庫載入（有版本快取，避免每次都重抓） ---------- */
function readCache() { try { return JSON.parse(localStorage.getItem(BANK_KEY)); } catch { return null; } }
function writeCache(version) {
  try { localStorage.setItem(BANK_KEY, JSON.stringify({ version, questions: S.bank })); } catch {}
}
async function loadBank(force = false) {
  const meta = await getDoc(doc(db, "meta", "bank"));
  const version = meta.exists() ? meta.data().version || 0 : 0;
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
  writeCache(version);
}

/* ---------- 導覽 ---------- */
function go(name) {
  stopTimer();
  if (name === "home") { S.quiz = null; renderHome(); show("home"); }
  if (name === "admin" && S.admin) { S.quiz = null; renderAdmin(); }
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (!g) return;
  if (S.quiz && !S.quiz.done && !confirm("離開會放棄這次作答，確定嗎？")) return;
  go(g.dataset.go);
});

/* ---------- 首頁 ---------- */
function catOptionsHTML(withAll) {
  return (withAll ? `<option value="all">全部範圍</option>` : "") +
    Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
}
function renderHome() {
  const per = {};
  for (const k of Object.keys(CATS)) per[k] = { total: 0, ans: 0, cor: 0 };
  let ans = 0, cor = 0, wrong = 0;
  for (const q of S.bank) {
    const c = per[q.category] || (per[q.category] = { total: 0, ans: 0, cor: 0 });
    c.total++;
    const p = S.progress[q.id];
    if (p) { c.ans++; ans++; if (p.last) { c.cor++; cor++; } else wrong++; }
  }
  $("stats-summary").innerHTML = [
    ["題庫總數", S.bank.length], ["已做過", ans], ["最近一次答對率", pct(cor, ans)], ["待複習錯題", wrong]
  ].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("stats-table").innerHTML =
    `<tr><th>範圍</th><th class="num">題數</th><th class="num">已做</th><th class="num">答對率</th></tr>` +
    Object.entries(per).map(([k, c]) =>
      `<tr><td>${esc(CATS[k] || k)}</td><td class="num">${c.total}</td><td class="num">${c.ans}</td><td class="num">${pct(c.cor, c.ans)}</td></tr>`
    ).join("");

  // 範圍選擇（保留原本勾選）
  const box = $("cat-boxes");
  const prev = new Set([...box.querySelectorAll("input:checked")].map((i) => i.value));
  const first = !box.children.length;
  box.innerHTML = Object.entries(CATS).map(([k, v]) =>
    `<label><input type="checkbox" value="${k}" ${first || prev.has(k) ? "checked" : ""}> ${v} <span class="muted">${per[k].total}</span></label>`
  ).join("");
  updatePoolInfo();
  renderRecent();
}
function buildPool() {
  const cats = [...document.querySelectorAll("#cat-boxes input:checked")].map((i) => i.value);
  const f = $("setup-filter").value;
  return S.bank.filter((q) => {
    if (!cats.includes(q.category)) return false;
    const p = S.progress[q.id];
    if (f === "new") return !p;
    if (f === "wrong") return p && !p.last;
    return true;
  });
}
function updatePoolInfo() { $("pool-info").textContent = `符合條件的題目：${buildPool().length} 題`; }
$("cat-boxes").onchange = updatePoolInfo;
$("setup-filter").onchange = updatePoolInfo;
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
  startQuiz(shuffle(pool.slice()).slice(0, n), mode);
};

function startQuiz(qs, mode) {
  S.quiz = {
    qs, mode, i: 0, done: false, start: Date.now(),
    answers: Array(qs.length).fill(null),
    revealed: Array(qs.length).fill(false)
  };
  $("quiz-timer").textContent = "";
  $("quiz-grid").hidden = mode !== "exam";
  $("quiz-finish").hidden = mode !== "exam";
  if (mode === "exam") { S.quiz.deadline = Date.now() + qs.length * SEC_PER_Q * 1000; startTimer(); }
  renderQ(); show("quiz");
}

function feedbackHTML(q, sel) {
  const ok = sel === q.answer;
  return `<div class="verdict ${ok ? "ok" : "bad"}">${ok ? "答對了" : `答錯了，正解是 ${LETTERS[q.answer]}`}</div>` +
    `<div class="expl">${fmt(q.explanation || "（尚無詳解）")}</div>` +
    (q.source ? `<div class="src">出處：${esc(q.source)}</div>` : "") +
    (q.reviewed ? "" : `<div class="src">⚠ 本題尚未經審題，如有疑問請回報管理員</div>`);
}

function renderQ() {
  const Q = S.quiz, q = Q.qs[Q.i], sel = Q.answers[Q.i];
  const rev = Q.mode === "practice" && Q.revealed[Q.i];
  const last = Q.i === Q.qs.length - 1;
  $("quiz-pos").textContent = `第 ${Q.i + 1} / ${Q.qs.length} 題`;
  $("quiz-cat").textContent = CATS[q.category] || q.category;
  $("quiz-stem").innerHTML = fmt(q.stem);
  $("quiz-options").innerHTML = q.options.map((o, k) => {
    let cls = "opt";
    if (sel === k) cls += " selected";
    if (rev) { if (k === q.answer) cls += " correct"; else if (k === sel) cls += " wrong"; }
    return `<button class="${cls}" data-k="${k}" ${rev ? "disabled" : ""}><b>${LETTERS[k]}.</b><span>${fmt(o)}</span></button>`;
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
  recordAnswers([{ id: q.id, ok: Q.answers[Q.i] === q.answer }]);
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
  for (const { id, ok } of list) {
    const p = S.progress[id] || { n: 0, w: 0 };
    const np = { n: p.n + 1, w: p.w + (ok ? 0 : 1), last: ok, t: Date.now() };
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
  if (Q.mode === "exam") recordAnswers(items.map((x) => ({ id: x.q.id, ok: x.ok })));
  const correct = items.filter((x) => x.ok).length;

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
    const head = esc(x.q.stem.replace(/\s+/g, " ").slice(0, 40)) + (x.q.stem.length > 40 ? "…" : "");
    return `<details class="rq ${x.ok ? "ok" : "bad"}"><summary>${x.ok ? "✓" : "✗"} 第 ${x.n} 題　${head}${x.sel == null ? "（未作答）" : ""}</summary>
      <p>${fmt(x.q.stem)}</p>${opts}<div class="feedback">${feedbackHTML(x.q, x.sel)}</div></details>`;
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
  renderInvites(); renderQList(); show("admin");
}
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

$("imp-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (f) $("imp-text").value = await f.text();
};
$("imp-go").onclick = async () => {
  let data;
  try { data = JSON.parse($("imp-text").value); } catch (e) { impMsg("JSON 格式錯誤：" + e.message); return; }
  if (!Array.isArray(data)) data = data?.questions;
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
  if (!confirm(`將匯入 ${qs.length} 題（其中 ${dup} 題 id 已存在，會被更新）。繼續？`)) return;
  try {
    $("imp-go").disabled = true;
    for (let i = 0; i < qs.length; i += 400) {
      const b = writeBatch(db);
      qs.slice(i, i + 400).forEach((q) => b.set(doc(db, "questions", q.id), q));
      await b.commit();
      impMsg(`匯入中… ${Math.min(i + 400, qs.length)} / ${qs.length}`);
    }
    const map = new Map(S.bank.map((q) => [q.id, q]));
    qs.forEach((q) => map.set(q.id, q));
    S.bank = [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
    await bumpVersion();
    impMsg(`完成：新增 ${qs.length - dup} 題、更新 ${dup} 題。`);
    $("imp-text").value = ""; $("imp-file").value = "";
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
      await deleteDoc(doc(db, "questions", del.dataset.qdel));
      S.bank = S.bank.filter((q) => q.id !== del.dataset.qdel);
      await bumpVersion();
      $("adm-count").textContent = S.bank.length;
      renderQList(); toast("已刪除");
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
    reviewed: $("ed-reviewed").checked, tags: editing?.tags || []
  });
  const r = validateQ(q);
  if (r) { $("ed-err").textContent = r; return; }
  if (!editing && S.bank.some((x) => x.id === q.id)) { $("ed-err").textContent = "這個 id 已經存在"; return; }
  try {
    await setDoc(doc(db, "questions", q.id), q);
    const i = S.bank.findIndex((x) => x.id === q.id);
    if (i >= 0) S.bank[i] = q; else S.bank.push(q);
    S.bank.sort((a, b) => a.id.localeCompare(b.id));
    await bumpVersion();
    $("dlg-edit").close();
    $("adm-count").textContent = S.bank.length;
    renderQList(); toast("已儲存");
  } catch (e) { $("ed-err").textContent = "儲存失敗：" + errMsg(e); }
};
