"use strict";

const MAX_NUMBER = 100;
const START_SCORE = 100;
const TURN_SECONDS = 20;
const STORAGE_KEY = "guess-my-number";

const guessInput = document.querySelector(".guess");
const modal = document.querySelector(".modal");
const formError = document.querySelector(".form-error");

// "local" = both players on this device
// "host"  = online, this browser runs the game and is player 1
// "guest" = online, joined through an invite link, is player 2
let mode = "local";
let me = null; // which player this browser controls online (0 or 1)
let friendGone = false;

// Everything the screen shows. In online games the host owns it and
// sends a copy to the guest after every change.
let state = {
  names: ["Player 1", "Player 2"],
  scores: [START_SCORE, START_SCORE],
  activePlayer: 0,
  firstPlayer: 0,
  playing: false,
  message: "Start guessing...",
  winner: null,
  revealed: null,
  round: 0,
  turnId: 0, // goes up whenever a new turn (and its countdown) starts
  event: { id: 0, kind: null }, // last thing that happened, for sounds
  record: [
    { wins: 0, losses: 0 },
    { wins: 0, losses: 0 },
  ],
  highScore: { score: 0, name: "" },
};
let secretNumber = null; // never sent to the guest

// SAVED DATA
// Best score ever (with who got it) and the win/loss record for
// each pair of players who have played each other
const loadData = function () {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch (err) {}
  return { highScore: { score: 0, name: "" }, records: {} };
};

const saveData = function () {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {}
};

const data = loadData();
state.highScore = data.highScore;

// Same key no matter which player is Player 1
const matchupKey = names =>
  names.map(n => n.toLowerCase()).sort().join(" vs ");

const getRecord = function (names) {
  const key = matchupKey(names);
  if (!data.records[key]) data.records[key] = {};
  const record = data.records[key];
  names.forEach(n => {
    record[n.toLowerCase()] ??= { wins: 0, losses: 0 };
  });
  return names.map(n => record[n.toLowerCase()]);
};

// GAME RULES (run by the local game or the online host)
const emit = kind => (state.event = { id: state.event.id + 1, kind });

const nextTurn = function () {
  state.activePlayer = 1 - state.activePlayer;
  state.turnId++;
};

const newRound = function () {
  secretNumber = Math.trunc(Math.random() * MAX_NUMBER) + 1;
  state.scores = [START_SCORE, START_SCORE];
  state.activePlayer = state.firstPlayer;
  state.playing = true;
  state.winner = null;
  state.revealed = null;
  state.round++;
  state.turnId++;
  state.message = `${state.names[state.firstPlayer]}, start guessing...`;
  emit("start");
};

const newMatch = function (names) {
  state.names = names;
  state.firstPlayer = 0;
  state.record = getRecord(names);
  newRound();
};

const endGame = function (winner) {
  state.playing = false;
  state.winner = winner;
  state.activePlayer = winner;
  state.revealed = secretNumber;
  emit("end");

  state.record[winner].wins++;
  state.record[1 - winner].losses++;

  if (state.scores[winner] > data.highScore.score) {
    data.highScore = { score: state.scores[winner], name: state.names[winner] };
    state.highScore = data.highScore;
  }
  saveData();
};

const applyGuess = function (player, guess) {
  if (!state.playing || player !== state.activePlayer) return;
  const name = state.names[player];

  if (!guess || guess < 1 || guess > MAX_NUMBER) {
    state.message = `Invalid number! ${name}, try again`;
    emit("invalid");
    return;
  }

  if (guess === secretNumber) {
    state.message = `🎉 ${name} wins!`;
    endGame(player);
    return;
  }

  state.scores[player]--;

  if (state.scores[player] === 0) {
    const other = 1 - player;
    state.message = `${name} is out! ${state.names[other]} wins!`;
    endGame(other);
    return;
  }

  const tooHigh = guess > secretNumber;
  nextTurn();
  state.message = `${guess} is ${tooHigh ? "too high" : "too low"}! ${
    state.names[state.activePlayer]
  }'s turn`;
  emit(tooHigh ? "high" : "low");
};

// Running out of time costs a point and passes the turn
const applyTimeout = function (turnId) {
  if (!state.playing || state.turnId !== turnId) return;
  const player = state.activePlayer;
  const name = state.names[player];

  state.scores[player]--;

  if (state.scores[player] === 0) {
    const other = 1 - player;
    state.message = `${name} is out! ${state.names[other]} wins!`;
    endGame(other);
    return;
  }

  nextTurn();
  state.message = `⏰ ${name} ran out of time! ${state.names[state.activePlayer]}'s turn`;
  emit("timeout");
};

const applyAgain = function () {
  state.firstPlayer = 1 - state.firstPlayer;
  newRound();
};

// Every move goes through here, whatever the mode
const handleAction = function (action, player) {
  if (action.type === "guess") applyGuess(player, action.guess);
  if (action.type === "again") applyAgain();
  if (action.type === "timeout") applyTimeout(action.turnId);
  render();
  sendState();
};

const sendAction = function (action) {
  if (mode === "guest") {
    send({ ...action, to: friendId });
    return;
  }
  handleAction(action, mode === "host" ? 0 : state.activePlayer);
};

const sendState = function () {
  if (mode === "host") send({ type: "state", state, to: friendId });
};

// DRAWING THE SCREEN
let celebratedRound = 0;
let heardEvent = 0;

const render = function () {
  const myTurn = state.playing && (me === null || me === state.activePlayer);
  // On a shared screen the winner's celebration is shown
  const outcome =
    state.winner === null
      ? null
      : me === null || me === state.winner
      ? "win"
      : "lose";

  document.querySelector(".message").textContent = state.message;
  document.querySelector(".number").textContent = state.revealed ?? "?";
  document.querySelector(".number").style.width =
    state.revealed === null ? "15rem" : "30rem";
  document.querySelector("body").style.backgroundColor =
    outcome === "win" ? "#60b347" : outcome === "lose" ? "#b33939" : "#333";

  const result = document.querySelector(".result");
  result.hidden = !outcome;
  result.innerHTML =
    outcome === "win"
      ? '<span class="banana" role="img" aria-label="Dancing banana">🍌</span>'
      : outcome === "lose"
      ? '<span class="heart" role="img" aria-label="Broken heart">💔</span>'
      : "";
  guessInput.hidden = !!outcome;
  document.querySelector(".check").hidden = !!outcome;

  state.names.forEach((name, i) => {
    const { wins, losses } = state.record[i];
    document.getElementById(`name--${i}`).textContent =
      i === me ? `${name} (you)` : name;
    document.getElementById(`score--${i}`).textContent = state.scores[i];
    document.getElementById(`record--${i}`).textContent = `W ${wins} · L ${losses}`;
  });

  document.querySelectorAll(".player").forEach((el, i) => {
    el.classList.toggle("player--active", i === state.activePlayer);
  });

  const { score, name } = state.highScore;
  document.querySelector(".highscore").textContent = name
    ? `${score} (${name})`
    : score;

  guessInput.disabled = !myTurn;
  if (myTurn && modal.hidden) guessInput.focus();

  if (outcome !== "win") {
    stopFireworks();
  } else if (celebratedRound !== state.round) {
    celebratedRound = state.round;
    launchFireworks();
  }
  playMusic(outcome);

  if (state.event.id !== heardEvent) {
    heardEvent = state.event.id;
    playSound(state.event.kind);
  }

  updateTurnTimer();
};

// TURN TIMER
// Every browser shows the countdown; only the local game or the online
// host decides when time is actually up.
const timerEl = document.querySelector(".timer");
let shownTurn = 0;
let turnStartedAt = 0;
let lastSecondShown = null;
let timeoutTimer = null;
let timedTurn = 0;

const updateTurnTimer = function () {
  timerEl.hidden = !state.playing;

  if (state.turnId !== shownTurn) {
    shownTurn = state.turnId;
    turnStartedAt = Date.now();
    lastSecondShown = null;
  }

  if (mode !== "guest") {
    if (!state.playing) {
      clearTimeout(timeoutTimer);
      timedTurn = 0;
    } else if (state.turnId !== timedTurn) {
      clearTimeout(timeoutTimer);
      timedTurn = state.turnId;
      const turnId = state.turnId;
      timeoutTimer = setTimeout(
        () => handleAction({ type: "timeout", turnId }),
        TURN_SECONDS * 1000
      );
    }
  }
};

setInterval(() => {
  if (!state.playing) return;
  const left = Math.max(
    0,
    Math.ceil(TURN_SECONDS - (Date.now() - turnStartedAt) / 1000)
  );
  if (left === lastSecondShown) return;
  lastSecondShown = left;
  timerEl.textContent = `⏱ ${left}`;
  timerEl.classList.toggle("timer--urgent", left <= 5);
  const myTurn = me === null || me === state.activePlayer;
  if (myTurn && left > 0 && left <= 5) playSound("tick");
}, 200);

// START SCREENS
const showScreen = function (name) {
  modal.hidden = false;
  formError.textContent = "";
  document.querySelectorAll(".screen").forEach(screen => {
    screen.hidden = screen.dataset.screen !== name;
  });
  const firstInput = document.querySelector(
    `.screen[data-screen="${name}"] input:not([readonly])`
  );
  if (firstInput) firstInput.focus();
};

const showError = message => (formError.textContent = message);

// ONLINE CONNECTION
// Messages travel through a free public MQTT server over an ordinary secure
// web connection, so it works even on networks that block direct
// device-to-device connections. The room id in the invite link keeps each
// game's messages separate.
const BROKERS = [
  { url: "wss://public.cloud.shiftr.io", username: "public", password: "public" },
  { url: "wss://broker.hivemq.com:8884/mqtt" },
  { url: "wss://broker.emqx.io:8084/mqtt" },
];
const TOPIC_PREFIX = "guess-my-number-hyezhu";

const randomId = function () {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("");
};

const myId = randomId(); // this browser
let client = null;
let room = null; // shared by both players
let friendId = null; // the other player's browser, once connected
let myName = "";
let helloTimer = null;

const send = function (msg) {
  if (!client || !room) return;
  client.publish(
    `${TOPIC_PREFIX}/${room}`,
    JSON.stringify({ ...msg, from: myId }),
    { qos: 1 }
  );
};

const connectBroker = function (index) {
  return new Promise((resolve, reject) => {
    const { url, ...login } = BROKERS[index];
    const c = mqtt.connect(url, {
      ...login,
      connectTimeout: 6000,
      reconnectPeriod: 2000,
    });
    const timer = setTimeout(() => {
      c.end(true);
      reject(new Error("timeout"));
    }, 7000);
    c.once("connect", () => {
      clearTimeout(timer);
      resolve(c);
    });
  });
};

// Connects to the first server that answers and joins the room.
// Returns which server was used, so the invite link can point to it.
const openRoom = async function (roomId, brokerIndexes) {
  for (const i of brokerIndexes) {
    try {
      const c = await connectBroker(i);
      client = c;
      room = roomId;
      c.subscribe(`${TOPIC_PREFIX}/${roomId}`, { qos: 1 });
      c.on("message", (topic, payload) => {
        if (c !== client) return;
        let msg;
        try {
          msg = JSON.parse(payload.toString());
        } catch (err) {
          return;
        }
        if (msg.from === myId || (msg.to && msg.to !== myId)) return;
        handleMessage(msg);
      });
      return i;
    } catch (err) {}
  }
  throw new Error("Couldn't reach any game server");
};

// Notice when the other player closes the page or loses connection
let heartbeat = null;
let lastHeard = 0;

const watchConnection = function () {
  lastHeard = Date.now();
  clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    send({ type: "ping", to: friendId });
    if (Date.now() - lastHeard > 20000) friendLeft();
  }, 2000);
};

window.addEventListener("pagehide", () => {
  if (friendId) send({ type: "bye", to: friendId });
});

const closeOnline = function () {
  clearInterval(heartbeat);
  clearInterval(helloTimer);
  if (friendId) send({ type: "bye", to: friendId });
  if (client) client.end(); // sends anything still queued first
  client = null;
  room = null;
  friendId = null;
};

const handleMessage = function (msg) {
  // Someone else opened the same invite after the game started
  if (friendId && msg.from !== friendId) {
    if (msg.type === "hello") send({ type: "full", to: msg.from });
    return;
  }
  lastHeard = Date.now();

  if (msg.type === "ping") return;
  if (msg.type === "bye") return friendLeft();

  // Host side
  if (msg.type === "hello" && !friendId && mode !== "guest") {
    friendId = msg.from;
    let guestName = String(msg.name).trim().slice(0, 12) || "Player 2";
    if (guestName.toLowerCase() === myName.toLowerCase()) guestName += " 2";
    mode = "host";
    me = 0;
    newMatch([myName, guestName]);
    modal.hidden = true;
    render();
    sendState();
    watchConnection();
    return;
  }
  if (mode === "host" && (msg.type === "guess" || msg.type === "again")) {
    handleAction(msg, 1);
    return;
  }

  // Guest side
  if (msg.type === "state" && joinId) {
    if (!friendId) {
      friendId = msg.from;
      clearInterval(helloTimer);
      watchConnection();
    }
    mode = "guest";
    me = 1;
    state = msg.state;
    modal.hidden = true;
    render();
    return;
  }
  if (msg.type === "full") {
    clearInterval(helloTimer);
    closeOnline();
    showError("That game already has two players.");
  }
};

document.querySelectorAll("[data-go]").forEach(btn =>
  btn.addEventListener("click", () => showScreen(btn.dataset.go))
);

// On this device
document.querySelector(".local-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const names = [0, 1].map(
    i =>
      document.getElementById(`input-name--${i}`).value.trim() ||
      `Player ${i + 1}`
  );
  if (names[0].toLowerCase() === names[1].toLowerCase()) {
    showError("Players need different names!");
    return;
  }
  mode = "local";
  me = null;
  newMatch(names);
  modal.hidden = true;
  render();
});

// Online: create an invite link
const inviteUrl = (roomId, brokerIndex) =>
  `${location.origin}${location.pathname}?join=${roomId}&s=${brokerIndex}`;

const onlineUnavailable = function () {
  if (typeof mqtt !== "undefined") return false;
  showError("Couldn't load online play. Check your internet connection.");
  return true;
};

document.querySelector(".host-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (onlineUnavailable()) return;
  myName = document.getElementById("host-name").value.trim() || "Player 1";

  closeOnline();
  document.querySelector(".invite-link").value = "Creating link...";
  document.querySelector(".status").textContent =
    "Waiting for your friend to join...";
  showScreen("invite");

  const roomId = randomId();
  try {
    const brokerIndex = await openRoom(roomId, BROKERS.keys());
    document.querySelector(".invite-link").value = inviteUrl(roomId, brokerIndex);
  } catch (err) {
    document.querySelector(".invite-link").value = "";
    showError("Couldn't reach the game server. Check your internet and try again.");
  }
});

document.querySelector(".copy-link").addEventListener("click", function () {
  const input = document.querySelector(".invite-link");
  input.select();
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(input.value)
      .then(() => (this.textContent = "Copied!"))
      .catch(() => {});
  } else if (document.execCommand("copy")) {
    // Clipboard API only exists on https/localhost, e.g. not on a LAN address
    this.textContent = "Copied!";
  }
  setTimeout(() => (this.textContent = "Copy link"), 2000);
});

document.querySelector(".cancel-invite").addEventListener("click", function () {
  closeOnline();
  showScreen("host");
});

// Online: join through an invite link
const params = new URLSearchParams(location.search);
const joinId = params.get("join");
const joinBroker = Math.min(Number(params.get("s")) || 0, BROKERS.length - 1);

document.querySelector(".join-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  if (onlineUnavailable()) return;
  myName = document.getElementById("join-name").value.trim() || "Player 2";

  closeOnline();
  showError("Connecting...");
  try {
    await openRoom(joinId, [joinBroker]);
  } catch (err) {
    showError("Couldn't reach the game server. Check your internet and try again.");
    return;
  }

  // Keep saying hello until the host answers
  showError("Looking for your friend's game...");
  const started = Date.now();
  const sayHello = () => send({ type: "hello", name: myName });
  sayHello();
  helloTimer = setInterval(() => {
    if (Date.now() - started > 30000) {
      clearInterval(helloTimer);
      closeOnline();
      showError(
        "Couldn't find that game. Make sure your friend still has the invite screen open, or ask for a new link."
      );
      return;
    }
    sayHello();
  }, 2000);
});

const friendLeft = function () {
  if (mode === "local" || friendGone) return;
  const other = state.names[1 - me];
  closeOnline();
  friendGone = true;
  state.playing = false;
  state.message = `${other} left the game. Press Players to start again.`;
  render();
};

// GAME BUTTONS
const submitGuess = function () {
  if (guessInput.disabled) return;
  const guess = Number(guessInput.value);
  guessInput.value = "";
  sendAction({ type: "guess", guess });
};

document.querySelector(".check").addEventListener("click", submitGuess);

guessInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") submitGuess();
});

document.querySelector(".again").addEventListener("click", function () {
  if (!modal.hidden || state.round === 0 || friendGone) return;
  sendAction({ type: "again" });
});

document.querySelector(".change-players").addEventListener("click", function () {
  closeOnline();
  if (joinId) {
    // Drop the invite from the address so it doesn't rejoin
    location.href = location.pathname;
    return;
  }
  mode = "local";
  me = null;
  friendGone = false;
  state.playing = false;
  state.winner = null;
  state.revealed = null;
  render();
  showScreen("choose");
});

// SOUND
// Everything is synthesized with the Web Audio API, so there are no files to load
const MUTE_KEY = "guess-my-number-muted";
const muteBtn = document.querySelector(".mute");
let audioCtx = null;
let masterGain = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch (err) {}

const getAudio = function () {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 0.35;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
};

// Browsers only allow sound once the player has clicked or typed something
const unlockAudio = function () {
  const ctx = getAudio();
  if (ctx && ctx.state === "suspended") ctx.resume();
};
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

const midiToFreq = note => 440 * 2 ** ((note - 69) / 12);

// One note; start and length are in seconds from now
const playTone = function (freq, start, length, options = {}) {
  const ctx = getAudio();
  if (!ctx) return;
  const { type = "square", volume = 0.3, slideTo = null, out = masterGain } = options;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.05);
};

const SOUNDS = {
  start: () =>
    [72, 76, 79].forEach((n, i) =>
      playTone(midiToFreq(n), i * 0.08, 0.15, { volume: 0.15 })
    ),
  high: () => playTone(700, 0, 0.25, { slideTo: 350, volume: 0.2 }),
  low: () => playTone(350, 0, 0.25, { slideTo: 700, volume: 0.2 }),
  invalid: () => playTone(110, 0, 0.3, { type: "sawtooth", volume: 0.2 }),
  timeout: () => {
    playTone(220, 0, 0.2, { type: "sawtooth", volume: 0.25 });
    playTone(165, 0.22, 0.4, { type: "sawtooth", volume: 0.25 });
  },
  tick: () => playTone(1200, 0, 0.05, { volume: 0.12 }),
};

const playSound = function (kind) {
  if (!muted && SOUNDS[kind]) SOUNDS[kind]();
};

// Songs are [MIDI note or null for a rest, length in beats]
const SONGS = {
  win: {
    beat: 0.18,
    melody: {
      type: "square",
      volume: 0.1,
      notes: [
        72, 76, 79, 76, 72, 76, 79, 84,
        81, 79, 76, 79, 77, 74, 71, 74,
        72, 76, 79, 76, 72, 76, 79, 84,
        83, 81, 79, 77, 76, 74, 72, null,
      ].map(n => [n, 1]),
    },
    bass: {
      type: "triangle",
      volume: 0.2,
      notes: [
        48, 55, 48, 55, 53, 60, 55, 62,
        48, 55, 48, 55, 55, 50, 48, null,
      ].map(n => [n, 2]),
    },
  },
  lose: {
    beat: 0.45,
    melody: {
      type: "sine",
      volume: 0.25,
      notes: [
        [69, 2], [67, 1], [65, 1], [64, 4],
        [65, 2], [64, 1], [62, 1], [60, 4],
        [62, 2], [60, 1], [59, 1], [57, 3], [null, 1],
        [64, 2], [63, 2], [62, 2], [61, 2],
      ],
    },
    bass: {
      type: "triangle",
      volume: 0.2,
      notes: [
        [45, 4], [40, 4], [41, 4], [45, 4],
        [38, 4], [40, 4], [45, 4], [45, 4],
      ],
    },
  },
};

let currentSong = null;
let songGain = null;
let songTimer = null;

const scheduleTrack = function (track, beat, out) {
  let time = 0;
  track.notes.forEach(([note, beats]) => {
    const length = beats * beat;
    if (note !== null) {
      playTone(midiToFreq(note), time, length * 0.9, {
        type: track.type,
        volume: track.volume,
        out,
      });
    }
    time += length;
  });
  return time;
};

const stopMusic = function () {
  clearTimeout(songTimer);
  if (songGain) songGain.disconnect();
  songGain = null;
  currentSong = null;
};

// Loops a song until something else plays or it's stopped
const playMusic = function (name) {
  if (name === currentSong) return;
  stopMusic();
  const ctx = getAudio();
  if (!name || !ctx) return;
  currentSong = name;
  const song = SONGS[name];
  const gain = ctx.createGain();
  gain.connect(masterGain);
  songGain = gain;

  const loop = function () {
    if (songGain !== gain) return;
    const length = scheduleTrack(song.melody, song.beat, gain);
    scheduleTrack(song.bass, song.beat, gain);
    songTimer = setTimeout(loop, length * 1000);
  };
  loop();
};

const showMuted = function () {
  muteBtn.textContent = muted ? "🔇" : "🔊";
  muteBtn.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
};

muteBtn.addEventListener("click", function () {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch (err) {}
  if (getAudio()) masterGain.gain.value = muted ? 0 : 0.35;
  showMuted();
});
showMuted();

// FIREWORKS
const canvas = document.querySelector(".fireworks");
const ctx = canvas.getContext("2d");
let particles = [];
let rockets = [];
let fireworksFrame = null;
let fireworksEndTime = 0;

const resizeCanvas = function () {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const launchRocket = function () {
  rockets.push({
    x: canvas.width * (0.15 + Math.random() * 0.7),
    y: canvas.height,
    vy: -(canvas.height / 60) * (0.8 + Math.random() * 0.3),
    targetY: canvas.height * (0.15 + Math.random() * 0.3),
    hue: Math.random() * 360,
  });
};

const explode = function (rocket) {
  const count = 60 + Math.random() * 40;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 5;
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.012,
      hue: rocket.hue + Math.random() * 40 - 20,
    });
  }
};

const animateFireworks = function (time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (time < fireworksEndTime && Math.random() < 0.06) launchRocket();

  rockets = rockets.filter(r => {
    r.y += r.vy;
    ctx.fillStyle = `hsl(${r.hue}, 100%, 70%)`;
    ctx.fillRect(r.x - 2, r.y - 2, 4, 8);
    if (r.y <= r.targetY) {
      explode(r);
      return false;
    }
    return true;
  });

  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06; // gravity
    p.vx *= 0.98;
    p.life -= p.decay;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${Math.max(p.life, 0)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    return p.life > 0;
  });

  if (time < fireworksEndTime || rockets.length || particles.length) {
    fireworksFrame = requestAnimationFrame(animateFireworks);
  } else {
    fireworksFrame = null;
  }
};

const launchFireworks = function () {
  fireworksEndTime = performance.now() + 4000;
  for (let i = 0; i < 3; i++) launchRocket();
  if (!fireworksFrame) fireworksFrame = requestAnimationFrame(animateFireworks);
};

const stopFireworks = function () {
  cancelAnimationFrame(fireworksFrame);
  fireworksFrame = null;
  rockets = [];
  particles = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};


render();
showScreen(joinId ? "join" : "choose");
