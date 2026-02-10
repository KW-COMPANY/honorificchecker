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

  // ▼ 総合評価判定
  if(suggestions.length === 0){
    summaryHtml = `
      <div class="summary summary-good">
        ✅ ほぼ問題はありません
      </div>
    `;
  } else if(suggestions.length <= 2){
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
function toast(msg){
  clearTimeout(toastTimer);
  alert(msg);
}

