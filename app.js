/* =========================
  🔧ここを変更：あなたのWorker URL
  例）https://keigolint-api.your-subdomain.workers.dev
========================= */
const API_ENDPOINT = 'https://your-worker-name.your-subdomain.workers.dev';

const $ = (id) => document.getElementById(id);

const examples = {
  "short-1": "私が御社に伺わせていただきます。",
  "short-2": "社長にお伝えしてもらえますでしょうか。",
  "short-3": "資料を送付いたします。ご確認ください。",
  "bulk-1": `お世話になっております。株式会社サンプルの田中です。
この度はご迷惑をお掛けしてしまい大変申し訳ございません。
本日中にご連絡差し上げますので、何卒よろしくお願い致します。`,
  "bulk-2": `お世話になっております。株式会社サンプルの田中です。
来週の打ち合わせ日程について、ご都合の良い候補日を3つほど頂けますでしょうか。
よろしくお願い申し上げます。`
};

/* ========= UI: Tabs ========= */
const tabShort = $("tabShort");
const tabBulk = $("tabBulk");
const panelShort = $("panelShort");
const panelBulk = $("panelBulk");

function setTab(which){
  if(which === "short"){
    tabShort.classList.add("tab-active");
    tabBulk.classList.remove("tab-active");
    panelShort.classList.remove("hidden");
    panelBulk.classList.add("hidden");
  }else{
    tabBulk.classList.add("tab-active");
    tabShort.classList.remove("tab-active");
    panelBulk.classList.remove("hidden");
    panelShort.classList.add("hidden");
  }
}
tabShort.addEventListener("click", ()=>setTab("short"));
tabBulk.addEventListener("click", ()=>setTab("bulk"));

/* ========= Modal ========= */
const helpModal = $("helpModal");
$("btnHelp").addEventListener("click", ()=>openModal());
helpModal.addEventListener("click", (e)=>{
  const close = e.target?.dataset?.close;
  if(close) closeModal();
});
function openModal(){ helpModal.classList.remove("hidden"); }
function closeModal(){ helpModal.classList.add("hidden"); }

/* ========= Examples ========= */
document.body.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-example]");
  if(!btn) return;
  const key = btn.dataset.example;
  if(key.startsWith("short")){
    $("shortInput").value = examples[key];
    setTab("short");
  }else{
    $("bulkInput").value = examples[key];
    setTab("bulk");
  }
});

/* ========= Clear ========= */
$("btnClearShort").addEventListener("click", ()=>{
  $("shortInput").value = "";
  $("shortResult").classList.add("hidden");
  $("shortRuleHints").classList.add("hidden");
  $("btnCopyShortSuggestion").disabled = true;
});
$("btnClearBulk").addEventListener("click", ()=>{
  $("bulkInput").value = "";
  $("bulkHighlighted").textContent = "";
  $("bulkIssues").innerHTML = "";
  $("bulkCorrected").textContent = "";
  $("bulkRuleHints").classList.add("hidden");
  $("btnCopyBulkCorrected").disabled = true;
});

/* ========= Rule-based quick hints (LLMの補助) ========= */
const RULES = [
  { re: /ご覧になられる/g, type:"keigo", msg:"「ご覧になる」＋「られる」で二重敬語の可能性", sug:"ご覧になる / ご覧いただく" },
  { re: /お伺いさせていただく/g, type:"keigo", msg:"過剰敬語になりやすい表現", sug:"伺います / お伺いします" },
  { re: /ご確認のほどよろしくお願いいたします。?/g, type:"grammar", msg:"定型としてOKですが、連続使用はくどくなりやすい", sug:"ご確認ください / ご査収ください（場面注意）" },
  { re: /〜になります。/g, type:"grammar", msg:"「〜です」で足りる場面が多い（過剰丁寧）", sug:"〜です" },
  { re: /させていただきます/g, type:"grammar", msg:"多用すると回りくどい印象", sug:"します / いたします（場面により）" }
];

function ruleHints(text){
  const hits = [];
  for(const r of RULES){
    const m = text.match(r.re);
    if(m) hits.push({ ...r, count: m.length });
  }
  return hits;
}

function renderRuleHints(el, hits){
  if(!hits.length){
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.className = "hint";
  el.innerHTML = `
    <div class="font-bold text-slate-100 mb-1"><i class="fa-solid fa-bolt mr-2 text-amber-300"></i>簡易ルール検出（参考）</div>
    <ul class="list-disc pl-5 space-y-1">
      ${hits.map(h=>`<li><span class="font-semibold">${escapeHtml(h.msg)}</span>（${h.count}箇所）<div class="muted">提案：${escapeHtml(h.sug)}</div></li>`).join("")}
    </ul>
  `;
}

/* ========= API ========= */
async function postJson(path, body){
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(()=>({ error: "JSON parse error" }));
  if(!res.ok){
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/* ========= Short check ========= */
$("btnCheckShort").addEventListener("click", async ()=>{
  const text = $("shortInput").value.trim();
  if(!text){ return toast("文を入力してください"); }

  renderRuleHints($("shortRuleHints"), ruleHints(text));
  $("shortResult").classList.add("hidden");
  $("btnCopyShortSuggestion").disabled = true;

  $("btnCheckShort").disabled = true;
  $("btnCheckShort").innerHTML = `<i class="fa-solid fa-spinner mr-2 fa-spin"></i>チェック中...`;

  try{
    const data = await postJson("/api/check", { text });
    renderShortResult(data);
  }catch(err){
    renderShortResult({ error: err.message || String(err) });
  }finally{
    $("btnCheckShort").disabled = false;
    $("btnCheckShort").innerHTML = `<i class="fa-solid fa-magnifying-glass mr-2"></i>チェックする`;
  }
});

function renderShortResult(data){
  const box = $("shortResult");
  box.classList.remove("hidden");

  if(data.error){
    box.innerHTML = `<div class="result-card">
      <div class="result-title text-rose-200"><i class="fa-solid fa-triangle-exclamation mr-2"></i>エラー</div>
      <div class="mt-2 text-sm text-slate-200/90">${escapeHtml(data.error)}</div>
      <div class="mt-2 text-xs text-slate-200/70">API_ENDPOINT（app.js）とWorkersの環境変数を確認してください。</div>
    </div>`;
    return;
  }

  const suggestion = (data.suggestions && data.suggestions[0]) ? data.suggestions[0] : (data.suggestion || "");
  $("btnCopyShortSuggestion").disabled = !suggestion;
  $("btnCopyShortSuggestion").onclick = ()=>copyToClipboard(suggestion, "修正文をコピーしました");

  box.innerHTML = `
    <div class="result-card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="result-title">
          判定：<span class="px-2 py-1 rounded-lg border border-white/10 bg-white/5">${escapeHtml(data.label || "—")}</span>
        </div>
        <div class="text-xs text-slate-200/70">信頼度：${escapeHtml(String(data.confidence ?? "—"))}</div>
      </div>

      <div class="mt-3 text-sm leading-7">
        <div class="font-semibold">理由</div>
        <div class="text-slate-200/90">${escapeHtml(data.reason || "—")}</div>
      </div>

      <div class="mt-3 text-sm leading-7">
        <div class="font-semibold">修正案</div>
        <ul class="list-disc pl-5">
          ${(data.suggestions || []).slice(0,5).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      </div>

      <div class="mt-3 text-sm leading-7">
        <div class="font-semibold">活用事例</div>
        <ul class="list-disc pl-5">
          ${(data.examples || []).slice(0,5).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      </div>

      <div class="mt-3 text-sm leading-7">
        <div class="font-semibold">よくある間違い</div>
        <ul class="list-disc pl-5">
          ${(data.common_mistakes || []).slice(0,5).map(s=>`<li>${escapeHtml(s)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

/* ========= Bulk check ========= */
$("btnCheckBulk").addEventListener("click", async ()=>{
  const text = $("bulkInput").value;
  if(!text.trim()){ return toast("メール本文を貼り付けてください"); }

  renderRuleHints($("bulkRuleHints"), ruleHints(text));
  $("btnCopyBulkCorrected").disabled = true;

  $("btnCheckBulk").disabled = true;
  $("btnCheckBulk").innerHTML = `<i class="fa-solid fa-spinner mr-2 fa-spin"></i>チェック中...`;

  try{
    const data = await postJson("/api/bulk", { text });
    renderBulkResult(text, data);
  }catch(err){
    renderBulkResult(text, { error: err.message || String(err) });
  }finally{
    $("btnCheckBulk").disabled = false;
    $("btnCheckBulk").innerHTML = `<i class="fa-solid fa-highlighter mr-2"></i>一括チェックする`;
  }
});

function renderBulkResult(originalText, data){
  if(data.error){
    $("bulkHighlighted").innerHTML = `<span class="text-rose-200"><i class="fa-solid fa-triangle-exclamation mr-2"></i>${escapeHtml(data.error)}</span>`;
    $("bulkIssues").innerHTML = `<div class="muted text-sm">API_ENDPOINT（app.js）とWorkersの環境変数を確認してください。</div>`;
    $("bulkCorrected").textContent = "";
    return;
  }

  const issues = Array.isArray(data.issues) ? data.issues : [];
  const corrected = data.corrected || "";

  $("bulkHighlighted").innerHTML = buildHighlightedHtml(originalText, issues);
  $("bulkIssues").innerHTML = issues.length ? issues.map(renderIssue).join("") : `<div class="muted text-sm">指摘は見つかりませんでした。</div>`;
  $("bulkCorrected").textContent = corrected;

  $("btnCopyBulkCorrected").disabled = !corrected;
  $("btnCopyBulkCorrected").onclick = ()=>copyToClipboard(corrected, "修正版をコピーしました");
}

function renderIssue(it){
  const typeLabel = ({
    typo:"TYPO",
    kanji:"KANJI",
    keigo:"KEIGO",
    grammar:"GRAMMAR"
  })[it.type] || "ISSUE";

  const badgeColor = ({
    typo:"text-amber-200",
    kanji:"text-orange-200",
    keigo:"text-rose-200",
    grammar:"text-fuchsia-200"
  })[it.type] || "text-slate-200";

  return `
    <div class="issue">
      <div class="flex items-center justify-between gap-2">
        <div class="type ${badgeColor}">${escapeHtml(typeLabel)}</div>
        <div class="text-xs text-slate-200/70">[${escapeHtml(String(it.start))}..${escapeHtml(String(it.end))}]</div>
      </div>
      <div class="msg">${escapeHtml(it.message || "")}</div>
      ${it.suggestion ? `<div class="sug">提案：<code>${escapeHtml(it.suggestion)}</code></div>` : ""}
    </div>
  `;
}

/* ========= Highlight builder (XSS safe) ========= */
function buildHighlightedHtml(text, issues){
  // sort by start asc, then end desc
  const items = [...issues].filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
    .sort((a,b)=> a.start - b.start || b.end - a.end);

  let out = "";
  let idx = 0;

  for(const it of items){
    const s = clamp(it.start, 0, text.length);
    const e = clamp(it.end, 0, text.length);
    if(e <= idx) continue; // skip overlaps already covered

    out += escapeHtml(text.slice(idx, s));

    const cls = ({
      typo:"hl hl-typo",
      kanji:"hl hl-kanji",
      keigo:"hl hl-keigo",
      grammar:"hl hl-grammar"
    })[it.type] || "hl";

    const title = `${it.type || "issue"}: ${it.message || ""}`.slice(0, 300);
    out += `<span class="${cls}" title="${escapeHtml(title)}">${escapeHtml(text.slice(s, e))}</span>`;
    idx = e;
  }
  out += escapeHtml(text.slice(idx));
  return out;
}

/* ========= Utils ========= */
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

async function copyToClipboard(text, okMsg){
  try{
    await navigator.clipboard.writeText(text);
    toast(okMsg || "コピーしました");
  }catch{
    toast("コピーできませんでした（ブラウザ権限を確認してください）");
  }
}

let toastTimer;
function toast(msg){
  clearTimeout(toastTimer);
  let el = $("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "999px";
    el.style.border = "1px solid rgba(255,255,255,.14)";
    el.style.background = "rgba(15,23,42,.95)";
    el.style.color = "rgba(255,255,255,.92)";
    el.style.boxShadow = "0 14px 40px rgba(0,0,0,.35)";
    el.style.fontSize = "13px";
    el.style.zIndex = "60";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  toastTimer = setTimeout(()=>{ el.style.opacity = "0"; }, 2600);
}