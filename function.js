import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6hF5iyLzZJWWec0M6PoKYEMhmDaigKxM",
  authDomain: "family-sport-cecc2.firebaseapp.com",
  projectId: "family-sport-cecc2",
  storageBucket: "family-sport-cecc2.firebasestorage.app",
  messagingSenderId: "253409863160",
  appId: "1:253409863160:web:2fd54973a4532960f6a20d",
  measurementId: "G-Z3WDFVX38Y"
};

const ADMIN_PIN = "1805";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const stateDocRef = doc(db, "familienSport", "hauptDaten");

let isAdmin = false;
let state = {
  members: [],
  challenges: [],
  nextId: 1
};

function getWeekStartTimestamp(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatCurrentWeekRange() {
  const start = new Date(getWeekStartTimestamp());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const opts = { day: "2-digit", month: "2-digit" };
  return `Woche: ${start.toLocaleDateString("de-DE", opts)} – ${end.toLocaleDateString("de-DE", opts)} (Reset am Montag)`;
}

function isChallengeInCurrentWeek(ch) {
  const currentWeekStart = getWeekStartTimestamp();
  const chTime = ch.createdAt ? Number(ch.createdAt) : Date.now();
  return getWeekStartTimestamp(new Date(chTime)) === currentWeekStart;
}

function initRealtimeSync() {
  onSnapshot(
    stateDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        state.members = Array.isArray(data.members) ? data.members : [];
        state.challenges = Array.isArray(data.challenges) ? data.challenges : [];
        state.nextId = Number(data.nextId) || 1;
      } else {
        saveState();
      }
      render();
    },
    (error) => {
      console.error("Firebase Fehler:", error);
      alert("Verbindung zu Firebase fehlgeschlagen. Bitte firebaseConfig prüfen.");
    }
  );
}

async function saveState() {
  try {
    await setDoc(stateDocRef, {
      members: state.members,
      challenges: state.challenges,
      nextId: state.nextId
    });
  } catch (err) {
    console.error("Fehler beim Speichern:", err);
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
}

function toggleAdminMode() {
  if (isAdmin) {
    isAdmin = false;
    updateAdminUI();
    render();
  } else {
    const pinInput = document.getElementById("adminPinInput");
    pinInput.value = "";
    openModal("adminLoginModal");
    setTimeout(() => pinInput.focus(), 50);
  }
}

function verifyAdminPin() {
  const pinInput = document.getElementById("adminPinInput");
  if (pinInput.value.trim() === ADMIN_PIN) {
    isAdmin = true;
    closeModal("adminLoginModal");
    updateAdminUI();
    render();
  } else {
    alert("Falscher PIN!");
  }
}

function updateAdminUI() {
  const toggleBtn = document.getElementById("toggleAdminBtn");
  const addChallengeBtn = document.getElementById("openAddChallengeBtn");

  if (isAdmin) {
    toggleBtn.textContent = "🔓 Admin-Modus aktiv (Beenden)";
    toggleBtn.classList.remove("btn-outline");
    toggleBtn.classList.add("btn-primary");
    addChallengeBtn.classList.remove("hidden");
  } else {
    toggleBtn.textContent = "🔒 Admin-Modus aktivieren";
    toggleBtn.classList.add("btn-outline");
    toggleBtn.classList.remove("btn-primary");
    addChallengeBtn.classList.add("hidden");
  }
}

async function addMember() {
  const input = document.getElementById("memberNameInput");
  const name = input.value.trim();

  if (!name) {
    alert("Bitte deinen Namen eingeben.");
    return;
  }

  if (state.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    alert("Dieser Name ist schon eingetragen.");
    return;
  }

  state.members.push({ id: state.nextId++, name });
  input.value = "";
  closeModal("addMemberModal");
  await saveState();
}

async function removeMember(memberId) {
  if (!isAdmin) return;
  if (!confirm("Mitglied wirklich entfernen?")) return;

  state.members = state.members.filter((m) => m.id !== memberId);
  state.challenges.forEach((ch) => {
    if (ch.completions && ch.completions[memberId]) {
      delete ch.completions[memberId];
    }
  });

  await saveState();
}

function openAddChallengeModal() {
  if (!isAdmin) return;
  document.getElementById("challengeTitleInput").value = "";
  document.querySelectorAll(".exercise-input").forEach((el) => (el.value = ""));
  openModal("addChallengeModal");
  setTimeout(() => document.getElementById("challengeTitleInput").focus(), 50);
}

async function addChallenge() {
  if (!isAdmin) return;

  const title = document.getElementById("challengeTitleInput").value.trim();
  const exercises = [...document.querySelectorAll(".exercise-input")]
    .map((el) => el.value.trim())
    .filter(Boolean);

  if (!title) {
    alert("Bitte einen Titel eingeben.");
    return;
  }
  if (exercises.length === 0) {
    alert("Bitte mindestens eine Übung eintragen.");
    return;
  }

  const now = new Date();
  state.challenges.unshift({
    id: state.nextId++,
    title,
    date: now.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }),
    createdAt: now.getTime(),
    exercises,
    completions: {}
  });

  closeModal("addChallengeModal");
  await saveState();
}

async function deleteChallenge(challengeId) {
  if (!isAdmin) return;
  if (!confirm("Challenge wirklich löschen?")) return;

  state.challenges = state.challenges.filter((ch) => ch.id !== challengeId);
  await saveState();
}

async function toggleExercise(challengeId, memberId, exerciseIndex) {
  const challenge = state.challenges.find((ch) => ch.id === challengeId);
  if (!challenge) return;

  if (!challenge.completions) challenge.completions = {};
  if (!Array.isArray(challenge.completions[memberId])) {
    challenge.completions[memberId] = [];
  }

  const list = challenge.completions[memberId];
  const pos = list.indexOf(exerciseIndex);
  if (pos === -1) {
    list.push(exerciseIndex);
  } else {
    list.splice(pos, 1);
  }

  await saveState();
}

function calculateWeeklyRanking() {
  const weeklyChallenges = state.challenges.filter(isChallengeInCurrentWeek);

  return state.members
    .map((member) => {
      let exercisesDone = 0;
      let fullDays = 0;

      weeklyChallenges.forEach((ch) => {
        const done = (ch.completions && ch.completions[member.id]) || [];
        exercisesDone += done.length;
        if (ch.exercises.length > 0 && done.length === ch.exercises.length) {
          fullDays += 1;
        }
      });

      const points = exercisesDone + fullDays * 2;
      return { ...member, exercisesDone, fullDays, points };
    })
    .sort((a, b) => b.points - a.points || b.exercisesDone - a.exercisesDone);
}

function render() {
  document.getElementById("currentWeekLabel").textContent = formatCurrentWeekRange();
  renderRanking();
  renderMembers();
  renderChallenges();
}

function renderRanking() {
  const container = document.getElementById("rankingList");
  const empty = document.getElementById("emptyRanking");

  if (state.members.length === 0) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  const ranking = calculateWeeklyRanking();
  const medals = ["🥇", "🥈", "🥉"];

  container.innerHTML = ranking
    .map((item, idx) => {
      const topClass = idx < 3 && item.points > 0 ? `top-${idx + 1}` : "";
      const medal = idx < 3 && item.points > 0 ? medals[idx] : `${idx + 1}.`;

      return `
        <div class="rank-row ${topClass}">
          <div class="rank-left">
            <span class="rank-medal">${medal}</span>
            <div>
              <div class="rank-name">${escapeHtml(item.name)}</div>
              <div class="rank-details">${item.exercisesDone} Übungen · ${item.fullDays} komplette Tage (diese Woche)</div>
            </div>
          </div>
          <div class="rank-points">${item.points} Pkt.</div>
        </div>
      `;
    })
    .join("");
}

function renderMembers() {
  const container = document.getElementById("memberList");
  const empty = document.getElementById("emptyMembers");

  if (state.members.length === 0) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  container.innerHTML = state.members
    .map(
      (m) => `
      <span class="member-tag">
        ${escapeHtml(m.name)}
        ${
          isAdmin
            ? `<button type="button" class="remove-btn" data-remove-member="${m.id}" title="Entfernen">&times;</button>`
            : ""
        }
      </span>
    `
    )
    .join("");
}

function renderChallenges() {
  const container = document.getElementById("challengeList");
  const empty = document.getElementById("emptyChallenges");

  if (state.challenges.length === 0) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  container.innerHTML = state.challenges
    .map((ch) => {
      const inCurrentWeek = isChallengeInCurrentWeek(ch);
      const weekBadge = inCurrentWeek
        ? `<span class="week-tag">Diese Woche</span>`
        : `<span class="week-tag old-week">Vorwoche</span>`;

      const gridHtml =
        state.members.length === 0
          ? `<p class="subtitle">Tragt euch oben ein, um Übungen abzuhaken.</p>`
          : `<div class="member-progress-grid">
              ${state.members
                .map((m) => {
                  const doneIndices = (ch.completions && ch.completions[m.id]) || [];
                  const allDone =
                    ch.exercises.length > 0 && doneIndices.length === ch.exercises.length;

                  return `
                    <div class="member-box ${allDone ? "all-done" : ""}">
                      <div class="member-box-header">
                        <span class="member-box-name">${escapeHtml(m.name)}</span>
                        <span class="member-box-status">
                          ${allDone ? "✅ Komplett" : `${doneIndices.length}/${ch.exercises.length}`}
                        </span>
                      </div>
                      <div class="checklist">
                        ${ch.exercises
                          .map((ex, exIdx) => {
                            const checked = doneIndices.includes(exIdx);
                            return `
                              <label class="check-item ${checked ? "checked" : ""}">
                                <input
                                  type="checkbox"
                                  data-challenge-id="${ch.id}"
                                  data-member-id="${m.id}"
                                  data-exercise-index="${exIdx}"
                                  ${checked ? "checked" : ""}
                                >
                                <span>${escapeHtml(ex)}</span>
                              </label>
                            `;
                          })
                          .join("")}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>`;

      return `
        <div class="challenge-item">
          <div class="challenge-header">
            <div>
              <div class="challenge-title">${escapeHtml(ch.title)} ${weekBadge}</div>
              <div class="challenge-date">📅 ${escapeHtml(ch.date)} · ${ch.exercises.length} Übungen</div>
            </div>
            ${
              isAdmin
                ? `<button type="button" class="btn btn-danger btn-xs" data-delete-challenge="${ch.id}">✕ Löschen</button>`
                : ""
            }
          </div>
          ${gridHtml}
        </div>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function bindEvents() {
  document.getElementById("toggleAdminBtn").addEventListener("click", toggleAdminMode);
  document.getElementById("cancelAdminBtn").addEventListener("click", () => closeModal("adminLoginModal"));
  document.getElementById("confirmAdminBtn").addEventListener("click", verifyAdminPin);

  document.getElementById("openAddMemberBtn").addEventListener("click", () => {
    const input = document.getElementById("memberNameInput");
    input.value = "";
    openModal("addMemberModal");
    setTimeout(() => input.focus(), 50);
  });
  document.getElementById("cancelMemberBtn").addEventListener("click", () => closeModal("addMemberModal"));
  document.getElementById("confirmAddMemberBtn").addEventListener("click", addMember);

  document.getElementById("openAddChallengeBtn").addEventListener("click", openAddChallengeModal);
  document.getElementById("cancelChallengeBtn").addEventListener("click", () => closeModal("addChallengeModal"));
  document.getElementById("confirmAddChallengeBtn").addEventListener("click", addChallenge);

  document.getElementById("memberList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-member]");
    if (btn) removeMember(Number(btn.dataset.removeMember));
  });

  document.getElementById("challengeList").addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-delete-challenge]");
    if (delBtn) deleteChallenge(Number(delBtn.dataset.deleteChallenge));
  });

  document.getElementById("challengeList").addEventListener("change", (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-challenge-id]');
    if (cb) {
      toggleExercise(
        Number(cb.dataset.challengeId),
        Number(cb.dataset.memberId),
        Number(cb.dataset.exerciseIndex)
      );
    }
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.add("hidden");
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((el) => el.classList.add("hidden"));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  updateAdminUI();
  render();
  initRealtimeSync();
});