// OTP auth for PUST students only (@s.pust.ac.bd — extra s = student). No password.
// Teachers/admins use @pust.ac.bd (no s) and are BLOCKED.
// Two modes (async API):
//  - REAL MAIL: if a backend URL is saved in Settings (same Apps Script /exec URL as Drive sync),
//    the code is emailed via Gmail and verified server-side. Nothing secret stays in the browser.
//  - DEMO: no backend configured → code generated locally + shown on screen (for local testing only).
(function(){
  const K="pust_user_v1", KC="pust_otp_v1";
  function user(){try{const u=JSON.parse(localStorage.getItem(K));if(!u||!emailOk(u.email)){localStorage.removeItem(K);return null;}return u;}catch{return null}}
  function emailOk(e){return new RegExp(window.PUST_CONFIG.emailRegex+"$","i").test((e||"").trim())}
  function endpoint(){return (localStorage.getItem("pust_drive_endpoint")||"").trim()}
  async function post(obj){
    const r=await fetch(endpoint(),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(obj)});
    if(!r.ok)throw new Error("Backend error "+r.status);
    return r.json();
  }
  // returns {mode:"mail"} or {mode:"demo", code}
  async function sendCode(email){
    email=email.trim().toLowerCase();
    if(!emailOk(email))throw new Error("Students only: use your student email (@s.pust.ac.bd). Teacher/admin emails (@pust.ac.bd) cannot log in.");
    if(endpoint()){
      const j=await post({type:"otp_send",email});
      if(!j.ok)throw new Error(j.error||"Could not send mail");
      localStorage.setItem(KC,JSON.stringify({email,mode:"mail",exp:Date.now()+10*60*1000}));
      return {mode:"mail"};
    }
    const code=String(Math.floor(100000+Math.random()*900000));
    localStorage.setItem(KC,JSON.stringify({email,mode:"demo",code,exp:Date.now()+10*60*1000}));
    return {mode:"demo",code};
  }
  async function verify(email,code){
    email=email.trim().toLowerCase();
    const o=JSON.parse(localStorage.getItem(KC)||"null");
    if(!o||o.email!==email)throw new Error("Send code first");
    if(Date.now()>o.exp)throw new Error("Code expired, resend");
    if(o.mode==="mail"){
      const j=await post({type:"otp_verify",email,code:code.trim()});
      if(!j.ok)throw new Error(j.error||"Wrong code");
      // ticket binds future review/report writes to this verified student (author never stored)
      try{if(j.ticket)localStorage.setItem("pust_ticket_v1",j.ticket);else localStorage.removeItem("pust_ticket_v1");}catch(e){}
    }else{
      if(o.code!==code.trim())throw new Error("Wrong code");
    }
    localStorage.setItem(K,JSON.stringify({email:o.email,at:new Date().toISOString()}));
    localStorage.removeItem(KC);
    return true;
  }
  function logout(){try{localStorage.removeItem(K);localStorage.removeItem("pust_ticket_v1");}catch(e){}location.href="index.html"}
  window.PUST_AUTH={user,emailOk,sendCode,verify,logout,hasBackend:()=>!!endpoint()};
})();
