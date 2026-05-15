const API_ENDPOINT = "https://honorificchecker.gmo-k-watanabe.workers.dev";

const $ = (id) => document.getElementById(id);

/* -----------------------------
安全DOM操作
----------------------------- */

function safeAddEvent(id, event, handler){
  const el = $(id);
  if(el) el.addEventListener(event, handler);
}

function safeShow(id){
  const el = $(id);
  if(el) el.classList.remove("hidden");
}

function safeHide(id){
  const el = $(id);
  if(el) el.classList.add("hidden");
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* -----------------------------
例文
----------------------------- */

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

/* -----------------------------
タブ切替
----------------------------- */

const tabShort = $("tabShort");
const tabBulk = $("tabBulk");
const panelShort = $("panelShort");
const panelBulk = $("panelBulk");

function setTab(which){

  if(which==="short"){

    tabShort?.classList.add("tab-active");
    tabBulk?.classList.remove("tab-active");

    panelShort?.classList.remove("hidden");
    panelBulk?.classList.add("hidden");

  }else{

    tabBulk?.classList.add("tab-active");
    tabShort?.classList.remove("tab-active");

    panelBulk?.classList.remove("hidden");
    panelShort?.classList.add("hidden");

  }
}

safeAddEvent("tabShort","click",()=>{
  setTab("short");
  $("shortInput")?.scrollIntoView({behavior:"smooth",block:"center"});
});

safeAddEvent("tabBulk","click",()=>{
  setTab("bulk");
  $("bulkInput")?.scrollIntoView({behavior:"smooth",block:"center"});
});

/* -----------------------------
ヘルプモーダル
----------------------------- */

const helpModal = $("helpModal");
const helpBtn = $("helpBtn");

helpBtn?.addEventListener("click",()=>openModal());

helpModal?.addEventListener("click",(e)=>{
  const close=e.target?.dataset?.close;
  if(close) closeModal();
});

function openModal(){
  helpModal?.classList.remove("hidden");
}

function closeModal(){
  helpModal?.classList.add("hidden");
}

/* -----------------------------
例文クリック
----------------------------- */

document.body.addEventListener("click",(e)=>{

  const btn=e.target.closest("[data-example]");
  if(!btn) return;

  const key=btn.dataset.example;

  if(key.startsWith("short")){
    $("shortInput").value=examples[key];
    setTab("short");
  }else{
    $("bulkInput").value=examples[key];
    setTab("bulk");
  }

});

/* -----------------------------
クリアボタン
----------------------------- */

safeAddEvent("btnClearShort","click",()=>{

  $("shortInput").value="";

  safeHide("shortResult");
  safeHide("shortRuleHints");

  const btn=$("btnCopyShortSuggestion");
  if(btn) btn.disabled=true;

});

safeAddEvent("btnClearBulk","click",()=>{

  $("bulkInput").value="";
  $("bulkHighlighted").textContent="";
  $("bulkIssues").innerHTML="";
  $("bulkCorrected").textContent="";

  $("bulkRuleHints")?.classList.add("hidden");

  const btn=$("btnCopyBulkCorrected");
  if(btn) btn.disabled=true;

});

/* -----------------------------
API通信
----------------------------- */

async function fetchWithTimeout(url, options={}, timeout=20000){

  const controller=new AbortController();
  const id=setTimeout(()=>controller.abort(),timeout);

  const res=await fetch(url,{...options,signal:controller.signal});

  clearTimeout(id);

  return res;

}

async function postJson(path, body){

  try{

    const res=await fetchWithTimeout(`${API_ENDPOINT}${path}`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(body)
    });

    const data=await res.json();

    if(!res.ok){
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return data;

  }catch(err){

    if(err.name==="AbortError"){
      throw new Error("通信がタイムアウトしました");
    }

    throw err;

  }

}

/* -----------------------------
短文チェック
----------------------------- */

safeAddEvent("btnCheckShort","click", async ()=>{

  const text=$("shortInput").value.trim();

  if(!text){
    return toast("文を入力してください","error");
  }

  const btn=$("btnCheckShort");

  btn.disabled=true;
  btn.innerHTML=`<span class="spinner"></span>チェック中`;

  safeHide("shortResult");

  try{

    const industry=$("industrySelect")?.value ?? "general";

    const data=await postJson("/api/check",{text,industry});

    renderShortResult(data);

  }catch(err){

    renderShortResult({error:err.message});

  }finally{

    btn.disabled=false;
    btn.innerHTML="チェックする";

  }

});

function renderShortResult(data){

  const box=$("shortResult");

  safeShow("shortResult");

  if(data.error){

    box.innerHTML=`<div class="result-card">
    <div class="result-title text-rose-300 text-lg font-bold">エラー</div>
    <div class="mt-2 text-sm">${escapeHtml(data.error)}</div>
    </div>`;

    return;
  }

  const suggestions=data.suggestions || [];

  let score=0;

  if(data.label==="誤用/不適切") score+=3;
  if(data.label==="謙譲語") score+=1;

  score+=suggestions.length;

  let summaryHtml="";

  if(score===0){
    summaryHtml=`<div class="summary summary-good">🏆 完全に自然な文章です</div>`;
  }
  else if(score<=2){
    summaryHtml=`<div class="summary summary-good">✅ ほぼ問題はありません</div>`;
  }
  else if(score<=4){
    summaryHtml=`<div class="summary summary-warning">⚠ 一部修正をおすすめします</div>`;
  }
  else{
    summaryHtml=`<div class="summary summary-bad">❌ 明確な誤用があります</div>`;
  }

  const suggestion=suggestions[0] || "";

  const copyBtn=$("btnCopyShortSuggestion");

  if(copyBtn){

    copyBtn.disabled=!suggestion;

    copyBtn.onclick=()=>{
      copyToClipboard(suggestion,"修正文をコピーしました");
    };

  }

  box.innerHTML=`

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
        : `<div class="muted">修正提案はありません</div>`
      }
    </div>

  </div>
  `;

}

/* -----------------------------
一括チェック
----------------------------- */

safeAddEvent("btnCheckBulk","click", async ()=>{

  const text=$("bulkInput").value.trim();

  if(!text){
    return toast("メール本文を入力してください");
  }

  const btn=$("btnCheckBulk");

  btn.disabled=true;
  btn.innerHTML="チェック中...";

  try{

    const industry=$("industrySelect")?.value ?? "general";

    const data=await postJson("/api/bulk",{text,industry});

    renderBulkResult(data);

  }catch(err){

    toast(err.message || "エラーが発生しました");

  }finally{

    btn.disabled=false;
    btn.innerHTML="一括チェックする";

  }

});

function renderBulkResult(data){

  const issues=data.issues || [];

  renderBulkSummary(data);

  const originalText=$("bulkInput").value;

  const highlightedHtml=issues.length
  ? renderHighlightedText(originalText,issues)
  : escapeHtml(originalText);

  $("bulkHighlighted").innerHTML=highlightedHtml;

  $("bulkIssues").innerHTML=issues.map(issue=>`
  <div class="issue">
    <div class="type">${issue.type}</div>
    <div class="msg">${escapeHtml(issue.message)}</div>
    <div class="sug">${escapeHtml(issue.suggestion || "")}</div>
  </div>
  `).join("");

  const corrected=data.corrected || "";

  $("bulkCorrected").textContent=corrected;

  const copyBtn=$("btnCopyBulkCorrected");

  copyBtn.disabled=!corrected;

  copyBtn.onclick=()=>{
    copyToClipboard(corrected,"修正版をコピーしました");
  };

}

function renderHighlightedText(originalText, issues){

  const sorted=[...issues].sort((a,b)=>a.start-b.start);

  let result="";
  let lastIndex=0;

  sorted.forEach(issue=>{

    const start=issue.start;
    const end=issue.end;

    if(start<lastIndex) return;

    result+=escapeHtml(originalText.slice(lastIndex,start));

    const typeClass={
      typo:"hl-typo",
      kanji:"hl-kanji",
      keigo:"hl-keigo",
      grammar:"hl-grammar"
    }[issue.type] || "";

    result+=`<span class="hl ${typeClass}" title="${escapeHtml(issue.message)}">`
    + escapeHtml(originalText.slice(start,end))
    + `</span>`;

    lastIndex=end;

  });

  result+=escapeHtml(originalText.slice(lastIndex));

  return result;

}

function renderBulkSummary(data){

  const issues=data.issues || [];

  let score=0;

  issues.forEach(issue=>{

    let weight=1;

    if(issue.type==="keigo") weight=3;
    else if(issue.type==="grammar") weight=2;
    else if(issue.type==="kanji") weight=1;

    score+=weight;

  });

  let html="";

  if(score===0){
    html=`<div class="summary summary-good">🏆 非常に丁寧で自然な文章です</div>`;
  }
  else if(score<=4){
    html=`<div class="summary summary-good">✅ ほぼ問題はありません</div>`;
  }
  else if(score<=9){
    html=`<div class="summary summary-warning">⚠ 軽微な修正をおすすめします</div>`;
  }
  else if(score<=15){
    html=`<div class="summary summary-warning">⚠ 全体的に見直すとより良くなります</div>`;
  }
  else{
    html=`<div class="summary summary-bad">❌ 修正が多く必要です</div>`;
  }

  $("bulkSummary").innerHTML=html;

}

/* -----------------------------
コピー
----------------------------- */

async function copyToClipboard(text,msg){

  try{

    await navigator.clipboard.writeText(text);

    toast(msg || "コピーしました","success");

  }catch{

    toast("コピーできませんでした","error");

  }

}

/* -----------------------------
トースト
----------------------------- */

let toastTimer;

function toast(msg,type="normal"){

  clearTimeout(toastTimer);

  let box=$("toastBox");

  if(!box){

    box=document.createElement("div");

    box.id="toastBox";
    box.className="toast";

    document.body.appendChild(box);

  }

  box.textContent=msg;

  box.className="toast show "+type;

  toastTimer=setTimeout(()=>{
    box.classList.remove("show");
  },2500);

}
