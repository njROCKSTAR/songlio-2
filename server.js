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

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (name) => {
    players.push({ id: socket.id, name, ready: false, song: null });
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

  socket.on("submitSong", (url) => {
    const player = players.find((p) => p.id === socket.id);
    if (player) player.song = url;

    const allSubmitted = players.every((p) => p.song);
    if (allSubmitted && !roundInProgress) {
      playlist = [...players];
      currentIndex = 0;
      startNextRound();
    }
  });

  socket.on("guess", (msg) => {
    io.emit("result", msg);
  });

  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("playerList", players);
  });
});

function startNextRound() {
  roundInProgress = true;

  const host = playlist[currentIndex];
  const others = players.filter((p) => p.id !== host.id);

  // Host așteaptă
  io.to(host.id).emit("waitForOthers");

  // Ceilalți primesc melodia
  others.forEach((p) => {
    io.to(p.id).emit("playSong", {
      url: host.song,
      hostName: host.name,
    });
  });

  // După 20 secunde trece la următorul
  setTimeout(() => {
    currentIndex++;
    if (currentIndex < playlist.length) {
      startNextRound();
    } else {
      io.emit("gameOver");
      roundInProgress = false;
      players.forEach((p) => {
        p.ready = false;
        p.song = null;
      });
      playlist = [];
      currentIndex = 0;
    }
  }, 20000);
}

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
