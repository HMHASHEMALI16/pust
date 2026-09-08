// PUST Evaluation — data layer (GitHub-shared)
// PUBLIC (in repo, readable by everyone, no login):
//   data/departments.json, data/professors.json, data/questions.json
//   data/reviews/shared.json  <- ALL reviews/comments (canonical, committed by backend)
//   data/reviews/reports.json <- ALL reports queue (canonical)
// WRITE path (verified students only, token never in frontend):
//   browser --ticket--> Apps Script /exec --GH_TOKEN--> GitHub Contents API (commit)
// OFFLINE: local pending queue in localStorage, flushed when backend reachable.
(function(){
  const LS_R="pust_reviews_v1", LS_RC="pust_receipts_v1", LS_H="pust_helpful_v1",
        LS_REP="pust_reports_v1", LS_S="pust_shared_v1", LS_T="pust_ticket_v1";
  const $c=()=>window.PUST_CONFIG;
  const backend=()=>((localStorage.getItem("pust_drive_endpoint")||"")||$c().backendDefault||"").trim();
  const gh=()=>({owner:$c().githubOwner||"HMHASHEMALI16",repo:$c().githubRepo||"pust",branch:$c().githubBranch||"main"});
  async function getJSON(p){const r=await fetch(p,{cache:"no-store"});if(!r.ok)throw new Error("load "+p);return r.json();}
  function ls(k,f){try{const v=JSON.parse(localStorage.getItem(k));return v??f}catch{return f}}
  function ss(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function ticket(){try{return localStorage.getItem(LS_T)||""}catch{return ""}}

  async function loadPublic(){
    const [departments,professors,questions]=await Promise.all([
      getJSON($c().dataFiles.departments),getJSON($c().dataFiles.professors),getJSON($c().dataFiles.questions)
    ]);
    try{
      if(!localStorage.getItem(LS_R)){
        const r=await fetch("data/reviews/seed.json",{cache:"no-store"});
        if(r.ok){const seed=await r.json();if(Array.isArray(seed)&&seed.length)ss(LS_R,seed);}
      }
    }catch(e){}
    return {departments:departments.departments||departments,professors:professors.professors||professors,questions};
  }

  // ---- shared (GitHub) ----
  // retry locally-queued (pending) reviews — heals a failed sync on the next page visit (logged in only)
  async function flushPending(){
    if(!ticket())return;
    const shIds=new Set((shared().reviews||[]).map(r=>r.id));
    const local=ls(LS_R,[]);
    let changed=false;
    for(const r of local.slice(0,10)){
      if(!r.pending||r.removed||shIds.has(r.id)){if(shIds.has(r.id)&&r.pending){r.pending=false;changed=true;}continue;}
      try{
        const {pending,...clean}=r;
        const j=await postBE({type:"review_add",ticket:ticket(),review:clean});
        if(j.ok){r.pending=false;changed=true;}
      }catch(e){/* keep pending, retry later */}
    }
    if(changed)saveLocal(local);
  }
  async function refresh(){
    await fetchShared();
    flushPending().catch(()=>{});
    return shared();
  }
  async function fetchShared(){
    try{
      const g=gh();
      const base=`https://raw.githubusercontent.com/${g.owner}/${g.repo}/${g.branch}`;
      const [sh,rp]=await Promise.all([
        fetch(base+"/data/reviews/shared.json?v="+Date.now()).then(r=>r.ok?r.json():[]).catch(()=>[]),
        fetch(base+"/data/reviews/reports.json?v="+Date.now()).then(r=>r.ok?r.json():[]).catch(()=>[])
      ]);
      ss(LS_S,{reviews:Array.isArray(sh)?sh:[],reports:Array.isArray(rp)?rp:[],at:new Date().toISOString()});
    }catch(e){}
    return shared();
  }
  function shared(){const s=ls(LS_S,null);return s||{reviews:[],reports:[]};}

  // merged view: shared first, then local-only (pending/offline/seed) not yet in shared
  function reviews(){
    const sh=shared().reviews||[];
    const ids=new Set(sh.map(r=>r.id));
    const local=ls(LS_R,[]).filter(r=>!ids.has(r.id)&&!r.removed);
    const voted=ls(LS_H,{});
    const bump=id=>voted[id]?1:0;
    return sh.filter(r=>!r.removed).map(r=>({...r,helpful_count:(r.helpful_count||0)+bump(r.id)}))
      .concat(local.map(r=>({...r,pending:true,helpful_count:(r.helpful_count||0)+bump(r.id)})));
  }
  function reports(){
    const sh=shared().reports||[];
    const ids=new Set(sh.map(r=>r.id));
    return sh.concat(ls(LS_REP,[]).filter(r=>!ids.has(r.id)));
  }
  function saveLocal(a){ss(LS_R,a);}
  function receipts(){return ls(LS_RC,[])}
  function normCourse(s){return (s||"").toLowerCase().trim().replace(/\s+/g," ")}
  function overallOf(ratings){const v=Object.values(ratings);return v.length?Math.round((v.reduce((a,b)=>a+b,0)/v.length)*10)/10:0}
  function profStats(profId){
    const rs=reviews().filter(r=>String(r.professor_id)===String(profId)&&!r.removed);
    if(!rs.length)return{count:0,overall:0,avg:{}};
    const keys=Object.keys(rs[0].ratings||{});
    const avg={};keys.forEach(k=>{avg[k]=Math.round((rs.reduce((a,r)=>a+(r.ratings[k]||0),0)/rs.length)*10)/10});
    return{count:rs.length,overall:Math.round((rs.reduce((a,r)=>a+(+r.overall||0),0)/rs.length)*10)/10,avg};
  }
  function canReview(profId,course){
    const u=window.PUST_AUTH?.user();
    if(!u)return{ok:false,reason:"login"};
    if(receipts().includes(`${u.email}::${profId}::${normCourse(course)}`))return{ok:false,reason:"duplicate"};
    return{ok:true};
  }
  async function postBE(obj){
    const ep=backend();if(!ep)throw new Error("noconfig");
    // text/plain = CORS simple request (no preflight); Apps Script reads raw body either way
    const r=await fetch(ep,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(obj)});
    if(!r.ok)throw new Error("backend "+r.status);
    return r.json();
  }
  async function addReview({professor_id,course_code,academic_year,ratings,comment}){
    const chk=canReview(professor_id,course_code);
    if(!chk.ok)throw new Error(chk.reason);
    const u=window.PUST_AUTH.user();
    const rev={id:"r_"+Date.now().toString(36)+Math.floor(Math.random()*1e6),professor_id:String(professor_id),course_code,academic_year,ratings,overall:overallOf(ratings),comment:comment||"",helpful_count:0,created_at:new Date().toISOString().slice(0,10)};
    const all=ls(LS_R,[]);all.unshift(rev);saveLocal(all);
    ss(LS_RC,receipts().concat(`${u.email}::${professor_id}::${normCourse(course_code)}`));
    // push to shared GitHub store (ticket proves verified student; author never stored)
    try{
      const j=await postBE({type:"review_add",ticket:ticket(),review:rev});
      if(!j.ok)throw new Error(j.error||"not saved");
      rev.pending=false;saveLocal(all);
      refresh().catch(()=>{});
    }catch(e){
      if(e.message==="noconfig")rev.pending=true; // demo/offline: stays local until backend set
      else rev.pending=true;
      saveLocal(all);
      if(e.message!=="noconfig")throw new Error("Saved locally, shared sync failed: "+e.message);
    }
    return rev;
  }
  async function voteHelpful(id){
    const h=ls(LS_H,{});if(h[id])return false;
    h[id]=1;ss(LS_H,h);
    try{await postBE({type:"helpful",ticket:ticket(),id});}catch(e){/* counted locally, backend confirms later */}
    refresh().catch(()=>{});
    return true;
  }
  async function addReport(review_id,reason,details){
    const rep={id:"rep_"+Date.now().toString(36),review_id,reason,details:details||"",status:"pending",created_at:new Date().toISOString()};
    ss(LS_REP,ls(LS_REP,[]).concat(rep));
    try{await postBE({type:"report_add",ticket:ticket(),report:rep});}catch(e){if(e.message!=="noconfig")throw e;}
    refresh().catch(()=>{});
    return true;
  }
  async function moderate(action,id,adminKey){
    const j=await postBE({type:"moderate",action,id,adminKey});
    if(!j.ok)throw new Error(j.error||"moderation failed");
    await refresh();
    return true;
  }
  // legacy: flush local snapshot (Drive Sheet backup) if backend in drive mode
  let syncT=null;
  function queueSync(){clearTimeout(syncT);syncT=setTimeout(syncNow,1500);}
  async function syncNow(){
    try{
      const ep=backend();if(!ep){setSync("local only — set backend URL in Settings for shared GitHub store");return;}
      if($c().storage.mode==="github"&&$c().storage.github.token){await syncGitHubDirect();setSync("Synced (github direct) "+new Date().toLocaleTimeString());return;}
      await postBE({type:"sync",reviews:ls(LS_R,[]),reports:ls(LS_REP,[]),at:new Date().toISOString()});
      await refresh();
      setSync("Synced (shared GitHub store) "+new Date().toLocaleTimeString());
    }catch(e){setSync("Sync note: "+e.message);}
  }
  function setSync(t){const el=document.getElementById("sync-status");if(el)el.textContent=t;}
  async function syncGitHubDirect(){
    const g={...gh(),token:$c().storage.github.token,path:$c().storage.github.path||"data/reviews"};
    if(!g.token)throw new Error("GitHub not configured");
    const path=`${g.path}/browser-${btoa(window.PUST_AUTH?.user()?.email||"anon").replace(/=/g,"")}.json`;
    const content=btoa(unescape(encodeURIComponent(JSON.stringify({updated:new Date().toISOString(),reviews:ls(LS_R,[]),reports:ls(LS_REP,[])} ,null,2))));
    let sha=null;
    const get=await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/contents/${path}?ref=${g.branch}`,{headers:{Authorization:`Bearer ${g.token}`,Accept:"application/vnd.github+json"}});
    if(get.ok){sha=(await get.json()).sha;}
    const put=await fetch(`https://api.github.com/repos/${g.owner}/${g.repo}/contents/${path}`,{method:"PUT",headers:{Authorization:`Bearer ${g.token}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},body:JSON.stringify({message:"PUST reviews sync "+new Date().toISOString(),content,branch:g.branch,sha})});
    if(!put.ok)throw new Error("GitHub PUT failed "+put.status);
  }
  function exportAll(){return JSON.stringify({reviews:reviews(),reports:reports(),exported:new Date().toISOString()},null,2)}
  function importAll(txt){const j=JSON.parse(txt);if(j.reviews)saveLocal(j.reviews);if(j.reports)ss(LS_REP,j.reports);}
  window.PUST_DB={loadPublic,refresh,reviews,reports,profStats,canReview,addReview,voteHelpful,addReport,moderate,exportAll,importAll,syncNow,normCourse,overallOf,backend,hasBackend:()=>!!backend()};
})();
