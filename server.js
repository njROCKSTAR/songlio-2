const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

let players = [];
let playlist = [];
let currentIndex = 0;
let roundInProgress = false;
let roundStartTime = 0;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (name) => {
    players.push({
      id: socket.id,
      name,
      ready: false,
      song: null,
      title: "",
      score: 0,
    });
    io.emit("playerList", players);
  });

  socket.on("ready", () => {
    const player = players.find((p) => p.id === socket.id);
    if (player) player.ready = true;
    io.emit("playerList", players);

    const allReady = players.length >= 2 && players.every((p) => p.ready);
    if (allReady) {
      io.emit("startSongSelection");
    }
  });

  socket.on("submitSong", ({ url, title }) => {
    const player = players.find((p) => p.id === socket.id);
    if (player) {
      player.song = url;
      player.title = title;
    }

    const allSubmitted = players.every((p) => p.song && p.title);
    if (allSubmitted && !roundInProgress) {
      playlist = [...players];
      currentIndex = 0;
      startNextRound();
    }
  });

  socket.on("guess", (msg) => {
    const player = players.find((p) => p.id === socket.id);
    const currentHost = playlist[currentIndex];
    if (!player || !currentHost || player.id === currentHost.id) return;

    const normalize = (text) =>
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^\w\s]/g, "")
        .trim();

    const guessText = normalize(msg.replace(`${player.name}:`, "").trim());
    const correctAnswer = normalize(currentHost.title);

    if (!player.hasGuessedCorrectly && guessText.includes(correctAnswer)) {
      const seconds = Math.floor((Date.now() - roundStartTime) / 1000);
      const points = Math.max(20, 100 - seconds * 2);
      player.score += points;
      player.hasGuessedCorrectly = true;

      io.emit("result", `${player.name} a ghicit corect! +${points} puncte`);
      io.emit(
        "scoreUpdate",
        players.map((p) => ({
          name: p.name,
          score: p.score,
        }))
      );
    } else {
      io.emit("result", msg);
    }
  });

  socket.on("restartGame", () => {
    players.forEach((p) => {
      p.ready = false;
      p.song = null;
      p.title = "";
      p.hasGuessedCorrectly = false;
    });
    playlist = [];
    currentIndex = 0;
    roundInProgress = false;
    io.emit("playerList", players);
    io.emit("restartClientUI");
  });

  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("playerList", players);
  });
});

function startNextRound() {
  roundInProgress = true;
  roundStartTime = Date.now();

  players.forEach((p) => (p.hasGuessedCorrectly = false));

  const host = playlist[currentIndex];
  const others = players.filter((p) => p.id !== host.id);

  io.to(host.id).emit("waitForOthers");
  others.forEach((p) => {
    io.to(p.id).emit("playSong", {
      url: host.song,
      hostName: host.name,
    });
  });

  setTimeout(() => {
    currentIndex++;
    if (currentIndex < playlist.length) {
      startNextRound();
    } else {
      io.emit("gameOver");
      roundInProgress = false;

      // Afișează clasamentul 7 secunde, apoi revine la lobby
      setTimeout(() => {
        players.forEach((p) => {
          p.ready = false;
          p.song = null;
          p.title = "";
          p.hasGuessedCorrectly = false;
          p.score = 0;
        });
        playlist = [];
        currentIndex = 0;
        io.emit("playerList", players);
        io.emit("restartClientUI");
      }, 7000);
    }
  }, 20000);
}

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
