// app.js — everything Lesson Locker does.
// It uses SUPABASE_URL and SUPABASE_KEY from config.js, which index.html loads first.
//
// This file has two parts:
//   PART 1: DATA. Every conversation with Supabase lives here.
//           If config.js isn't filled in yet, the app uses pretend data instead,
//           so you can click through every screen before Supabase exists.
//   PART 2: THE PAGE. Buttons, screens and lesson cards. It never talks to
//           Supabase directly, so it works the same with pretend data or a real database.

// =====================================================================
// PART 1: DATA
// =====================================================================

const NO_DATABASE = !SUPABASE_URL.startsWith("https://");
const db = NO_DATABASE ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = "lesson-files";
const PASSWORD_RULE = "Password should be at least 8 characters and include a lowercase letter, an uppercase letter and a number.";

// ---------- pretend data (used until Supabase is connected) ----------
const pretend = {
  user: null,
  listener: null,
  accounts: {},               // email -> { id, password }
  files: {},                  // file path -> the real file you picked
  nextId: 100,
  profiles: [
    { id: "t1", username: "ms_ahmed" },
    { id: "t2", username: "mr_lee" },
    { id: "t3", username: "ms_garcia" }
  ],
  lessons: [
    { id: 1, owner_id: "t1", title: "Persuasive Techniques in Ads", subject: "English", grade: "10",
      note: "Students sort real ads by ethos, pathos and logos. Always a hit.",
      file_path: "t1/ads.pdf", file_name: "persuasive-ads.pdf", visibility: "everyone", created_at: "2026-09-28T08:00:00Z" },
    { id: 2, owner_id: "t2", title: "Lab Safety Scenarios", subject: "Science", grade: "9",
      note: "Ten short what-would-you-do cards. Shared with you so you can borrow it.",
      file_path: "t2/lab.pptx", file_name: "lab-safety.pptx", visibility: "people", created_at: "2026-09-30T08:00:00Z" },
    { id: 3, owner_id: "t3", title: "Unit 3 Test (answer key)", subject: "Math", grade: "8",
      note: "Private. You should never see this one.",
      file_path: "t3/key.pdf", file_name: "unit3-key.pdf", visibility: "private", created_at: "2026-10-01T08:00:00Z" },
    { id: 4, owner_id: "t1", title: "Poetry Stations", subject: "English", grade: "9",
      note: "Shared with mr_lee only. You shouldn't see this one either.",
      file_path: "t1/poetry.pdf", file_name: "poetry-stations.pdf", visibility: "people", created_at: "2026-10-02T08:00:00Z" }
  ],
  shares: [
    { lesson_id: 4, shared_with: "t2" }
  ]
};

function passwordProblem(pw) {
  if (pw.length < 8 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return PASSWORD_RULE;
  return null;
}

function pretendSignIn(user) {
  pretend.user = user;
  // mr_lee's Lab Safety lesson is shared with whoever signs in, so "Shared with me" has something in it.
  if (!pretend.shares.some(function (s) { return s.lesson_id === 2 && s.shared_with === user.id; })) {
    pretend.shares.push({ lesson_id: 2, shared_with: user.id });
  }
  if (pretend.listener) pretend.listener(user);
}

function usernameOf(id) {
  const p = pretend.profiles.find(function (x) { return x.id === id; });
  return p ? p.username : "unknown";
}

// ---------- sign-in ----------

function onSignInChange(callback) {
  if (NO_DATABASE) {
    pretend.listener = callback;
    setTimeout(function () { callback(null); }, 0);   // start signed out
    return;
  }
  // Supabase tells us whenever someone signs in or out (including coming back from GitHub).
  db.auth.onAuthStateChange(function (event, session) {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    // setTimeout lets Supabase finish signing in before we ask it for more data.
    setTimeout(function () { callback(session ? session.user : null); }, 0);
  });
}

async function signInWithGitHub() {
  if (NO_DATABASE) {
    pretendSignIn({ id: "github-user", email: null, app_metadata: { provider: "github" } });
    return null;
  }
  const { error } = await db.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  return error;
}

async function signUp(email, password) {
  if (NO_DATABASE) {
    if (pretend.accounts[email]) return { error: { code: "user_already_exists" } };
    const problem = passwordProblem(password);
    if (problem) return { error: { code: "weak_password", message: problem } };
    const id = "user-" + (pretend.nextId++);
    pretend.accounts[email] = { id: id, password: password };
    pretendSignIn({ id: id, email: email, app_metadata: { provider: "email" } });
    return { error: null, needsConfirm: false };
  }
  const { data, error } = await db.auth.signUp({ email: email, password: password });
  return { error: error, needsConfirm: !error && !data.session };
}

async function signIn(email, password) {
  if (NO_DATABASE) {
    const acct = pretend.accounts[email];
    if (!acct || acct.password !== password) return { code: "invalid_credentials" };
    pretendSignIn({ id: acct.id, email: email, app_metadata: { provider: "email" } });
    return null;
  }
  const { error } = await db.auth.signInWithPassword({ email: email, password: password });
  return error;
}

async function signOut() {
  if (NO_DATABASE) {
    pretend.user = null;
    if (pretend.listener) pretend.listener(null);
    return;
  }
  await db.auth.signOut();
}

async function changePassword(password) {
  if (NO_DATABASE) {
    const problem = passwordProblem(password);
    if (problem) return { code: "weak_password", message: problem };
    const email = pretend.user.email;
    if (email && pretend.accounts[email]) pretend.accounts[email].password = password;
    return null;
  }
  const { error } = await db.auth.updateUser({ password: password });
  return error;
}

// ---------- usernames ----------

async function getUsername(userId) {
  if (NO_DATABASE) {
    const p = pretend.profiles.find(function (x) { return x.id === userId; });
    return { data: p ? p.username : null, error: null };
  }
  const { data, error } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
  return { data: data ? data.username : null, error: error };
}

async function saveUsername(userId, username) {
  if (NO_DATABASE) {
    if (pretend.profiles.some(function (p) { return p.username === username; })) return { code: "23505" };
    pretend.profiles.push({ id: userId, username: username });
    return null;
  }
  const { error } = await db.from("profiles").insert({ id: userId, username: username });
  return error;
}

async function findTeacher(username) {
  if (NO_DATABASE) {
    return { data: pretend.profiles.find(function (p) { return p.username === username; }) || null };
  }
  const { data } = await db.from("profiles").select("id, username").eq("username", username).maybeSingle();
  return { data: data };
}

// ---------- lessons ----------

async function getMyLessons(userId) {
  if (NO_DATABASE) {
    const mine = pretend.lessons
      .filter(function (l) { return l.owner_id === userId; })
      .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); })
      .map(function (l) {
        const people = pretend.shares
          .filter(function (s) { return s.lesson_id === l.id; })
          .map(function (s) { return { shared_with: s.shared_with, username: usernameOf(s.shared_with) }; });
        return Object.assign({}, l, { people: people });
      });
    return { data: mine, error: null };
  }

  const { data: lessons, error } = await db
    .from("lessons")
    .select("id, title, subject, grade, note, file_path, file_name, visibility, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: error };

  // Who has each lesson been shared with?
  const ids = lessons.map(function (l) { return l.id; });
  const { data: shares } = await db
    .from("lesson_shares")
    .select("lesson_id, shared_with, profiles(username)")
    .in("lesson_id", ids);

  lessons.forEach(function (l) {
    l.people = (shares || [])
      .filter(function (s) { return s.lesson_id === l.id; })
      .map(function (s) { return { shared_with: s.shared_with, username: s.profiles ? s.profiles.username : "unknown" }; });
  });
  return { data: lessons, error: null };
}

async function addLesson(userId, fields, file) {
  // Every teacher's files go in a folder named after their user id.
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = userId + "/" + Date.now() + "-" + safeName;

  if (NO_DATABASE) {
    pretend.files[path] = file;
    pretend.lessons.push(Object.assign({
      id: pretend.nextId++, owner_id: userId, file_path: path, file_name: file.name,
      visibility: "private", created_at: new Date().toISOString()
    }, fields));
    return null;
  }

  const upload = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (upload.error) return { code: "upload_failed", message: upload.error.message };

  const { error } = await db.from("lessons").insert(Object.assign({
    owner_id: userId, file_path: path, file_name: file.name
  }, fields));
  if (error) {
    await db.storage.from(BUCKET).remove([path]);   // don't leave a file with no lesson
    return error;
  }
  return null;
}

async function setVisibility(lessonId, visibility) {
  if (NO_DATABASE) {
    pretend.lessons.find(function (l) { return l.id === lessonId; }).visibility = visibility;
    return null;
  }
  const { error } = await db.from("lessons").update({ visibility: visibility }).eq("id", lessonId);
  return error;
}

async function deleteLesson(lessonId, path) {
  if (NO_DATABASE) {
    pretend.lessons = pretend.lessons.filter(function (l) { return l.id !== lessonId; });
    pretend.shares = pretend.shares.filter(function (s) { return s.lesson_id !== lessonId; });
    delete pretend.files[path];
    return null;
  }
  const { error } = await db.from("lessons").delete().eq("id", lessonId);
  if (error) return error;
  await db.storage.from(BUCKET).remove([path]);
  return null;
}

async function addShare(lessonId, teacherId) {
  if (NO_DATABASE) {
    if (pretend.shares.some(function (s) { return s.lesson_id === lessonId && s.shared_with === teacherId; })) {
      return { code: "23505" };
    }
    pretend.shares.push({ lesson_id: lessonId, shared_with: teacherId });
    return null;
  }
  const { error } = await db.from("lesson_shares").insert({ lesson_id: lessonId, shared_with: teacherId });
  return error;
}

async function removeShare(lessonId, teacherId) {
  if (NO_DATABASE) {
    pretend.shares = pretend.shares.filter(function (s) { return !(s.lesson_id === lessonId && s.shared_with === teacherId); });
    return null;
  }
  const { error } = await db.from("lesson_shares").delete().eq("lesson_id", lessonId).eq("shared_with", teacherId);
  return error;
}

async function getSharedWithMe(userId) {
  if (NO_DATABASE) {
    // The same rules Supabase will use: shared with everyone, or shared with you.
    const visible = pretend.lessons
      .filter(function (l) {
        if (l.owner_id === userId) return false;
        if (l.visibility === "everyone") return true;
        if (l.visibility === "people") {
          return pretend.shares.some(function (s) { return s.lesson_id === l.id && s.shared_with === userId; });
        }
        return false;
      })
      .sort(function (a, b) { return b.created_at.localeCompare(a.created_at); })
      .map(function (l) { return Object.assign({}, l, { owner_name: usernameOf(l.owner_id) }); });
    return { data: visible, error: null };
  }

  // Row-Level Security only sends back lessons this person is allowed to see.
  const { data, error } = await db
    .from("lessons")
    .select("id, title, subject, grade, note, file_path, file_name, visibility, created_at, owner:profiles(username)")
    .neq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (data) data.forEach(function (l) { l.owner_name = l.owner ? l.owner.username : "unknown"; });
  return { data: data, error: error };
}

// Files are private, so we ask Supabase for a link that works for 60 seconds.
// Supabase only gives the link if the bucket rules say this person may see the file.
async function getFileLink(path) {
  if (NO_DATABASE) {
    const file = pretend.files[path];
    if (!file) return { data: null, error: { code: "sample_lesson" } };
    return { data: URL.createObjectURL(file), error: null };
  }
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
  return { data: data ? data.signedUrl : null, error: error };
}

// =====================================================================
// PART 2: THE PAGE
// =====================================================================

let currentUser = null;   // who is signed in
let myUsername = null;    // their username

const MAX_FILE_SIZE = 10 * 1024 * 1024;          // 10 MB, the same limit the bucket uses
const ALLOWED_ENDINGS = [".pdf", ".docx", ".pptx"];
const VISIBILITY_LABELS = { private: "Private", people: "Shared with people", everyone: "Everyone" };

function $(id) { return document.getElementById(id); }

function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function showMsg(id, text, isError) {
  const box = $(id);
  box.textContent = text;
  box.className = "msg " + (isError ? "err" : "ok");
}

function showScreen(name) {
  ["signInScreen", "usernameScreen", "appScreen"].forEach(function (s) {
    $(s).hidden = (s !== name);
  });
  $("whoBox").hidden = (name === "signInScreen");
}

function niceDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ---------- start up ----------

$("noDbBanner").hidden = !NO_DATABASE;
onSignInChange(handleUser);

async function handleUser(user) {
  if (!user) {
    currentUser = null;
    myUsername = null;
    showScreen("signInScreen");
    return;
  }

  currentUser = user;
  $("whoName").textContent = user.email || "you";

  // Does this person have a username yet?
  const { data: username, error } = await getUsername(user.id);
  if (error) {
    showScreen("signInScreen");
    showMsg("signInMsg", "Couldn't load your profile. Check your tables and policies.", true);
    return;
  }
  if (!username) {
    $("usernameInput").value = "";
    $("usernameMsg").textContent = "";
    showScreen("usernameScreen");
    return;
  }

  myUsername = username;
  $("whoName").textContent = myUsername;
  showScreen("appScreen");
  setUpSettings();
  switchView("mine");
}

// ---------- screen 1: sign in ----------

$("githubBtn").addEventListener("click", async function () {
  const error = await signInWithGitHub();
  if (error) showMsg("signInMsg", "GitHub sign-in didn't start: " + error.message, true);
});

$("signUpBtn").addEventListener("click", async function () {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) { showMsg("signInMsg", "Type an email and a password first.", true); return; }

  const result = await signUp(email, password);
  if (result.error) {
    if (result.error.code === "user_already_exists") {
      showMsg("signInMsg", "That email already has an account. Click Sign in instead.", true);
    } else {
      showMsg("signInMsg", result.error.message, true);   // Supabase explains which password rule is missing
    }
    return;
  }
  if (result.needsConfirm) {
    showMsg("signInMsg", "Account made, but Supabase wants an email confirmation. Turn off Confirm email in Supabase for this build.", true);
  }
  $("password").value = "";
});

$("signInBtn").addEventListener("click", async function () {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) { showMsg("signInMsg", "Type your email and password.", true); return; }
  const error = await signIn(email, password);
  if (error) { showMsg("signInMsg", "That email or password is wrong.", true); return; }
  $("password").value = "";
  $("signInMsg").textContent = "";
});

$("signOutBtn").addEventListener("click", signOut);

// ---------- screen 2: pick a username ----------

$("saveUsernameBtn").addEventListener("click", async function () {
  const username = $("usernameInput").value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showMsg("usernameMsg", "Use 3 to 20 lowercase letters, numbers or underscores.", true);
    return;
  }
  const error = await saveUsername(currentUser.id, username);
  if (error) {
    showMsg("usernameMsg", error.code === "23505"
      ? "Someone already has that username. Try another one."
      : "That didn't save: " + error.message, true);
    return;
  }
  handleUser(currentUser);
});

// ---------- tabs ----------

document.querySelectorAll(".tab").forEach(function (tab) {
  tab.addEventListener("click", function () { switchView(tab.dataset.view); });
});

function switchView(view) {
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.toggle("on", t.dataset.view === view);
  });
  ["mine", "library", "settings"].forEach(function (v) {
    $("view-" + v).hidden = (v !== view);
  });
  if (view === "mine") showMyLessons();
  if (view === "library") showLibrary();
}

// ---------- screen 3: my lessons ----------

$("uploadBtn").addEventListener("click", async function () {
  const title = $("lessonTitle").value.trim();
  const file = $("lessonFile").files[0];

  if (!title) { showMsg("uploadMsg", "Give your lesson a title.", true); return; }
  if (!file) { showMsg("uploadMsg", "Choose a file to upload.", true); return; }

  const ending = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED_ENDINGS.includes(ending)) {
    showMsg("uploadMsg", "Only PDF, Word (.docx) or PowerPoint (.pptx) files.", true);
    return;
  }
  if (file.size > MAX_FILE_SIZE) { showMsg("uploadMsg", "That file is bigger than 10 MB.", true); return; }

  const btn = $("uploadBtn");
  btn.disabled = true;
  showMsg("uploadMsg", "Uploading...", false);

  const error = await addLesson(currentUser.id, {
    title: title,
    subject: $("lessonSubject").value.trim(),
    grade: $("lessonGrade").value.trim(),
    note: $("lessonNote").value.trim()
  }, file);

  btn.disabled = false;
  if (error) {
    showMsg("uploadMsg", error.code === "upload_failed"
      ? "The file didn't upload. It may be too big or the wrong type."
      : "The lesson didn't save: " + error.message, true);
    return;
  }

  ["lessonTitle", "lessonSubject", "lessonGrade", "lessonNote", "lessonFile"].forEach(function (id) { $(id).value = ""; });
  showMsg("uploadMsg", "Uploaded. It's private until you share it.", false);
  showMyLessons();
});

async function showMyLessons() {
  const box = $("myLessons");
  const { data: lessons, error } = await getMyLessons(currentUser.id);
  if (error) { box.innerHTML = '<div class="empty">Couldn\'t load your lessons.</div>'; return; }
  if (lessons.length === 0) { box.innerHTML = '<div class="empty">No lessons yet. Add your first one above.</div>'; return; }
  box.innerHTML = lessons.map(myLessonHTML).join("");
}

function myLessonHTML(l) {
  const options = ["private", "people", "everyone"].map(function (v) {
    return '<option value="' + v + '"' + (l.visibility === v ? " selected" : "") + ">" + VISIBILITY_LABELS[v] + "</option>";
  }).join("");

  let sharesBox = "";
  if (l.visibility === "people") {
    const chips = l.people.length === 0
      ? '<p class="hint">Not shared with anyone yet. Add a teacher by username.</p>'
      : l.people.map(function (p) {
          return '<span class="chip">' + escapeHTML(p.username) +
            '<button title="Stop sharing" data-action="unshare" data-lesson="' + l.id +
            '" data-user="' + escapeHTML(p.shared_with) + '">&times;</button></span>';
        }).join("");
    sharesBox =
      '<div class="shares"><b>Shared with:</b><div>' + chips + '</div>' +
      '<div class="addrow"><input placeholder="username" id="share-' + l.id + '">' +
      '<button class="small" data-action="share" data-lesson="' + l.id + '">Share</button></div>' +
      '<div class="msg" id="shareMsg-' + l.id + '"></div></div>';
  }

  return '<div class="lesson">' +
    '<h3>' + escapeHTML(l.title) + ' <span class="badge ' + l.visibility + '">' + VISIBILITY_LABELS[l.visibility] + '</span></h3>' +
    '<div class="meta">' + escapeHTML([l.subject, l.grade, niceDate(l.created_at)].filter(Boolean).join(" · ")) + '</div>' +
    (l.note ? '<p class="note">' + escapeHTML(l.note) + '</p>' : "") +
    '<div class="lessonbar">' +
      '<button class="ghost small" data-action="open" data-path="' + escapeHTML(l.file_path) + '">Open ' + escapeHTML(l.file_name) + '</button>' +
      '<select data-action="visibility" data-lesson="' + l.id + '">' + options + '</select>' +
      '<button class="danger small" data-action="delete" data-lesson="' + l.id + '" data-path="' + escapeHTML(l.file_path) + '">Delete</button>' +
    '</div>' + sharesBox +
  '</div>';
}

// One listener handles every button on every lesson card.
$("myLessons").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const lessonId = Number(btn.dataset.lesson);

  if (action === "open") openFile(btn.dataset.path);
  if (action === "delete") removeLesson(lessonId, btn.dataset.path);
  if (action === "share") shareWith(lessonId, $("share-" + lessonId).value);
  if (action === "unshare") stopSharing(lessonId, btn.dataset.user);
});

$("myLessons").addEventListener("change", async function (e) {
  if (e.target.dataset.action !== "visibility") return;
  const error = await setVisibility(Number(e.target.dataset.lesson), e.target.value);
  if (error) alert("That didn't change: " + error.message);
  showMyLessons();
});

async function shareWith(lessonId, typedName) {
  const username = typedName.trim().toLowerCase();
  const msgId = "shareMsg-" + lessonId;
  if (!username) { showMsg(msgId, "Type a username.", true); return; }
  if (username === myUsername) { showMsg(msgId, "That's you.", true); return; }

  const { data: person } = await findTeacher(username);
  if (!person) { showMsg(msgId, "No teacher has that username.", true); return; }

  const error = await addShare(lessonId, person.id);
  if (error) {
    showMsg(msgId, error.code === "23505" ? "Already shared with them." : "That didn't work: " + error.message, true);
    return;
  }
  showMyLessons();
}

async function stopSharing(lessonId, teacherId) {
  await removeShare(lessonId, teacherId);
  showMyLessons();
}

async function removeLesson(lessonId, path) {
  if (!confirm("Delete this lesson and its file? This can't be undone.")) return;
  const error = await deleteLesson(lessonId, path);
  if (error) { alert("That didn't delete: " + error.message); return; }
  showMyLessons();
}

async function openFile(path) {
  const tab = window.open("", "_blank");
  const { data: link, error } = await getFileLink(path);
  if (error) {
    if (tab) tab.close();
    alert(error.code === "sample_lesson"
      ? "This is a sample lesson with no real file. Upload your own to try opening one."
      : "You can't open that file.");
    return;
  }
  if (tab) tab.location = link;
  else window.location = link;
}

// ---------- screen 4: shared with me ----------

async function showLibrary() {
  const box = $("libraryLessons");
  const { data: lessons, error } = await getSharedWithMe(currentUser.id);
  if (error) { box.innerHTML = '<div class="empty">Couldn\'t load shared lessons.</div>'; return; }
  if (lessons.length === 0) { box.innerHTML = '<div class="empty">Nobody has shared a lesson with you yet.</div>'; return; }

  box.innerHTML = lessons.map(function (l) {
    const how = l.visibility === "everyone" ? "Everyone" : "Shared with you";
    return '<div class="lesson">' +
      '<h3>' + escapeHTML(l.title) + ' <span class="badge ' + l.visibility + '">' + how + '</span></h3>' +
      '<div class="meta">Shared by <b>' + escapeHTML(l.owner_name) + '</b> · ' +
        escapeHTML([l.subject, l.grade, niceDate(l.created_at)].filter(Boolean).join(" · ")) + '</div>' +
      (l.note ? '<p class="note">' + escapeHTML(l.note) + '</p>' : "") +
      '<div class="lessonbar"><button class="ghost small" data-path="' + escapeHTML(l.file_path) + '">Open ' +
        escapeHTML(l.file_name) + '</button></div>' +
    '</div>';
  }).join("");
}

$("libraryLessons").addEventListener("click", function (e) {
  const btn = e.target.closest("button[data-path]");
  if (btn) openFile(btn.dataset.path);
});

// ---------- screen 5: settings ----------

function setUpSettings() {
  const usesGitHub = currentUser.app_metadata && currentUser.app_metadata.provider === "github";
  $("passwordBox").hidden = usesGitHub;
  $("githubPasswordNote").hidden = !usesGitHub;
  $("passwordMsg").textContent = "";
}

$("changePasswordBtn").addEventListener("click", async function () {
  const password = $("newPassword").value;
  if (!password) { showMsg("passwordMsg", "Type a new password.", true); return; }
  const error = await changePassword(password);
  if (error) { showMsg("passwordMsg", error.message, true); return; }
  $("newPassword").value = "";
  showMsg("passwordMsg", "Password changed.", false);
});
