"use strict";

const MAX_NUMBER = 100;
const START_SCORE = 100;
const STORAGE_KEY = "guess-my-number";

const guessInput = document.querySelector(".guess");
const modal = document.querySelector(".modal");
const nameForm = document.querySelector(".name-form");
const nameInputs = [
  document.getElementById("input-name--0"),
  document.getElementById("input-name--1"),
];

let secretNumber, scores, activePlayer;
let playing = false;
let firstPlayer = 0;
let names = ["Player 1", "Player 2"];

// Saved data: best score ever (with who got it) and the
// win/loss record for each pair of players who have played each other
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

// Same key no matter which player is Player 1
const matchupKey = () =>
  names.map(n => n.toLowerCase()).sort().join(" vs ");

const getRecord = function () {
  const key = matchupKey();
  if (!data.records[key]) data.records[key] = {};
  const record = data.records[key];
  names.forEach(n => {
    record[n.toLowerCase()] ??= { wins: 0, losses: 0 };
  });
  return record;
};

const displayMessage = function (message) {
  document.querySelector(".message").textContent = message;
};

const displayNumber = function (number) {
  document.querySelector(".number").textContent = number;
};

const displayScore = function (player) {
  document.getElementById(`score--${player}`).textContent = scores[player];
};

const displayRecords = function () {
  const record = getRecord();
  names.forEach((name, i) => {
    const { wins, losses } = record[name.toLowerCase()];
    document.getElementById(`name--${i}`).textContent = name;
    document.getElementById(`record--${i}`).textContent = `W ${wins} · L ${losses}`;
  });
};

const displayHighScore = function () {
  const { score, name } = data.highScore;
  document.querySelector(".highscore").textContent = name
    ? `${score} (${name})`
    : score;
};

const playerName = player => names[player];

const setActivePlayer = function (player) {
  activePlayer = player;
  document.querySelectorAll(".player").forEach((el, i) => {
    el.classList.toggle("player--active", i === player);
  });
};

const init = function () {
  secretNumber = Math.trunc(Math.random() * MAX_NUMBER) + 1;
  scores = [START_SCORE, START_SCORE];
  playing = true;

  setActivePlayer(firstPlayer);
  displayScore(0);
  displayScore(1);
  displayMessage(`${playerName(firstPlayer)}, start guessing...`);
  displayNumber("?");
  document.querySelector("body").style.backgroundColor = "#333";
  document.querySelector(".number").style.width = "15rem";
  guessInput.value = "";
  guessInput.disabled = false;
  guessInput.focus();
};

const endGame = function (winner) {
  playing = false;
  guessInput.disabled = true;
  setActivePlayer(winner);
  displayNumber(secretNumber);
  document.querySelector("body").style.backgroundColor = "#60b347";
  document.querySelector(".number").style.width = "30rem";

  const record = getRecord();
  record[playerName(winner).toLowerCase()].wins++;
  record[playerName(1 - winner).toLowerCase()].losses++;

  if (scores[winner] > data.highScore.score) {
    data.highScore = { score: scores[winner], name: playerName(winner) };
  }

  saveData();
  displayRecords();
  displayHighScore();
  launchFireworks();
};

const checkGuess = function () {
  if (!playing) return;

  const guess = Number(guessInput.value);
  guessInput.value = "";
  guessInput.focus();

  if (!guess || guess < 1 || guess > MAX_NUMBER) {
    displayMessage(`Invalid number! ${playerName(activePlayer)}, try again`);
    return;
  }

  if (guess === secretNumber) {
    displayMessage(`🎉 ${playerName(activePlayer)} wins!`);
    endGame(activePlayer);
    return;
  }

  scores[activePlayer]--;
  displayScore(activePlayer);

  if (scores[activePlayer] === 0) {
    const other = 1 - activePlayer;
    displayMessage(`${playerName(activePlayer)} is out! ${playerName(other)} wins!`);
    endGame(other);
    return;
  }

  const hint = guess > secretNumber ? "too high" : "too low";
  setActivePlayer(1 - activePlayer);
  displayMessage(`${guess} is ${hint}! ${playerName(activePlayer)}'s turn`);
};

const showNameForm = function () {
  playing = false;
  stopFireworks();
  nameInputs.forEach((input, i) => {
    input.value = names[i].startsWith("Player ") ? "" : names[i];
  });
  document.querySelector(".form-error").textContent = "";
  modal.hidden = false;
  nameInputs[0].focus();
};

nameForm.addEventListener("submit", function (e) {
  e.preventDefault();
  const entered = nameInputs.map(
    (input, i) => input.value.trim() || `Player ${i + 1}`
  );

  if (entered[0].toLowerCase() === entered[1].toLowerCase()) {
    document.querySelector(".form-error").textContent =
      "Players need different names!";
    return;
  }

  names = entered;
  firstPlayer = 0;
  modal.hidden = true;
  displayRecords();
  init();
});

document.querySelector(".check").addEventListener("click", checkGuess);

guessInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") checkGuess();
});

document.querySelector(".again").addEventListener("click", function () {
  if (!modal.hidden) return;
  firstPlayer = 1 - firstPlayer;
  stopFireworks();
  init();
});

document
  .querySelector(".change-players")
  .addEventListener("click", showNameForm);

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

displayHighScore();
showNameForm();
