const STORAGE_KEY = "lll_data_v1";

function uuid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

function defaultData() {
  return {
    version: 1,
    activeDeckId: null,
    settings: { direction: "front-back" },
    decks: [],
    words: [],
  };
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultData();
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.decks) ||
      !Array.isArray(parsed.words)
    ) {
      return defaultData();
    }
    return parsed;
  } catch {
    return defaultData();
  }
}

let data = loadData();

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- SRS (simplified SM-2) ----------

function newSrs() {
  return { interval: 1, ease: 2.5, reps: 0, dueAt: nowISO(), lapses: 0 };
}

function applyAnswer(word, correct) {
  const srs = word.srs;
  if (correct) {
    srs.reps += 1;
    if (srs.reps === 1) srs.interval = 1;
    else if (srs.reps === 2) srs.interval = 6;
    else srs.interval = Math.round(srs.interval * srs.ease);
    srs.ease = Math.min(3.0, srs.ease + 0.05);
  } else {
    srs.reps = 0;
    srs.interval = 1;
    srs.ease = Math.max(1.3, srs.ease - 0.2);
    srs.lapses += 1;
  }
  const due = new Date();
  due.setDate(due.getDate() + srs.interval);
  srs.dueAt = due.toISOString();
  word.updatedAt = nowISO();
}

// ---------- Deck / word helpers ----------

function getDeck(id) {
  return data.decks.find((d) => d.id === id);
}

function wordsForDeck(deckId) {
  return data.words.filter((w) => w.deckId === deckId);
}

function createDeck(name, fromLang, toLang) {
  const deck = {
    id: uuid(),
    name: name.trim(),
    fromLang: fromLang.trim(),
    toLang: toLang.trim(),
    createdAt: nowISO(),
  };
  data.decks.push(deck);
  if (!data.activeDeckId) data.activeDeckId = deck.id;
  saveData();
  return deck;
}

function deleteDeck(deckId) {
  data.decks = data.decks.filter((d) => d.id !== deckId);
  data.words = data.words.filter((w) => w.deckId !== deckId);
  if (data.activeDeckId === deckId) {
    data.activeDeckId = data.decks[0]?.id || null;
  }
  saveData();
}

function addWord(deckId, front, back) {
  const word = {
    id: uuid(),
    deckId,
    front: front.trim(),
    back: back.trim(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    srs: newSrs(),
  };
  data.words.push(word);
  saveData();
  return word;
}

function deleteWord(wordId) {
  data.words = data.words.filter((w) => w.id !== wordId);
  saveData();
}

// ---------- Quiz engine ----------

let quizQueue = [];
let currentWord = null;
let currentDirection = "front-back"; // resolved direction for current card

function pickDirection() {
  const setting = data.settings.direction;
  if (setting === "mixed")
    return Math.random() < 0.5 ? "front-back" : "back-front";
  return setting;
}

function buildQueue(includeNotDue) {
  const now = new Date();
  let pool = data.words.filter(
    (w) => includeNotDue || new Date(w.srs.dueAt) <= now,
  );
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function startQuiz(includeNotDue) {
  quizQueue = buildQueue(includeNotDue);
  nextCard();
}

function nextCard() {
  const feedback = document.getElementById("quiz-feedback");
  const nextBtn = document.getElementById("quiz-next-btn");
  const form = document.getElementById("quiz-form");
  feedback.classList.add("hidden");
  nextBtn.classList.add("hidden");
  form.classList.remove("hidden");
  document.getElementById("quiz-answer").value = "";

  if (data.decks.length === 0) {
    show("quiz-no-decks");
    return;
  }

  if (quizQueue.length === 0) {
    currentWord = null;
    document.getElementById("quiz-card").classList.add("hidden");
    document.getElementById("quiz-no-decks").classList.add("hidden");
    document.getElementById("quiz-empty").classList.remove("hidden");
    return;
  }

  document.getElementById("quiz-empty").classList.add("hidden");
  document.getElementById("quiz-no-decks").classList.add("hidden");
  document.getElementById("quiz-card").classList.remove("hidden");

  currentWord = quizQueue.pop();
  currentDirection = pickDirection();
  const deck = getDeck(currentWord.deckId);
  document.getElementById("quiz-deck-name").textContent = deck ? deck.name : "";
  document.getElementById("quiz-progress").textContent =
    `${quizQueue.length} left`;
  const promptText =
    currentDirection === "front-back" ? currentWord.front : currentWord.back;
  document.getElementById("quiz-prompt").textContent = promptText;
  document.getElementById("quiz-answer").focus();
}

function normalizeAnswer(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function submitAnswer() {
  if (!currentWord) return;
  const input = document.getElementById("quiz-answer");
  const expected =
    currentDirection === "front-back" ? currentWord.back : currentWord.front;
  const correct = normalizeAnswer(input.value) === normalizeAnswer(expected);

  applyAnswer(currentWord, correct);
  saveData();

  const feedback = document.getElementById("quiz-feedback");
  feedback.classList.remove("hidden", "correct", "wrong");
  if (correct) {
    feedback.classList.add("correct");
    feedback.textContent = "Correct!";
  } else {
    feedback.classList.add("wrong");
    feedback.textContent = `Wrong. Answer: ${expected}`;
  }

  document.getElementById("quiz-form").classList.add("hidden");
  const nextBtn = document.getElementById("quiz-next-btn");
  nextBtn.classList.remove("hidden");
  nextBtn.focus();
}

// ---------- Import / Export ----------

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `local-language-learner-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isValidImport(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.decks) || !Array.isArray(obj.words)) return false;
  return true;
}

function mergeImport(incoming) {
  const deckIds = new Set(data.decks.map((d) => d.id));
  for (const deck of incoming.decks) {
    if (!deckIds.has(deck.id)) {
      data.decks.push(deck);
      deckIds.add(deck.id);
    }
  }

  const wordById = new Map(data.words.map((w) => [w.id, w]));
  for (const word of incoming.words) {
    const existing = wordById.get(word.id);
    if (!existing) {
      data.words.push(word);
      wordById.set(word.id, word);
    } else if (new Date(word.updatedAt) > new Date(existing.updatedAt)) {
      Object.assign(existing, word);
    }
  }

  if (!data.activeDeckId && data.decks.length > 0) {
    data.activeDeckId = data.decks[0].id;
  }
  saveData();
}

// ---------- Manage view rendering ----------

function renderDeckList() {
  const el = document.getElementById("deck-list");
  el.innerHTML = "";
  if (data.decks.length === 0) {
    el.innerHTML = '<p class="msg">No decks yet.</p>';
    return;
  }
  for (const deck of data.decks) {
    const row = document.createElement("div");
    row.className = "deck-row";
    const count = wordsForDeck(deck.id).length;
    row.innerHTML = `<span>${escapeHtml(deck.name)} (${escapeHtml(deck.fromLang)}→${escapeHtml(deck.toLang)}) · ${count} words</span>`;
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      if (confirm(`Delete deck "${deck.name}" and all its words?`)) {
        deleteDeck(deck.id);
        renderAll();
      }
    });
    row.appendChild(del);
    el.appendChild(row);
  }
}

function renderDeckSelect() {
  const sel = document.getElementById("word-deck-select");
  sel.innerHTML = "";
  for (const deck of data.decks) {
    const opt = document.createElement("option");
    opt.value = deck.id;
    opt.textContent = deck.name;
    sel.appendChild(opt);
  }
  if (data.activeDeckId) sel.value = data.activeDeckId;
}

function renderWordList() {
  const el = document.getElementById("word-list");
  el.innerHTML = "";
  if (data.words.length === 0) {
    el.innerHTML = '<p class="msg">No words yet.</p>';
    return;
  }
  for (const word of data.words) {
    const deck = getDeck(word.deckId);
    const row = document.createElement("div");
    row.className = "word-row";
    row.innerHTML = `<span>${escapeHtml(word.front)} — ${escapeHtml(word.back)} <span class="msg">(${deck ? escapeHtml(deck.name) : "?"})</span></span>`;
    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      deleteWord(word.id);
      renderAll();
    });
    row.appendChild(del);
    el.appendChild(row);
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderAll() {
  renderDeckList();
  renderDeckSelect();
  renderWordList();
  document.getElementById("direction-select").value = data.settings.direction;
}

function show(id) {
  for (const el of ["quiz-empty", "quiz-card", "quiz-no-decks"]) {
    document.getElementById(el).classList.toggle("hidden", el !== id);
  }
}

// ---------- Wiring ----------

function switchView(view) {
  document
    .getElementById("quiz-view")
    .classList.toggle("hidden", view !== "quiz");
  document
    .getElementById("manage-view")
    .classList.toggle("hidden", view !== "manage");
  document
    .getElementById("nav-quiz")
    .classList.toggle("active", view === "quiz");
  document
    .getElementById("nav-manage")
    .classList.toggle("active", view === "manage");
  if (view === "quiz") startQuiz(false);
}

document
  .getElementById("nav-quiz")
  .addEventListener("click", () => switchView("quiz"));
document
  .getElementById("nav-manage")
  .addEventListener("click", () => switchView("manage"));

document.getElementById("quiz-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitAnswer();
});

document
  .getElementById("quiz-next-btn")
  .addEventListener("click", () => nextCard());

document
  .getElementById("review-ahead-btn")
  .addEventListener("click", () => startQuiz(true));

document.getElementById("deck-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("deck-name").value;
  const from = document.getElementById("deck-from").value;
  const to = document.getElementById("deck-to").value;
  createDeck(name, from, to);
  e.target.reset();
  renderAll();
});

document.getElementById("word-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const deckId = document.getElementById("word-deck-select").value;
  const front = document.getElementById("word-front").value;
  const back = document.getElementById("word-back").value;
  const msg = document.getElementById("word-form-msg");
  if (!deckId) {
    msg.textContent = "Create a deck first.";
    msg.classList.remove("hidden");
    return;
  }
  addWord(deckId, front, back);
  e.target.reset();
  msg.textContent = "Added.";
  msg.classList.remove("hidden", "error");
  msg.classList.add("success");
  renderWordList();
});

document.getElementById("direction-select").addEventListener("change", (e) => {
  data.settings.direction = e.target.value;
  saveData();
});

document
  .getElementById("export-btn")
  .addEventListener("click", () => exportData());

document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const msg = document.getElementById("import-msg");
    msg.classList.remove("hidden", "error", "success");
    try {
      const incoming = JSON.parse(reader.result);
      if (!isValidImport(incoming)) {
        msg.textContent = "Invalid file format.";
        msg.classList.add("error");
        return;
      }
      mergeImport(incoming);
      renderAll();
      msg.textContent = "Import successful.";
      msg.classList.add("success");
    } catch {
      msg.textContent = "Could not parse file as JSON.";
      msg.classList.add("error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

renderAll();
switchView("quiz");
