// Shared UI helpers
(function(){
  function esc(s){return (s??"").toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function initials(name){return (name||"?").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
  function avatar(name,url,size=44){
    if(url)return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${esc(url)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`;
    return `<span class="avatar" style="width:${size}px;height:${size}px">${esc(initials(name))}</span>`;
  }
  function stars(v){v=Math.round(v);return "★★★★★".slice(0,v)+"☆☆☆☆☆".slice(0,5-v)}
  function qp(k){return new URLSearchParams(location.search).get(k)}
  function layout(active){
    const u=window.PUST_AUTH?.user();
    return `<header class="nav"><div class="nav-inner">
      <a class="brand" href="index.html"><img src="assets/logo.svg" alt="PUST"><span>PUST Teachers' Evaluation<small>Anonymous • PUST</small></span></a>
      <nav class="nav-links">
        <a class="btn btn-sm" href="departments.html">Departments</a>
        <a class="btn btn-sm" href="professors.html">Professors</a>
        <a class="btn btn-sm" href="reviews.html">Reviews</a>
        <a class="btn btn-sm" href="guidelines.html">Guidelines</a>
        ${u?`<a class="btn btn-sm" href="admin.html">Hi, ${esc(u.email.split("@")[0])}</a><button class="btn btn-sm" onclick="PUST_AUTH.logout()">Logout</button>`:`<a class="btn btn-sm" href="login.html">Login</a>`}
        <a class="btn btn-sm btn-primary" href="write-review.html">Write a review</a>
      </nav></div></header>`;
  }
  function footer(){
    const c=window.PUST_CONFIG;
    return `<footer class="footer"><div class="footer-inner">
      <div><b>${esc(c.appName)}</b><p class="muted" style="font-size:13px">${esc(c.tagline)}</p>
      <small>Public data + all reviews live in this GitHub repo (<code>/data/*.json</code>, <code>/data/reviews/shared.json</code>). Backend: <span id="sync-status">shared store</span> — see <a href="settings.html">Settings</a>.</small></div>
      <div><b style="font-size:12px">Explore</b><br><a href="departments.html">Departments</a><br><a href="professors.html">Professors</a><br><a href="reviews.html">Recent reviews</a></div>
      <div><b style="font-size:12px">Learn</b><br><a href="guidelines.html">Guidelines</a><br><a href="settings.html">Storage & Sync</a><br><a href="admin.html">Admin</a></div>
    </div><div class="wrap" style="padding-bottom:18px"><small class="muted">An initiative for PUST students. ${esc(c.disclaimer)} Data source: <a href="https://pust.ac.bd/">pust.ac.bd</a></small></div></footer>`;
  }
  function mount(active){document.body.insertAdjacentHTML("afterbegin",layout(active));document.body.insertAdjacentHTML("beforeend",footer());}
  async function helpful(id,btn){
    if(btn)btn.disabled=true;
    try{const ok=await window.PUST_DB.voteHelpful(id);if(!ok)alert("You already marked this helpful.");}
    catch(e){alert(e.message||"Could not save vote");}
    location.reload();
  }
  function reportDialog(reviewId){
    const d=document.createElement("dialog");
    d.innerHTML=`<form method="dialog" class="form"><h3>Report this review</h3><p class="muted">An admin will review your report.</p>
    ${["It's about me personally","Fake / spam review","Offensive content","Wrong professor","Other"].map(r=>`<label style="font-weight:500"><input type="radio" name="reason" value="${esc(r)}" required> ${esc(r)}</label>`).join("")}
    <label>Anything to add? (optional)<textarea name="details" rows="2"></textarea></label>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" value="cancel">Cancel</button><button class="btn btn-primary" id="repGo" value="ok">Submit report</button></div></form>`;
    document.body.appendChild(d);d.showModal();
    d.querySelector("#repGo").onclick=async(e)=>{
      const r=d.querySelector('input[name=reason]:checked');
      if(!r){e.preventDefault();alert("Choose a reason");return;}
      if(!window.PUST_AUTH?.user()){e.preventDefault();alert("Please log in with your student email to report.");location.href="login.html?next="+encodeURIComponent(location.pathname.split("/").pop()+location.search);return;}
      try{await window.PUST_DB.addReport(reviewId,r.value,d.querySelector('[name=details]').value);alert("Reported. Thank you.");}
      catch(e2){e.preventDefault();alert(e2.message||"Could not send report");}
    };
    d.addEventListener("close",()=>d.remove());
  }
  window.PUST_UI={esc,initials,avatar,stars,qp,mount,reportDialog,helpful};
})();
