const API_ENDPOINT = 'https://honorificchecker.gmo-k-watanabe.workers.dev';

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

const helpModal = $("helpModal");
const helpBtn = $("helpBtn");

if (helpBtn) {
  helpBtn.addEventListener("click", ()=>openModal());
}

if (helpModal) {
  helpModal.addEventListener("click", (e)=>{
    const close = e.target?.dataset?.close;
    if(close) closeModal();
  });
}

function openModal(){
  helpModal?.classList.remove("hidden");
}

function closeModal(){
  helpModal?.classList.add("hidden");
}

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

$("btnCheckShort").addEventListener("click", async ()=>{
  const text = $("shortInput").value.trim();
  if(!text){ return toast("文を入力してください"); }

  $("shortResult").classList.add("hidden");
  $("btnCopyShortSuggestion").disabled = true;

  $("btnCheckShort").disabled = true;
  $("btnCheckShort").innerHTML = `チェック中...`;

  try{
    const data = await postJson("/api/check", { text });
    renderShortResult(data);
  }catch(err){
    renderShortResult({ error: err.message || String(err) });
  }finally{
    $("btnCheckShort").disabled = false;
    $("btnCheckShort").innerHTML = `チェックする`;
  }
});

function renderShortResult(data){
  const box = $("shortResult");
  box.classList.remove("hidden");

  if(data.error){
    box.innerHTML = `<div class="result-card">
      <div class="result-title text-rose-300 text-lg font-bold">
        エラー
      </div>
      <div class="mt-2 text-sm">${escapeHtml(data.error)}</div>
    </div>`;
    return;
  }

  const suggestions = data.suggestions || [];
  let summaryHtml = "";

if(suggestions.length <= 1){
  summaryHtml = `
    <div class="summary summary-good">
      ✅ ほぼ問題はありません
    </div>
  `;
} else if(suggestions.length <= 3){
  summaryHtml = `
    <div class="summary summary-warning">
      ⚠ 軽微な修正をおすすめします
    </div>
  `;
} else {
  summaryHtml = `
    <div class="summary summary-bad">
      ❌ 修正が多く必要です
    </div>
  `;
}

  const suggestion = suggestions[0] || "";

  $("btnCopyShortSuggestion").disabled = !suggestion;
  $("btnCopyShortSuggestion").onclick = (e)=>
    copyToClipboard(suggestion, "修正文をコピーしました", e.currentTarget);

  box.innerHTML = `
    ${summaryHtml}

    <div class="result-card mt-4">

      <div class="text-sm leading-7">
        <div class="font-semibold">理由</div>
        <div>${escapeHtml(data.reason || "—")}</div>
      </div>

      <div class="mt-3 text-sm leading-7">
        <div class="font-semibold">修正案</div>
        ${
          suggestions.length
            ? `<ul class="list-disc pl-5">
                ${suggestions.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}
               </ul>`
            : `<div class="muted">修正提案はありません。</div>`
        }
      </div>

    </div>
  `;
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

async function copyToClipboard(text, okMsg, btn){
  try{
    await navigator.clipboard.writeText(text);
    toast(okMsg || "コピーしました");
  }catch{
    toast("コピーできませんでした");
  }
}

let toastTimer;
function toast(msg, type = "normal"){
  clearTimeout(toastTimer);

  let box = document.getElementById("toastBox");

  if(!box){
    box = document.createElement("div");
    box.id = "toastBox";
    box.className = "toast";
    document.body.appendChild(box);
  }

  box.textContent = msg;

  box.className = "toast";

  box.classList.add(type);

  box.classList.add("show");

  toastTimer = setTimeout(()=>{
    box.classList.remove("show");
  }, 2000);
}

$("btnCheckBulk").addEventListener("click", async ()=>{
  const text = $("bulkInput").value.trim();
  if(!text){ return toast("メール本文を入力してください"); }

  $("btnCheckBulk").disabled = true;
  $("btnCheckBulk").innerHTML = "チェック中...";

  try{
    const data = await postJson("/api/bulk", { text });

    renderBulkResult(data);

  }catch(err){
    toast(err.message || "エラーが発生しました");
  }finally{
    $("btnCheckBulk").disabled = false;
    $("btnCheckBulk").innerHTML = "一括チェックする";
  }
});

function renderBulkResult(data){

  const issues = data.issues || [];

  renderBulkSummary(data);

  $("bulkIssues").innerHTML = issues.map(issue => `
    <div class="issue">
      <div class="type">${issue.type}</div>
      <div class="msg">${escapeHtml(issue.message)}</div>
      <div class="sug">${escapeHtml(issue.suggestion || "")}</div>
    </div>
  `).join("");

  $("bulkCorrected").textContent = data.corrected || "";

}

function renderBulkSummary(data){
  const box = $("bulkSummary");
  box.innerHTML = "";

  const count = (data.issues || []).length;

  let html = "";

  if(count <= 1){
    html = `
      <div class="summary summary-good">
        ✅ ほぼ問題はありません
      </div>
    `;
  } else if(count <= 3){
    html = `
      <div class="summary summary-warning">
        ⚠ 軽微な修正をおすすめします
      </div>
    `;
  } else {
    html = `
      <div class="summary summary-bad">
        ❌ 修正が多く必要です
      </div>
    `;
  }

  box.innerHTML = html;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #ffffff;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
