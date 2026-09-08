// Google Apps Script — PUST backend: real OTP mail + shared GitHub store
// SETUP (owner does once):
// 1. Create Google Sheet "PUST Reviews" (tabs auto-created: reviews, reports).
// 2. Extensions → Apps Script → paste this file → Save.
// 3. Project Settings → Script Properties → add:
//      GH_TOKEN  = fine-grained PAT, ONLY this repo, Contents: read+write
//      GH_OWNER  = HMHASHEMALI16
//      GH_REPO   = pust
//      GH_BRANCH = main
//      ADMIN_KEY = a long random password (for admin moderation)
//    (Token stays here — NEVER in the website code.)
// 4. Deploy → New deployment → Web app → Execute as: Me → Access: Anyone → Deploy.
// 5. Copy /exec URL → paste as backendDefault in js/config.js → push to GitHub.
//    (Visitors may still override per-browser in Settings.)
// Gmail quota ~100-500/day free. OTP 6-digit, 10 min. Reviews committed to
// data/reviews/shared.json + data/reviews/reports.json in the repo.
const SHEET_ID = "";
const STUDENT_RE = /@([a-z0-9-]+\.)*s\.pust\.ac\.bd$/i;
const OTP_TTL_SEC = 600, OTP_MAX_SEND_PER_HOUR = 5, OTP_MAX_TRIES = 8;
const TICKET_TTL_SEC = 86400; // 24h write ticket after OTP verify
const F_REVIEWS = "data/reviews/shared.json", F_REPORTS = "data/reviews/reports.json";

function P_(k,d){ const v=PropertiesService.getScriptProperties().getProperty(k); return v==null?d:v; }
function GH_(){ return {token:P_("GH_TOKEN",""),owner:P_("GH_OWNER","HMHASHEMALI16"),repo:P_("GH_REPO","pust"),branch:P_("GH_BRANCH","main")}; }
function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e){
  let data={}; try{ data=JSON.parse(e.postData.contents); }catch(err){ return json({ok:false,error:"bad json"}); }
  if(data.type==="otp_send") return json(handleOtpSend_(String(data.email||"")));
  if(data.type==="otp_verify") return json(handleOtpVerify_(String(data.email||""),String(data.code||"")));
  if(data.type==="review_add") return json(handleReviewAdd_(data));
  if(data.type==="report_add") return json(handleReportAdd_(data));
  if(data.type==="helpful") return json(handleHelpful_(data));
  if(data.type==="moderate") return json(handleModerate_(data));
  if(data.type==="sync") return json(handleSync_(data));
  return json({ok:false,error:"unknown type"});
}
function doGet(){ return json({ok:true,app:"PUST evaluation backend"}); }

// ---------- OTP ----------
function handleOtpSend_(email){
  email=email.trim().toLowerCase();
  if(!STUDENT_RE.test(email)) return {ok:false,error:"Students only: use @s.pust.ac.bd email."};
  const cache=CacheService.getScriptCache();
  const sent=parseInt(cache.get("n_"+email)||"0",10);
  if(sent>=OTP_MAX_SEND_PER_HOUR) return {ok:false,error:"Too many codes. Try again after an hour."};
  const code=String(Math.floor(100000+Math.random()*900000));
  cache.put("otp_"+email,code,OTP_TTL_SEC);
  cache.put("try_"+email,"0",OTP_TTL_SEC);
  cache.put("n_"+email,String(sent+1),3600);
  GmailApp.sendEmail(email,"Your PUST Evaluation login code: "+code,
    "Your PUST Teachers' Evaluation sign-in code is "+code+". It expires in 10 minutes. If you did not request it, ignore this mail.",
    {name:"PUST Teachers' Evaluation",
     htmlBody:"<p>Your <b>PUST Teachers' Evaluation</b> sign-in code is:</p><p style='font-size:28px;font-weight:800;letter-spacing:4px'>"+code+"</p><p>Expires in 10 minutes.</p>"});
  return {ok:true};
}
function handleOtpVerify_(email,code){
  email=email.trim().toLowerCase();
  if(!STUDENT_RE.test(email)) return {ok:false,error:"Students only."};
  const cache=CacheService.getScriptCache();
  const real=cache.get("otp_"+email);
  if(!real) return {ok:false,error:"Code expired. Send a new one."};
  const tries=parseInt(cache.get("try_"+email)||"0",10);
  if(tries>=OTP_MAX_TRIES){ cache.remove("otp_"+email); return {ok:false,error:"Too many wrong tries. Send a new code."}; }
  if(real!==code.trim()){ cache.put("try_"+email,String(tries+1),OTP_TTL_SEC); return {ok:false,error:"Wrong code."}; }
  cache.remove("otp_"+email); cache.remove("try_"+email);
  const ticket=Utilities.getUuid().replace(/-/g,"")+Utilities.getUuid().replace(/-/g,"").slice(0,16);
  cache.put("t_"+ticket,email,TICKET_TTL_SEC);
  return {ok:true,ticket:ticket};
}
function ticketEmail_(t){
  if(!t) return null;
  return CacheService.getScriptCache().get("t_"+String(t));
}

// ---------- GitHub store ----------
function ghRead_(g,path){
  const url="https://api.github.com/repos/"+g.owner+"/"+g.repo+"/contents/"+path+"?ref="+g.branch;
  const r=UrlFetchApp.fetch(url,{headers:{Authorization:"Bearer "+g.token,Accept:"application/vnd.github+json"},muteHttpExceptions:true});
  if(r.getResponseCode()===404) return {sha:null,arr:[]};
  if(r.getResponseCode()!==200) throw new Error("GitHub read "+r.getResponseCode());
  const j=JSON.parse(r.getContentText());
  let arr=[]; try{ arr=JSON.parse(Utilities.newBlob(Utilities.base64Decode(j.content)).getDataAsString()); }catch(err){ arr=[]; }
  return {sha:j.sha,arr:Array.isArray(arr)?arr:[]};
}
function ghWrite_(g,path,arr,sha,msg){
  const content=Utilities.base64Encode(JSON.stringify(arr,null,2),Utilities.Charset.UTF_8);
  const payload={message:msg,content:content,branch:g.branch}; if(sha) payload.sha=sha;
  const r=UrlFetchApp.fetch("https://api.github.com/repos/"+g.owner+"/"+g.repo+"/contents/"+path,
    {method:"put",contentType:"application/json",payload:JSON.stringify(payload),
     headers:{Authorization:"Bearer "+g.token,Accept:"application/vnd.github+json"},muteHttpExceptions:true});
  if(r.getResponseCode()!==200&&r.getResponseCode()!==201) throw new Error("GitHub write "+r.getResponseCode()+": "+r.getContentText().slice(0,200));
}
function validReview_(r){
  if(!r||typeof r!=="object") return false;
  if(!r.id||!r.professor_id||!r.course_code||!r.academic_year||!r.ratings) return false;
  const vs=Object.values(r.ratings);
  if(vs.length<15||!vs.every(v=>v>=1&&v<=5)) return false;
  if(String(r.comment||"").length>2000) return false;
  return true;
}
function handleReviewAdd_(data){
  const email=ticketEmail_(data.ticket);
  if(!email) return {ok:false,error:"Login expired. Sign in again."};
  const rev=data.review;
  if(!validReview_(rev)) return {ok:false,error:"Invalid review."};
  rev.helpful_count=0; // server resets; no author stored by design
  const g=GH_(); if(!g.token) return {ok:false,error:"Server GitHub not configured."};
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const cur=ghRead_(g,F_REVIEWS);
    if(cur.arr.some(x=>x.id===rev.id)) return {ok:true,duplicate:true};
    cur.arr.unshift(rev);
    ghWrite_(g,F_REVIEWS,cur.arr,cur.sha,"review "+rev.id+" "+rev.professor_id);
    sheetPush_("reviews",[[new Date(),rev.id,rev.professor_id,rev.course_code,rev.academic_year,rev.overall,JSON.stringify(rev.ratings),rev.comment||"",0]]);
  }finally{ lock.releaseLock(); }
  return {ok:true,id:rev.id};
}
function handleReportAdd_(data){
  const email=ticketEmail_(data.ticket);
  if(!email) return {ok:false,error:"Login expired. Sign in again."};
  const rep=data.report;
  if(!rep||!rep.id||!rep.review_id||!rep.reason) return {ok:false,error:"Invalid report."};
  const g=GH_(); if(!g.token) return {ok:false,error:"Server GitHub not configured."};
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const cur=ghRead_(g,F_REPORTS);
    if(!cur.arr.some(x=>x.id===rep.id)){ cur.arr.unshift({id:rep.id,review_id:rep.review_id,reason:String(rep.reason).slice(0,120),details:String(rep.details||"").slice(0,1000),status:"pending",created_at:rep.created_at||new Date().toISOString()}); }
    ghWrite_(g,F_REPORTS,cur.arr,cur.sha,"report "+rep.id);
    sheetPush_("reports",[[new Date(),rep.id,rep.review_id,rep.reason,rep.details||"","pending"]]);
  }finally{ lock.releaseLock(); }
  return {ok:true};
}
function handleHelpful_(data){
  const email=ticketEmail_(data.ticket);
  if(!email) return {ok:false,error:"Login expired. Sign in again."};
  const g=GH_(); if(!g.token) return {ok:false,error:"Server GitHub not configured."};
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const cur=ghRead_(g,F_REVIEWS);
    const r=cur.arr.find(x=>x.id===data.id);
    if(!r) return {ok:false,error:"Review not found."};
    r.helpful_count=(r.helpful_count||0)+1;
    ghWrite_(g,F_REVIEWS,cur.arr,cur.sha,"helpful "+data.id);
  }finally{ lock.releaseLock(); }
  return {ok:true};
}
function handleModerate_(data){
  if(String(data.adminKey||"")!==P_("ADMIN_KEY","__unset__")||P_("ADMIN_KEY","__unset__")==="__unset__") return {ok:false,error:"Bad admin key."};
  const g=GH_(); if(!g.token) return {ok:false,error:"Server GitHub not configured."};
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    if(data.action==="remove_review"){
      const cur=ghRead_(g,F_REVIEWS);
      const r=cur.arr.find(x=>x.id===data.id); if(!r) return {ok:false,error:"Not found."};
      r.removed=true;
      ghWrite_(g,F_REVIEWS,cur.arr,cur.sha,"moderate remove "+data.id);
    }else if(data.action==="resolve_report"){
      const cur=ghRead_(g,F_REPORTS);
      const r=cur.arr.find(x=>x.id===data.id); if(!r) return {ok:false,error:"Not found."};
      r.status="resolved";
      ghWrite_(g,F_REPORTS,cur.arr,cur.sha,"moderate resolve "+data.id);
    }else return {ok:false,error:"Unknown action."};
  }finally{ lock.releaseLock(); }
  return {ok:true};
}
function handleSync_(data){
  // legacy Sheet/Drive backup of a browser snapshot (admin export path)
  sheetPush_("reviews",(data.reviews||[]).map(r=>[new Date(),r.id,r.professor_id,r.course_code,r.academic_year,r.overall,JSON.stringify(r.ratings),r.comment||"",r.helpful_count||0]));
  sheetPush_("reports",(data.reports||[]).map(r=>[new Date(),r.id,r.review_id,r.reason,r.details||"",r.status||"pending"]));
  try{
    const folder=DriveApp.getRootFolder(), name="pust-reviews-backup.json";
    const content=JSON.stringify({at:new Date(),reviews:data.reviews||[],reports:data.reports||[]});
    const files=folder.getFilesByName(name);
    if(files.hasNext()) files.next().setContent(content); else folder.createFile(name,content,MimeType.PLAIN_TEXT);
  }catch(err){}
  return {ok:true};
}
function sheetPush_(tab,rows){
  if(!rows||!rows.length) return;
  try{
    const ss=SHEET_ID?SpreadsheetApp.openById(SHEET_ID):SpreadsheetApp.getActiveSpreadsheet();
    let sh=ss.getSheetByName(tab)||ss.insertSheet(tab);
    rows.forEach(r=>sh.appendRow(r));
  }catch(err){}
}
