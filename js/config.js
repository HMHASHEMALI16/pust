// PUST Evaluation — shared config
// Public data lives in GitHub repo under /data/*.json
// Private/user data: localStorage by default, optional GitHub + Google Drive sync (see settings.html)
window.PUST_CONFIG = {
  appName: "PUST Teachers' Evaluation",
  tagline: "Anonymous ratings and reviews of PUST teachers and courses",
  emailDomain: "s.pust.ac.bd",
  // Students only: xxxx@s.pust.ac.bd (extra s = student).
  // Teachers/admins use @pust.ac.bd (no s) and are BLOCKED from login.
  emailRegex: "@([a-z0-9-]+\\.)*s\\.pust\\.ac\\.bd$",
  orgName: "PUST Students' Initiative",
  orgLink: "https://pust.ac.bd/",
  disclaimer: "Reviews are the opinions of individual students. This platform does not write, verify, or endorse the reviews.",
  dataFiles: {
    departments: "data/departments.json",
    professors: "data/professors.json",
    questions: "data/questions.json"
  },
  // Shared GitHub store (canonical reviews/comments live in this repo):
  githubOwner: "HMHASHEMALI16",
  githubRepo: "pust",
  githubBranch: "main",
  // Site owner: paste your Apps Script /exec URL here BEFORE pushing, so every
  // visitor shares one backend (mail OTP + review commits). Visitors can still
  // override it per-browser in Settings. Empty = local demo mode.
  backendDefault: "",
  // Storage adapters: 'local' | 'github' | 'drive' (reviews only; public data always in repo)
  storage: {
    mode: localStorage.getItem("pust_store_mode") || "local",
    github: {
      owner: localStorage.getItem("pust_gh_owner") || "",
      repo: localStorage.getItem("pust_gh_repo") || "",
      branch: localStorage.getItem("pust_gh_branch") || "main",
      token: localStorage.getItem("pust_gh_token") || "",
      path: "data/reviews"
    },
    driveEndpoint: localStorage.getItem("pust_drive_endpoint") || ""
  }
};
