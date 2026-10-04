// app.js — everything Lesson Locker does.
// It uses SUPABASE_URL and SUPABASE_KEY from config.js, which index.html loads first.

let db = null;            // the connection to Supabase
let currentUser = null;   // who is signed in (from Supabase Auth)
let myUsername = null;    // their username (from the profiles table)

const MAX_FILE_SIZE = 10 * 1024 * 1024;          // 10 MB, the same limit the bucket uses
const ALLOWED_ENDINGS = [".pdf", ".docx", ".pptx"];

// ---------- small helpers ----------

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
  ["setupScreen", "signInScreen", "usernameScreen", "appScreen"].forEach(function (s) {
    $(s).hidden = (s !== name);
  });
  $("whoBox").hidden = !(name === "appScreen" || name === "usernameScreen");
}

function niceDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const VISIBILITY_LABELS = { private: "Private", people: "Shared with people", everyone: "Everyone" };

// ---------- start up ----------

if (!SUPABASE_URL.startsWith("https://")) {
  showScreen("setupScreen");
} else {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Supabase tells us whenever someone signs in or out (including coming back from GitHub).
  db.auth.onAuthStateChange(function (event, session) {
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
    // setTimeout lets Supabase finish signing in before we ask it for more data.
    setTimeout(function () { handleSession(session); }, 0);
  });
}

async function handleSession(session) {
  if (!session) {
    currentUser = null;
    myUsername = null;
    showScreen("signInScreen");
    return;
  }

  currentUser = session.user;
  $("whoName").textContent = currentUser.email || "you";

  // Does this person have a username yet?
  const { data, error } = await db
    .from("profiles")
    .select("username")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    showScreen("signInScreen");
    showMsg("signInMsg", "Couldn't load your profile. Check your tables and policies.", true);
    return;
  }

  if (!data) {
    showScreen("usernameScreen");
    return;
  }

  myUsername = data.username;
  $("whoName").textContent = myUsername;
  showScreen("appScreen");
  setUpSettings();
  switchView("mine");
}

// ---------- screen 1: sign in ----------

$("githubBtn").addEventListener("click", async function () {
  const { error } = await db.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showMsg("signInMsg", "GitHub sign-in didn't start: " + error.message, true);
});

$("signUpBtn").addEventListener("click", async function () {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) {
    showMsg("signInMsg", "Type an email and a password first.", true);
    return;
  }
  const { data, error } = await db.auth.signUp({ email: email, password: password });
  if (error) {
    if (error.code === "user_already_exists") {
      showMsg("signInMsg", "That email already has an account. Click Sign in instead.", true);
    } else {
      // Supabase checks the password rules, and explains what's missing.
      showMsg("signInMsg", error.message, true);
    }
    return;
  }
  if (!data.session) {
    showMsg("signInMsg", "Account made, but Supabase wants an email confirmation. Turn off Confirm email in Supabase for this build.", true);
  }
});

$("signInBtn").addEventListener("click", async function () {
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) {
    showMsg("signInMsg", "Type your email and password.", true);
    return;
  }
  const { error } = await db.auth.signInWithPassword({ email: email, password: password });
  if (error) showMsg("signInMsg", "That email or password is wrong.", true);
});

$("signOutBtn").addEventListener("click", async function () {
  await db.auth.signOut();
});

// ---------- screen 2: pick a username ----------

$("saveUsernameBtn").addEventListener("click", async function () {
  const username = $("usernameInput").value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showMsg("usernameMsg", "Use 3 to 20 lowercase letters, numbers or underscores.", true);
    return;
  }
  const { error } = await db.from("profiles").insert({ id: currentUser.id, username: username });
  if (error) {
    if (error.code === "23505") {
      showMsg("usernameMsg", "Someone already has that username. Try another one.", true);
    } else {
      showMsg("usernameMsg", "That didn't save: " + error.message, true);
    }
    return;
  }
  handleSession({ user: currentUser });
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
  if (view === "mine") loadMyLessons();
  if (view === "library") loadLibrary();
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
  if (file.size > MAX_FILE_SIZE) {
    showMsg("uploadMsg", "That file is bigger than 10 MB.", true);
    return;
  }

  const btn = $("uploadBtn");
  btn.disabled = true;
  showMsg("uploadMsg", "Uploading...", false);

  // Every teacher's files go in a folder named after their user id.
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = currentUser.id + "/" + Date.now() + "-" + safeName;

  const upload = await db.storage.from("lesson-files").upload(path, file, { contentType: file.type });
  if (upload.error) {
    btn.disabled = false;
    showMsg("uploadMsg", "The file didn't upload. It may be too big or the wrong type.", true);
    return;
  }

  const { error } = await db.from("lessons").insert({
    owner_id: currentUser.id,
    title: title,
    subject: $("lessonSubject").value.trim(),
    grade: $("lessonGrade").value.trim(),
    note: $("lessonNote").value.trim(),
    file_path: path,
    file_name: file.name
  });

  btn.disabled = false;
  if (error) {
    await db.storage.from("lesson-files").remove([path]);   // don't leave a file with no lesson
    showMsg("uploadMsg", "The lesson didn't save: " + error.message, true);
    return;
  }

  ["lessonTitle", "lessonSubject", "lessonGrade", "lessonNote", "lessonFile"].forEach(function (id) {
    $(id).value = "";
  });
  showMsg("uploadMsg", "Uploaded. It's private until you share it.", false);
  loadMyLessons();
});

async function loadMyLessons() {
  const box = $("myLessons");

  const { data: lessons, error } = await db
    .from("lessons")
    .select("id, title, subject, grade, note, file_path, file_name, visibility, created_at")
    .eq("owner_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = '<div class="empty">Couldn\'t load your lessons.</div>';
    return;
  }
  if (lessons.length === 0) {
    box.innerHTML = '<div class="empty">No lessons yet. Add your first one above.</div>';
    return;
  }

  // Who has each lesson been shared with?
  const ids = lessons.map(function (l) { return l.id; });
  const { data: shares } = await db
    .from("lesson_shares")
    .select("lesson_id, shared_with, profiles(username)")
    .in("lesson_id", ids);

  box.innerHTML = lessons.map(function (l) {
    const people = (shares || []).filter(function (s) { return s.lesson_id === l.id; });
    return myLessonHTML(l, people);
  }).join("");
}

function myLessonHTML(l, people) {
  const options = ["private", "people", "everyone"].map(function (v) {
    return '<option value="' + v + '"' + (l.visibility === v ? " selected" : "") + ">" +
      VISIBILITY_LABELS[v] + "</option>";
  }).join("");

  let sharesBox = "";
  if (l.visibility === "people") {
    const chips = people.length === 0
      ? '<p class="hint">Not shared with anyone yet. Add a teacher by username.</p>'
      : people.map(function (p) {
          return '<span class="chip">' + escapeHTML(p.profiles ? p.profiles.username : "unknown") +
            '<button title="Stop sharing" data-action="unshare" data-lesson="' + l.id +
            '" data-user="' + p.shared_with + '">&times;</button></span>';
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
$("myLessons").addEventListener("click", async function (e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const lessonId = Number(btn.dataset.lesson);

  if (action === "open") openFile(btn.dataset.path);
  if (action === "delete") deleteLesson(lessonId, btn.dataset.path);
  if (action === "share") shareWith(lessonId, $("share-" + lessonId).value);
  if (action === "unshare") stopSharing(lessonId, btn.dataset.user);
});

$("myLessons").addEventListener("change", async function (e) {
  if (e.target.dataset.action !== "visibility") return;
  const { error } = await db
    .from("lessons")
    .update({ visibility: e.target.value })
    .eq("id", Number(e.target.dataset.lesson));
  if (error) alert("That didn't change: " + error.message);
  loadMyLessons();
});

async function shareWith(lessonId, typedName) {
  const username = typedName.trim().toLowerCase();
  const msgId = "shareMsg-" + lessonId;
  if (!username) { showMsg(msgId, "Type a username.", true); return; }
  if (username === myUsername) { showMsg(msgId, "That's you.", true); return; }

  const { data: person } = await db
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (!person) { showMsg(msgId, "No teacher has that username.", true); return; }

  const { error } = await db.from("lesson_shares").insert({ lesson_id: lessonId, shared_with: person.id });
  if (error) {
    showMsg(msgId, error.code === "23505" ? "Already shared with them." : "That didn't work: " + error.message, true);
    return;
  }
  loadMyLessons();
}

async function stopSharing(lessonId, userId) {
  await db.from("lesson_shares").delete().eq("lesson_id", lessonId).eq("shared_with", userId);
  loadMyLessons();
}

async function deleteLesson(lessonId, path) {
  if (!confirm("Delete this lesson and its file? This can't be undone.")) return;
  const { error } = await db.from("lessons").delete().eq("id", lessonId);
  if (error) { alert("That didn't delete: " + error.message); return; }
  await db.storage.from("lesson-files").remove([path]);
  loadMyLessons();
}

// Files are private, so we ask Supabase for a link that works for 60 seconds.
// Supabase only gives the link if the bucket rules say this person may see the file.
async function openFile(path) {
  const tab = window.open("", "_blank");
  const { data, error } = await db.storage.from("lesson-files").createSignedUrl(path, 60);
  if (error) {
    if (tab) tab.close();
    alert("You can't open that file.");
    return;
  }
  if (tab) tab.location = data.signedUrl;
  else window.location = data.signedUrl;
}

// ---------- screen 4: shared with me ----------

async function loadLibrary() {
  const box = $("libraryLessons");

  // Row-Level Security only sends back lessons this person is allowed to see.
  const { data: lessons, error } = await db
    .from("lessons")
    .select("id, title, subject, grade, note, file_path, file_name, visibility, created_at, owner:profiles(username)")
    .neq("owner_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = '<div class="empty">Couldn\'t load shared lessons.</div>';
    return;
  }
  if (lessons.length === 0) {
    box.innerHTML = '<div class="empty">Nobody has shared a lesson with you yet.</div>';
    return;
  }

  box.innerHTML = lessons.map(function (l) {
    const how = l.visibility === "everyone" ? "Everyone" : "Shared with you";
    return '<div class="lesson">' +
      '<h3>' + escapeHTML(l.title) + ' <span class="badge ' + l.visibility + '">' + how + '</span></h3>' +
      '<div class="meta">Shared by <b>' + escapeHTML(l.owner ? l.owner.username : "unknown") + '</b> · ' +
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
  const { error } = await db.auth.updateUser({ password: password });
  if (error) {
    showMsg("passwordMsg", error.message, true);   // Supabase explains which rule it broke
    return;
  }
  $("newPassword").value = "";
  showMsg("passwordMsg", "Password changed.", false);
});
