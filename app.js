/* =========================
設定
========================= */

const API_ENDPOINT = "https://honorificchecker.gmo-k-watanabe.workers.dev";

const $ = (id) => document.getElementById(id);

/* =========================
安全DOM操作
========================= */

function safeAddEvent(id, event, handler){
  const el = $(id);
  if(el) el.addEventListener(event, handler);
}

function safeShow(id){
  const el=$(id);
  if(el) el.classList.remove("hidden");
}

function safeHide(id){
  const el=$(id);
  if(el) el.classList.add("hidden");
}

function escapeHtml(str){
  return String(str)
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"'," &quot;")
  .replaceAll("'","&#039;");
}

/* =========================
通信ユーティリティ
========================= */

async function fetchWithTimeout(url, options={}, timeout=20000){

  const controller=new AbortController();
  const id=setTimeout(()=>controller.abort(),timeout);

  try{

    const res=await fetch(url,{
      ...options,
      signal:controller.signal
    });

    clearTimeout(id);

    return res;

  }catch(err){

    clearTimeout(id);
    throw err;

  }

}

async function postJson(path, body){

  try{

    const res=await fetchWithTimeout(`${API_ENDPOINT}${path}`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(body)
    });

    let data;

    try{
      data=await res.json();
    }catch{
      throw new Error("サーバー応答がJSONではありません");
    }

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

/* =========================
トースト
========================= */

function toast(message,type="success"){

  let el=document.querySelector(".toast");

  if(!el){
    el=document.createElement("div");
    el.className="toast";
    document.body.appendChild(el);
  }

  el.textContent=message;
  el.className=`toast show ${type}`;

  setTimeout(()=>{
    el.classList.remove("show");
  },3000);

}

/* =========================
タブ切替
========================= */

const tabShort=$("tabShort");
const tabBulk=$("tabBulk");

const panelShort=$("panelShort");
const panelBulk=$("panelBulk");

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

safeAddEvent("tabShort","click",()=>setTab("short"));
safeAddEvent("tabBulk","click",()=>setTab("bulk"));

/* =========================
コピー
========================= */

async function copyToClipboard(text,message){

  try{

    await navigator.clipboard.writeText(text);
    toast(message);

  }catch{

    toast("コピーに失敗しました","error");

  }

}

/* =========================
短文チェック
========================= */

safeAddEvent("btnCheckShort","click", async ()=>{

  const text=$("shortInput").value.trim();

  if(!text){
    return toast("文を入力してください","error");
  }

  const btn=$("btnCheckShort");

  btn.disabled=true;
  btn.innerHTML="チェック中...";

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

    box.innerHTML=`
    <div class="result-card">
      <div class="result-title text-rose-300">エラー</div>
      <div>${escapeHtml(data.error)}</div>
    </div>
    `;

    return;

  }

  const suggestions=data.suggestions||[];

  const suggestion=suggestions[0]||"";

  const copyBtn=$("btnCopyShortSuggestion");

  if(copyBtn){

    copyBtn.disabled=!suggestion;

    copyBtn.onclick=()=>{
      copyToClipboard(suggestion,"修正文をコピーしました");
    };

  }

  box.innerHTML=`

  <div class="result-card">

  <div class="font-semibold">理由</div>
  <div>${escapeHtml(data.reason || "")}</div>

  <div class="mt-3 font-semibold">修正案</div>

  ${
    suggestions.length
    ? `<ul class="list-disc pl-5">
        ${suggestions.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}
       </ul>`
    : `<div>修正案はありません</div>`
  }

  </div>

  `;

}

/* =========================
一括チェック
========================= */

safeAddEvent("btnCheckBulk","click", async ()=>{

  const text=$("bulkInput").value.trim();

  if(!text){
    return toast("本文を入力してください","error");
  }

  const btn=$("btnCheckBulk");

  btn.disabled=true;
  btn.innerHTML="チェック中...";

  try{

    const industry=$("industrySelect")?.value ?? "general";

    const data=await postJson("/api/bulk",{text,industry});

    renderBulkResult(data);

  }catch(err){

    toast(err.message || "エラー","error");

  }finally{

    btn.disabled=false;
    btn.innerHTML="一括チェック";

  }

});

function renderBulkResult(data){

  const issues=data.issues||[];

  $("bulkIssues").innerHTML=issues.map(issue=>`
  <div class="issue">
  <div class="type">${escapeHtml(issue.type)}</div>
  <div class="msg">${escapeHtml(issue.message)}</div>
  <div class="sug">${escapeHtml(issue.suggestion||"")}</div>
  </div>
  `).join("");

  const corrected=data.corrected||"";

  $("bulkCorrected").textContent=corrected;

  const btn=$("btnCopyBulkCorrected");

  btn.disabled=!corrected;

  btn.onclick=()=>{
    copyToClipboard(corrected,"修正版コピーしました");
  };

}
