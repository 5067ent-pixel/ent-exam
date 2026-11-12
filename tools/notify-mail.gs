/**
 * ENT 專科練習：版本更新通知「一鍵寄出」
 *
 * 放在寄件 Gmail 帳號（5067ent@gmail.com）的 Google Apps Script，部署成網頁應用程式。
 * 網站管理頁按「一鍵寄出」時，會把登入中的管理員身分（Firebase ID token）、主旨與內容送來；
 * 這支程式會：
 *   1. 用管理員的身分讀 Firestore 的 allowlist/{自己的 email}，確認 role 是 admin（不是管理員就拒絕）
 *   2. 用同一個身分列出整份邀請名單，當作收件人（收件人不由網頁指定，別人無法拿來亂寄）
 *   3. 用這個 Gmail 帳號寄出，所有會員放密件副本（BCC）
 * 不需要任何密碼或金鑰；權限完全沿用 Firestore 安全規則。
 */
const PROJECT_ID = "ent-resident";   // Firebase 專案 ID
const SENDER_NAME = "ENT 專科練習";   // 收件人看到的寄件者名稱
const SUBJECT_PREFIX = "ENT 專科練習網站更新";

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || "{}");
    if (!d.idToken) return out({ ok: false, error: "缺少登入資訊" });
    if (!String(d.subject || "").startsWith(SUBJECT_PREFIX)) return out({ ok: false, error: "主旨格式不正確" });
    if (!d.body || String(d.body).length > 20000) return out({ ok: false, error: "內容不正確" });

    const base = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents/";
    const auth = { headers: { Authorization: "Bearer " + d.idToken }, muteHttpExceptions: true };

    // 1. 確認呼叫的人是管理員（ID token 由 Firestore 驗證）
    const email = String(d.email || "").toLowerCase();
    const me = UrlFetchApp.fetch(base + "allowlist/" + encodeURIComponent(email), auth);
    if (me.getResponseCode() !== 200) return out({ ok: false, error: "沒有權限（請重新登入網站）" });
    const role = (((JSON.parse(me.getContentText()).fields || {}).role) || {}).stringValue;
    if (role !== "admin") return out({ ok: false, error: "只有管理員可以寄送" });

    // 2. 收件人 = 整份邀請名單
    const emails = [];
    let token = "";
    do {
      const r = UrlFetchApp.fetch(base + "allowlist?pageSize=300" + (token ? "&pageToken=" + token : ""), auth);
      if (r.getResponseCode() !== 200) return out({ ok: false, error: "讀不到邀請名單" });
      const j = JSON.parse(r.getContentText());
      (j.documents || []).forEach(function (doc) { emails.push(doc.name.split("/").pop()); });
      token = j.nextPageToken || "";
    } while (token);
    const bcc = emails.filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (!bcc.length) return out({ ok: false, error: "邀請名單是空的" });
    if (bcc.length > MailApp.getRemainingDailyQuota()) return out({ ok: false, error: "今天的寄信額度不夠，明天再試" });

    // 3. 寄出
    const self = Session.getEffectiveUser().getEmail();
    GmailApp.sendEmail(self, d.subject, d.body, { bcc: bcc.join(","), name: SENDER_NAME });
    return out({ ok: true, sent: bcc.length, from: self, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
