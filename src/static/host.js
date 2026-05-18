import { buildGrid, cellSize, onFocus, setHighlightClue, setOnCellChange, applyRemoteCell } from "./crossword.js";

const API_BASE = window.location.hostname.includes("127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://crosswordgame-272p.onrender.com";

// ── State ─────────────────────────────────────────────────────────────────────
let cluesObjects = [];
let crossword    = null;
let connections  = [];          // { conn, peerId, username }
let hostUsername = "Host";
let gameStarted  = false;
let scores = {};

// ── Clue highlighting ─────────────────────────────────────────────────────────
function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue");
}
setHighlightClue(highlightClue);

// When host types, broadcast to all guests
setOnCellChange((r, c, value) => {
    broadcast({ type: "cell", r, c, value });
});

// ── PeerJS ────────────────────────────────────────────────────────────────────
const peer = new Peer(Math.random().toString(36).slice(2, 8), {
    config: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
        ]
    },
    debug: 2
});

peer.on('error', (err) => {
    console.error("PeerJS error:", err.type, err);
    document.getElementById('peer-id').textContent = `⚠️ PeerJS error: ${err.type}`;
});

peer.on('open', (id) => {
    const guestURL = `${window.location.origin}/guest?id=${id}`;
    document.getElementById('peer-id').innerHTML =
        `Invite link: <a href="${guestURL}" target="_blank">${guestURL}</a>`;
    document.getElementById('game-peer-id').innerHTML =
        `Invite link: <a href="${guestURL}" target="_blank">${guestURL}</a>`;
});

peer.on('connection', (conn) => {
    const entry = { conn, peerId: conn.peer, username: "Guest" };
    connections.push(entry);

    conn.on('open', () => {
        // If game already started send them the current state
        if (gameStarted && crossword) {
            conn.send({ type: "start", crossword });
            updateScoreboard(conn.peer, entry.username, "0");
        }
        // Always send current player list
        broadcastPlayerList();
    });

    conn.on('data', (data) => {
        if (data?.type === "join") {
            entry.username = data.username || "Guest";
            broadcastPlayerList();
        } else if (data?.type === "username") {
            entry.username = data.username || entry.username;
            broadcastPlayerList();
            updateScoreboard(conn.peer, entry.username, "0");
        } else if (data?.type === "cell") {
            applyRemoteCell(data.r, data.c, data.value);
            // Relay to all other guests
            for (const other of connections) {
                if (other !== entry && other.conn.open) {
                    other.conn.send({ type: "cell", r: data.r, c: data.c, value: data.value });
                }
            }
        }
    });

    conn.on('close', () => {
        connections = connections.filter(e => e !== entry);
        broadcastPlayerList();
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function broadcast(msg) {
    for (const entry of connections) {
        if (entry.conn.open) entry.conn.send(msg);
    }
}

function broadcastPlayerList() {
    const players = [
        { username: hostUsername, isHost: true },
        ...connections.map(e => ({ username: e.username, isHost: false }))
    ];
    renderPlayerList(players);
    broadcast({ type: "player-list", players });
    // Enable start only if puzzle is loaded
    document.getElementById('startBtn').disabled = !crossword;
}

function renderPlayerList(players) {
    const ul = document.getElementById('player-list');
    ul.innerHTML = '';
    document.getElementById('player-count').textContent = `(${players.length})`;
    for (const p of players) {
        const li = document.createElement('li');
        li.textContent = p.isHost ? `${p.username} (you, host)` : p.username;
        ul.appendChild(li);
    }
}

// ── Username ──────────────────────────────────────────────────────────────────
document.getElementById('setUsernameBtn').addEventListener('click', () => {
    const val = document.getElementById('hostUsername').value.trim();
    if (!val) return;
    hostUsername = val;
    document.getElementById('usernameStatus').textContent = `Name set to "${hostUsername}"`;
    broadcastPlayerList();
});

document.getElementById('hostUsername').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('setUsernameBtn').click();
});

// ── Start button ──────────────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => {
    if (!crossword) return;
    gameStarted = true;
    broadcast({ type: "start", crossword });
    showGame();
});

function showGame() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display  = 'block';
    document.getElementById('puzzle-title').textContent = crossword.title || "Crossword";
    renderScoreboard();
    renderPuzzle(crossword);
}

// ── Scoreboard ─────────────────────────────────────────────────────────────

function renderScoreboard() {
    //Add host
    let item = document.createElement("ul");
    item.classList += "user"
    item.innerHTML = `${hostUsername}: `;
    let score = document.createElement("p");
    score.innerHTML = "0"
    item.append(score);
    item.dataset.peerid = "host"
    scores["host"] = [item, score]
    document.getElementById('scoreboard').append(item);

    //Add other connections
    for (connection in connections){
        const {conn, peerId, username} = connection;
        let item = document.createElement("ul");
        item.classList += "user"
        item.innerHTML = `${username}: `;
        let score = document.createElement("p");
        score.innerHTML = "0";
        item.append(score);
        item.dataset.peerid = peerId;
        scores[peerId] = [item, score];
        document.getElementById('scoreboard').append(item);
    }
}

function updateScoreboard(peerId, username=null, score=null){
    if(Object.hasOwn(scores,peerID) && username){
        let user = scores[peerID];
        user[0].innerHTML = `${username}: `;
    }
    if(Object.hasOwn(scores,peerID) && score){
        let user = scores[peerID];
        user[1].innerHTML = score;
    }else{
        let item = document.createElement("ul");
        item.classList += "user"
        item.innerHTML = `${username ? username : "Guest"}: `;
        let score = document.createElement("p")
        score.innerHTML = score ? score: "0";
        item.append(score);
        item.dataset.peerid = peerId
        scores[peerId] = [item, score]
        document.getElementById('scoreboard').append(item);
    }
}

// ── Puzzle upload ─────────────────────────────────────────────────────────────
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('upload-status');
    status.textContent = "Parsing puzzle…";

    const reader = new FileReader();
    reader.onload = () => {
        const bytes = new Uint8Array(reader.result);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        fetch(`${API_BASE}/upload-puzzle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bytes: base64 })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) { status.textContent = `Error: ${data.error}`; return; }
            crossword = data;
            status.textContent = `✅ Loaded: ${crossword.title || file.name}`;
            // Enable start now that we have a puzzle
            document.getElementById('startBtn').disabled = false;
        })
        .catch(err => {
            status.textContent = "Upload failed — is the server running?";
            console.error(err);
        });
    };
    reader.readAsArrayBuffer(file);
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderPuzzle(cw) {
    buildGrid(cw.width, cw.height, cw.fill);
    const acrosslist = document.getElementById('acrossList');
    const downlist   = document.getElementById('downList');
    acrosslist.style.height  = cellSize * cw.height - 28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height    = cellSize * cw.height - 28 + 'px';
    downlist.style.overflowY = 'auto';
    buildClues(cw.clues);
}

function buildClues(clues) {
    const acrossList = document.getElementById('acrossList');
    const downList   = document.getElementById('downList');
    acrossList.innerHTML = '';
    downList.innerHTML   = '';
    cluesObjects = [];

    for (const clue of clues.across) {
        const li = document.createElement('li');
        li.textContent = `${clue.num}. ${clue.clue}`;
        li.classList.add("clue");
        li.dataset.r = clue.row; li.dataset.c = clue.col;
        li.dataset.num = clue.num; li.dataset.dir = "across";
        cluesObjects.push({ div: li });
        li.addEventListener('click', () => clueOnClick(clue.row, clue.col, "across"));
        acrossList.appendChild(li);
    }
    for (const clue of clues.down) {
        const li = document.createElement('li');
        li.textContent = `${clue.num}. ${clue.clue}`;
        li.classList.add("clue");
        li.dataset.r = clue.row; li.dataset.c = clue.col;
        li.dataset.num = clue.num; li.dataset.dir = "down";
        cluesObjects.push({ div: li });
        li.addEventListener('click', () => clueOnClick(clue.row, clue.col, "down"));
        downList.appendChild(li);
    }
}

function clueOnClick(r, c, dir) {
    highlightClue(r, c, null, dir);
    document.querySelector(`[data-r="${r}"][data-c="${c}"]`).querySelector('input').focus();
    onFocus(r, c, dir);
}

// Init player list with just the host
renderPlayerList([{ username: hostUsername, isHost: true }]);