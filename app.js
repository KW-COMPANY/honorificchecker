const API_ENDPOINT = "https://honorificchecker.gmo-k-watanabe.workers.dev";

const $ = (id) => document.getElementById(id);

/* =========================
例文
========================= */

const examples = {

  "short-1": "私が御社に伺わせていただきます。",

  "short-2": "社長にお伝えしてもらえますでしょうか。",

  "short-3": "資料を送付いたします。ご確認ください。",

  "bulk-1":
`お世話になっております。株式会社サンプルの田中です。
この度はご迷惑をお掛けしてしまい大変申し訳ございません。
本日中にご連絡差し上げますので、何卒よろしくお願い致します。`,

  "bulk-2":
`お世話になっております。株式会社サンプルの田中です。
来週の打ち合わせ日程について、ご都合の良い候補日を3つほど頂けますでしょうか。
よろしくお願い申し上げます。`

};

/* =========================
安全DOM
========================= */

function safeAddEvent(id, event, handler) {

  const el = $(id);

  if (el) {
    el.addEventListener(event, handler);
  }

}

function safeShow(id) {

  const el = $(id);

  if (el) {
    el.classList.remove("hidden");
  }

}

function safeHide(id) {

  const el = $(id);

  if (el) {
    el.classList.add("hidden");
  }

}

function escapeHtml(str) {

  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

/* =========================
通信
========================= */

async function fetchWithTimeout(url, options = {}, timeout = 25000) {

  const controller = new AbortController();

  const id = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {

    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(id);

    return res;

  } catch (err) {

    clearTimeout(id);

    throw err;

  }

}

async function postJson(path, body) {

  const res = await fetchWithTimeout(
    `${API_ENDPOINT}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  let data;

  try {

    data = await res.json();

  } catch {

    throw new Error("サーバー応答がJSON形式ではありません");

  }

  if (!res.ok) {

    throw new Error(
      data?.error ||
      `HTTP ${res.status}`
    );

  }

  return data;

}

/* =========================
個人情報・企業情報 検知（クライアント側・無料・通信不要）
========================= */

function clientDetectSensitive(text) {

  const checks = [
    { re: /0\d{1,4}[-(\s]?\d{1,4}[-)\s]?\d{3,4}/, label: "電話番号" },
    { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, label: "メールアドレス" },
    { re: /〒?\s?\d{3}-\d{4}/, label: "郵便番号・住所" },
    { re: /(東京都|北海道|(?:京都|大阪)府|.{2,3}県)[^\s、。]{2,}(市|区|町|村)/, label: "住所" },
    { re: /\d{4}\s?\d{4}\s?\d{4}\s?\d{4}/, label: "カード番号らしき数字" },
    { re: /(マイナンバー|個人番号)/, label: "マイナンバーらしき情報" },
    { re: /(株式会社|有限会社|合同会社|\(株\)|（株）)/, label: "企業名らしき情報" },
    { re: /[一-龥]{1,4}(様|さん|氏)(?![方々])/, label: "個人名らしき情報" }
  ];

  const labels = [];

  for (const c of checks) {
    if (c.re.test(text)) {
      if (!labels.includes(c.label)) {
        labels.push(c.label);
      }
    }
  }

  return labels;
}

function renderSensitiveAlert(targetId, labels) {

  const el = $(targetId);

  if (!el) return;

  if (!labels || !labels.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("hidden");

  el.innerHTML = `
    <div class="sensitive-inner">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <div>
        <div class="sensitive-title">個人情報・企業情報の可能性があります</div>
        <div class="sensitive-body">
          次の項目が含まれている可能性があります：
          <strong>${labels.map(escapeHtml).join(" / ")}</strong><br />
          送信・共有の前に削除またはマスキングをご検討ください。
        </div>
      </div>
    </div>
  `;

}

/* 入力中のリアルタイム検知 */

function attachSensitiveWatcher(inputId, alertId) {

  const input = $(inputId);

  if (!input) return;

  input.addEventListener("input", () => {

    const labels = clientDetectSensitive(input.value);

    renderSensitiveAlert(alertId, labels);

  });

}

/* =========================
トースト
========================= */

function toast(message, type = "success") {

  let el = document.querySelector(".toast");

  if (!el) {

    el = document.createElement("div");

    el.className = "toast";

    document.body.appendChild(el);

  }

  el.textContent = message;

  el.className = `toast show ${type}`;

  setTimeout(() => {

    el.classList.remove("show");

  }, 3000);

}

/* =========================
クリップボード（フォールバック付き・修正の核心）
navigator.clipboard が使えない環境でも動くよう旧方式を併用
========================= */

function legacyCopy(text) {

  try {

    const textarea = document.createElement("textarea");

    textarea.value = text;

    /* 画面外に配置してスクロールを動かさない */
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "");

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const ok = document.execCommand("copy");

    document.body.removeChild(textarea);

    return ok;

  } catch {

    return false;

  }

}

async function copyToClipboard(text, message) {

  const value = String(text || "");

  if (!value.trim()) {

    toast("コピーする内容がありません", "error");

    return;

  }

  /* まず標準APIを試す */
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    window.isSecureContext
  ) {

    try {

      await navigator.clipboard.writeText(value);

      toast(message);

      return;

    } catch {

      /* 失敗したら旧方式へフォールバック */

    }

  }

  /* 旧方式でのコピー */
  if (legacyCopy(value)) {

    toast(message);

  } else {

    toast("コピーに失敗しました", "error");

  }

}

/* =========================
タブ
========================= */

const tabShort = $("tabShort");
const tabBulk = $("tabBulk");

const panelShort = $("panelShort");
const panelBulk = $("panelBulk");

function setTab(which) {

  if (which === "short") {

    tabShort?.classList.add("tab-active");
    tabBulk?.classList.remove("tab-active");

    panelShort?.classList.remove("hidden");
    panelBulk?.classList.add("hidden");

  } else {

    tabBulk?.classList.add("tab-active");
    tabShort?.classList.remove("tab-active");

    panelBulk?.classList.remove("hidden");
    panelShort?.classList.add("hidden");

  }

}

safeAddEvent("tabShort", "click", () => {
  setTab("short");
});

safeAddEvent("tabBulk", "click", () => {
  setTab("bulk");
});

/* =========================
例文挿入
========================= */

document.body.addEventListener("click", (e) => {

  const btn = e.target.closest("[data-example]");

  if (!btn) return;

  const key = btn.dataset.example;

  if (!examples[key]) return;

  if (key.startsWith("short")) {

    $("shortInput").value = examples[key];

    renderSensitiveAlert(
      "shortSensitive",
      clientDetectSensitive(examples[key])
    );

    setTab("short");

  } else {

    $("bulkInput").value = examples[key];

    renderSensitiveAlert(
      "bulkSensitive",
      clientDetectSensitive(examples[key])
    );

    setTab("bulk");

  }

});

/* =========================
クリア
========================= */

safeAddEvent("btnClearShort", "click", () => {

  $("shortInput").value = "";

  safeHide("shortResult");

  renderSensitiveAlert("shortSensitive", []);

  const btn = $("btnCopyShortSuggestion");

  if (btn) {
    btn.disabled = true;
  }

});

safeAddEvent("btnClearBulk", "click", () => {

  $("bulkInput").value = "";

  $("bulkIssues").innerHTML = "";

  $("bulkCorrected").textContent = "";

  $("bulkSummary").innerHTML = "";

  const aiReasonEl = $("bulkAiReason");

  if (aiReasonEl) {
    aiReasonEl.textContent = "";
  }

  renderSensitiveAlert("bulkSensitive", []);

  const btn = $("btnCopyBulkCorrected");

  if (btn) {
    btn.disabled = true;
  }

  const btnTop = $("btnCopyBulkCorrectedTop");

  if (btnTop) {
    btnTop.disabled = true;
  }

});

/* =========================
ローディング
========================= */

function setLoading(buttonId, loadingText) {

  const btn = $(buttonId);

  if (!btn) return;

  btn.disabled = true;

  btn.innerHTML = `
    <span class="spinner"></span>
    ${loadingText}
  `;

}

function resetLoading(buttonId, defaultText) {

  const btn = $(buttonId);

  if (!btn) return;

  btn.disabled = false;

  btn.innerHTML = defaultText;

}

/* =========================
スコアUI
========================= */

function renderSummary(score) {

  if (score >= 90) {

    return `
      <div class="summary summary-good">
        🏆 非常に自然なビジネス敬語です（${score}点）
      </div>
    `;

  }

  if (score >= 70) {

    return `
      <div class="summary summary-warning">
        ⚠ 一部修正をおすすめします（${score}点）
      </div>
    `;

  }

  return `
    <div class="summary summary-bad">
      ❌ 明確な敬語誤用があります（${score}点）
    </div>
  `;

}

/* =========================
Issue UI
========================= */

function issueTypeLabel(type) {

  switch(type) {

    case "keigo":
      return "敬語";

    case "grammar":
      return "文法";

    case "typo":
      return "誤字";

    case "direction":
      return "敬語";

    default:
      return "指摘";

  }

}

/* =========================
サーバー側 sensitive 結果表示
========================= */

function renderServerSensitive(targetId, sensitive, notice) {

  const labels =
    Array.isArray(sensitive)
      ? sensitive.map(s => s.label)
      : [];

  if (labels.length) {
    renderSensitiveAlert(targetId, labels);
  }

}

/* =========================
短文チェック
========================= */

safeAddEvent("btnCheckShort", "click", async () => {

  const text = $("shortInput").value.trim();

  if (!text) {

    toast("文を入力してください", "error");

    return;

  }

  setLoading("btnCheckShort", "チェック中...");

  try {

    const industry =
      $("industrySelect")?.value || "general";

    const data = await postJson("/api/check", {
      text,
      industry
    });

    renderServerSensitive(
      "shortSensitive",
      data.sensitive,
      data.sensitive_notice
    );

    renderShortResult(data);

  } catch (err) {

    renderShortResult({
      error: err.message
    });

  } finally {

    resetLoading(
      "btnCheckShort",
      `<i class="fa-solid fa-magnifying-glass mr-2"></i>チェックする`
    );

  }

});

function renderShortResult(data) {

  const box = $("shortResult");

  safeShow("shortResult");

  if (data.error) {

    box.innerHTML = `
      <div class="result-card">
        <div class="result-title text-rose-300">
          エラー
        </div>

        <div class="mt-2">
          ${escapeHtml(data.error)}
        </div>
      </div>
    `;

    return;

  }

  /* 修正済み：
     data.ai?.suggestions → data.suggestions
  */

  const suggestions =
    Array.isArray(data.suggestions)
      ? data.suggestions
      : [];

  const reason =
    data.ai_reason ||
    "敬語表現を確認しました。";

  const issues =
    Array.isArray(data.issues)
      ? data.issues
      : [];

  const score =
    typeof data.score === "number"
      ? data.score
      : 100;

  const firstSuggestion =
    suggestions[0] || "";

  const copyBtn =
    $("btnCopyShortSuggestion");

  if (copyBtn) {

    copyBtn.disabled = !firstSuggestion;

    copyBtn.onclick = () => {

      copyToClipboard(
        firstSuggestion,
        "修正文をコピーしました"
      );

    };

  }

  box.innerHTML = `

    ${renderSummary(score)}

    <div class="result-card">

      <div class="font-semibold">
        AI分析
      </div>

      <div class="mt-2 leading-7">
        ${escapeHtml(reason)}
      </div>

      ${
        issues.length
        ?
        `
        <div class="mt-5 font-semibold">
          検出された問題
        </div>

        <div class="mt-3 space-y-2">

          ${issues.map(issue => `

            <div class="issue">

              <div class="type">
                ${escapeHtml(issueTypeLabel(issue.type))}
              </div>

              <div class="msg">
                ${escapeHtml(issue.message)}
              </div>

              ${
                issue.suggestion
                ?
                `
                <div class="sug">
                  修正例：
                  <code>
                    ${escapeHtml(issue.suggestion)}
                  </code>
                </div>
                `
                :
                ""
              }

            </div>

          `).join("")}

        </div>
        `
        :
        ""
      }

      <div class="mt-5 font-semibold">
        AI修正文提案
      </div>

      ${
        suggestions.length
        ?
        `
        <ul class="list-disc pl-5 mt-2 space-y-2">

          ${suggestions.map(s => `
            <li>
              ${escapeHtml(s)}
            </li>
          `).join("")}

        </ul>
        `
        :
        `
        <div class="mt-2 muted">
          修正文提案はありません
        </div>
        `
      }

    </div>
  `;

}

/* =========================
長文チェック
========================= */

safeAddEvent("btnCheckBulk", "click", async () => {

  const text = $("bulkInput").value.trim();

  if (!text) {

    toast("本文を入力してください", "error");

    return;

  }

  setLoading("btnCheckBulk", "チェック中...");

  try {

    const industry =
      $("industrySelect")?.value || "general";

    const data = await postJson("/api/bulk", {
      text,
      industry
    });

    renderServerSensitive(
      "bulkSensitive",
      data.sensitive,
      data.sensitive_notice
    );

    renderBulkResult(data);

  } catch (err) {

    toast(
      err.message || "エラー",
      "error"
    );

  } finally {

    resetLoading(
      "btnCheckBulk",
      `<i class="fa-solid fa-highlighter mr-2"></i>一括チェック`
    );

  }

});

/* =========================
修正版コピーボタンの一元設定（修正の核心）
表示中の修正版テキストを直接コピー対象にする
========================= */

function setupBulkCopyButtons() {

  /* 画面に実際に表示されている修正版テキストを取得する関数 */
  const getCorrectedText = () => {

    const el = $("bulkCorrected");

    if (!el) return "";

    /* textContent で見えている全文をそのまま取得 */
    return (el.textContent || "").trim();

  };

  const enabled = getCorrectedText().length > 0;

  const bindCopy = (btnId) => {

    const btn = $(btnId);

    if (!btn) return;

    btn.disabled = !enabled;

    btn.onclick = () => {

      const text = getCorrectedText();

      copyToClipboard(
        text,
        "修正版をコピーしました"
      );

    };

  };

  bindCopy("btnCopyBulkCorrected");
  bindCopy("btnCopyBulkCorrectedTop");

}

function renderBulkResult(data) {

  const issues =
    Array.isArray(data.issues)
      ? data.issues
      : [];

  /* corrected が空の場合のフォールバック：
     元の入力文を修正版欄に表示してコピーできるようにする */
  let corrected =
    (data.corrected || "").trim();

  if (!corrected) {
    corrected = ($("bulkInput")?.value || "").trim();
  }

  const score =
    typeof data.score === "number"
      ? data.score
      : 100;

  const aiReason =
    data.ai_reason || "";

  $("bulkSummary").innerHTML = `
    ${renderSummary(score)}

    ${
      aiReason
      ?
      `
      <div class="hint">
        ${escapeHtml(aiReason)}
      </div>
      `
      :
      ""
    }
  `;

  $("bulkIssues").innerHTML =

    issues.length

    ?

    issues.map(issue => `

      <div class="issue">

        <div class="type">
          ${escapeHtml(issueTypeLabel(issue.type))}
        </div>

        <div class="msg">
          ${escapeHtml(issue.message)}
        </div>

        ${
          issue.suggestion
          ?
          `
          <div class="sug">
            修正例：
            <code>
              ${escapeHtml(issue.suggestion)}
            </code>
          </div>
          `
          :
          ""
        }

      </div>

    `).join("")

    :

    `
    <div class="hint">
      問題は検出されませんでした。
    </div>
    `;

  const issueCountEl = $("issueCount");

  if (issueCountEl) {
    issueCountEl.textContent = `${issues.length}件`;
  }

  /* 修正版を画面に表示（このテキストがコピー対象になる） */
  $("bulkCorrected").textContent = corrected;

  const aiReasonEl = $("bulkAiReason");

  if (aiReasonEl) {
    aiReasonEl.textContent = aiReason;
  }

  /* 表示が終わってからコピーボタンを設定（表示テキスト基準で有効化） */
  setupBulkCopyButtons();

}

/* =========================
文字数カウント
========================= */

function attachCounter(inputId, countId) {

  const input = $(inputId);
  const count = $(countId);

  if (!input || !count) return;

  input.addEventListener("input", () => {
    count.textContent = input.value.length;
  });

}

/* =========================
モーダル
========================= */

document.body.addEventListener("click", (e) => {

  const close = e.target.closest("[data-close]");

  if (!close) return;

  safeHide("helpModal");

});

/* =========================
初期化
========================= */

(function init() {

  setTab("short");

  attachCounter("shortInput", "shortCount");
  attachCounter("bulkInput", "bulkCount");

  attachSensitiveWatcher("shortInput", "shortSensitive");
  attachSensitiveWatcher("bulkInput", "bulkSensitive");

})();
