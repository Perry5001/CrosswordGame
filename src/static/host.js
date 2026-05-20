import { buildGrid, cellSize, onFocus, setHighlightClue, setOnCellChange, applyRemoteCell, cells, setOnPositionChange, applyRemoteCursor, removeRemoteCursor } from "./crossword.js";

const API_BASE = window.location.hostname.includes("127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://crosswordgame-272p.onrender.com";

// ── State ─────────────────────────────────────────────────────────────────────
let cluesObjects = [];
let crossword    = null;
let connections  = [];   // { conn, peerId, username }
let hostUsername = "Host";
let gameStarted  = false;

// scores: plain data only — { [peerId]: { username, score } }
// "host" is used as the peerId for the host themselves
let scores = {};

// correctCells: tracks which cells each player currently has correct
// { [peerId]: Set of "r,c" strings }
let correctCells = {};

// ── Clue highlighting ─────────────────────────────────────────────────────────
function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue"); clue.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
setHighlightClue(highlightClue);

// When host types, recalculate host score then broadcast cell + scoreboard
setOnCellChange((r, c, value) => {
    broadcast({ type: "cell", r, c, value });
    recalculateScore("host", r, c, value);
});

// When host moves, broadcast position
setOnPositionChange((r, c, dir) => {
    broadcast({ type: "position", peerId: "host", username: hostUsername, r, c, dir });
});

// ── PeerJS ────────────────────────────────────────────────────────────────────
async function createPeer() {
    const res = await fetch(
        "https://crosswordgame.metered.live/api/v1/turn/credentials?apiKey=8a2733f5f1aca8286b3ea73f87d25035c8d5"
    );
    const iceServers = await res.json();

    const peer = new Peer(Math.random().toString(36).slice(2, 8), {
        config: { iceServers }
    });

    peer.on("open", (id) => {
        document.getElementById("peer-id").textContent = id;
        document.getElementById("game-peer-id").textContent = `Game Code: ${id}`;
    });

    peer.on('error', (err) => {
        console.error("PeerJS error:", err.type, err);
        document.getElementById('peer-id').textContent = `⚠️ PeerJS error: ${err.type}`;
    });
    peer.on('open', (id) => {
        const guestURL = `${window.location.origin}/guest?id=${id}`;
        document.getElementById('peer-id').innerHTML =
            `<span style="font-size:1.6em; font-weight:700; letter-spacing:0.08em; color:#1a1a1a;">${id}</span>
            <br><a href="${guestURL}" target="_blank" style="font-size:11px;">${guestURL}</a>`;
        document.getElementById('game-peer-id').innerHTML =
            `Code: <strong>${id}</strong> &nbsp;·&nbsp; <a href="${guestURL}" target="_blank">${guestURL}</a>`;
    });

    peer.on('connection', (conn) => {
        const entry = { conn, peerId: conn.peer, username: "Guest" };
        connections.push(entry);

        conn.on('open', () => {
            if (gameStarted && crossword) {
                conn.send({ type: "start", crossword });
                // Add to scoreboard when joining mid-game
                scores[entry.peerId] = { username: entry.username, score: 0 };
                correctCells[entry.peerId] = new Set();
                renderScoreboard();
                broadcastScoreboard();
            }
            broadcastPlayerList();
        });

        conn.on('data', (data) => {
            if (data?.type === "join") {
                entry.username = data.username || "Guest";
                renderScoreboard();
                broadcastPlayerList();

            } else if (data?.type === "username") {
                entry.username = data.username || entry.username;
                // Update name in scores if game already running
                if (scores[entry.peerId]) {
                    scores[entry.peerId].username = entry.username;
                    renderScoreboard();
                    broadcastScoreboard();
                }
                broadcastPlayerList();

            } else if (data?.type === "cell") {
                applyRemoteCell(data.r, data.c, data.value);
                // Relay to all other guests
                for (const other of connections) {
                    if (other !== entry && other.conn.open) {
                        other.conn.send({ type: "cell", r: data.r, c: data.c, value: data.value });
                    }
                }
                // Recalculate this guest's score
                recalculateScore(entry.peerId, data.r, data.c, data.value);

            } else if (data?.type === "position") {
                // Show this guest's cursor on the host's grid
                applyRemoteCursor(entry.peerId, entry.username, data.r, data.c, data.dir);
                // Relay to all other guests so they see it too
                for (const other of connections) {
                    if (other !== entry && other.conn.open) {
                        other.conn.send({ type: "position", peerId: entry.peerId, username: entry.username, r: data.r, c: data.c, dir: data.dir });
                    }
                }
            }
        });

        conn.on('close', () => {
            connections = connections.filter(e => e !== entry);
            delete scores[entry.peerId];
            delete correctCells[entry.peerId];
            removeRemoteCursor(entry.peerId);
            // Tell guests to remove this cursor too
            broadcast({ type: "position", peerId: entry.peerId, username: '', r: -1, c: -1 });
            broadcastPlayerList();
            broadcastScoreboard();
        });
    });
}

createPeer();

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

// ── Scoreboard ────────────────────────────────────────────────────────────────

// Count how many cells in the grid have the correct letter.
// crossword.solution holds the answer string; cells[][] holds current inputs.
// We attribute every filled cell to a single player for simplicity — this
// function counts ALL correct cells for that peerId by reading the shared grid.
// For proper per-player attribution you'd track who typed each cell separately.
function recalculateScore(peerId, row, col, value) {
    if (!crossword?.solution || !gameStarted) return;
    if (!scores[peerId]) return;

    const sol = crossword.solution;
    const idx = row * crossword.width + col;
    if (sol[idx] === '.') return;   // black cell, ignore

    const key = `${row},${col}`;
    const wasCorrect = correctCells[peerId]?.has(key) ?? false;
    const isCorrect  = value !== '' && value === sol[idx];

    if (isCorrect && !wasCorrect) {
        // Newly correct — give a point
        scores[peerId].score++;
        correctCells[peerId].add(key);
    } else if (!isCorrect && wasCorrect) {
        // Was correct, now wrong or cleared — take a point back
        scores[peerId].score--;
        correctCells[peerId].delete(key);
    }
    // If neither condition, score doesn't change (wrong→wrong, empty→empty)

    renderScoreboard();
    broadcastScoreboard();
}

function broadcastScoreboard() {
    // Send plain serialisable data — no DOM elements
    const scoreData = Object.entries(scores).map(([peerId, s]) => ({
        peerId,
        username: s.username,
        score: s.score
    }));
    broadcast({ type: "scoreboard", scores: scoreData });
}

function renderScoreboard() {
    const el = document.getElementById('scoreboard');
    if (!el) return;
    el.innerHTML = '';
    for (const [peerId, s] of Object.entries(scores)) {
        const li = document.createElement('li');
        li.textContent = `${s.username}: ${s.score}`;
        li.dataset.peerId = peerId;
        el.appendChild(li);
    }
}

function initScoreboard() {
    scores = {};
    correctCells = {};
    // Add host
    scores["host"] = { username: hostUsername, score: 0 };
    correctCells["host"] = new Set();
    // Add all connected guests
    for (const entry of connections) {
        scores[entry.peerId] = { username: entry.username, score: 0 };
        correctCells[entry.peerId] = new Set();
    }
    renderScoreboard();
    broadcastScoreboard();
}

// ── Username ──────────────────────────────────────────────────────────────────
document.getElementById('setUsernameBtn').addEventListener('click', () => {
    const val = document.getElementById('hostUsername').value.trim();
    if (!val) return;
    hostUsername = val;
    document.getElementById('usernameStatus').textContent = `Name set to "${hostUsername}"`;
    if (scores["host"]) scores["host"].username = hostUsername;
    broadcastPlayerList();
    broadcastScoreboard();
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
    initScoreboard();
    renderPuzzle(crossword);
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
            status.textContent = `Loaded: ${crossword.title || file.name}`;
            document.getElementById('startBtn').disabled = false;
        })
        .catch(err => {
            status.textContent = "Upload failed — is the server running?";
            console.error(err);
        });
    };
    reader.readAsArrayBuffer(file);
});

// ── Archive ────────────────────────────────────────────────────────────────────

document.getElementById('archiveBtn').addEventListener('click', async () => {
    document.getElementById("archiveBtn").hidden = true;
    let selectors = document.getElementById("selectors")
    selectors.hidden = false;
    let sourceSelector = document.getElementById("source")
    let yearSelector = document.getElementById("year")
    let monthSelector = document.getElementById("month")
    let daySelector = document.getElementById("day")

    await renderSources(sourceSelector);
    await renderYears(sourceSelector, yearSelector);
    await renderMonths(sourceSelector, yearSelector, monthSelector);
    await renderDays(sourceSelector, yearSelector, monthSelector, daySelector);

    sourceSelector.addEventListener('change', () => selectorChange(0));
    yearSelector.addEventListener('change', () => selectorChange(1));
    monthSelector.addEventListener('change', () => selectorChange(2));
    daySelector.addEventListener('change', () => selectorChange(3));

});

document.getElementById('getPuzzle').addEventListener('click', async () => {
    let source = document.getElementById("source").value
    let year = document.getElementById("year").value
    let month = document.getElementById("month").value
    let day = document.getElementById("day").value
    console.log(`${source}, ${year}, ${month}, ${day}, `)

    await fetch(`${API_BASE}/get-puzzle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({"source": source, "year": year, "month": month, "day" : day})
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { status.textContent = `Error: ${data.error}`; return; }
        crossword = data;
        const status = document.getElementById('upload-status');
        status.textContent = `Loaded: ${crossword.title || file.name}`;
        document.getElementById('startBtn').disabled = false;
    })
    .catch(err => {
        console.error(err);
    });
});

async function renderSources(sourceSelector) {
    //Load sources
    await fetch(`${API_BASE}/sources-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({"msg": "hello"})
    })
    .then(r => r.json())
    .then(data => {
        for (let source of data.sources){
            let option = document.createElement("option")
            option.value = source
            option.innerHTML = source
            sourceSelector.appendChild(option)
        }

        sourceSelector.children[0].selected = true;
    })
    .catch(err => {
        console.error(err);
    });
}

async function renderYears(sourceSelector, yearSelector) {
    
    let source = sourceSelector.value
    console.log(source)

    //Load sources
    await fetch(`${API_BASE}/years-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({"source": source})
    })
    .then(r => r.json())
    .then(data => {
        let value = yearSelector.children.length
        for (let i = 0; i < value; i++){ 
            console.log(value);
            yearSelector.children[0].remove();
        }

        for (let year of data.years){
            let option = document.createElement("option")
            option.value = year
            option.innerHTML = year
            yearSelector.appendChild(option)
        }

        yearSelector.children[0].selected = true;
    })
    .catch(err => {
        console.error(err);
    });
}

async function renderMonths(sourceSelector, yearSelector, monthSelector) {
    
    let source = sourceSelector.value
    let year = yearSelector.value
    
    console.log(source)
    console.log(year)

    //Load sources
    await fetch(`${API_BASE}/months-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({"source": source, "year": year})
    })
    .then(r => r.json())
    .then(data => {
        let value = monthSelector.children.length
        for (let i = 0; i < value; i++){ 
            monthSelector.children[0].remove();
        }

        for (let month of data.months){
            let option = document.createElement("option")
            option.value = month
            option.innerHTML = month
            monthSelector.appendChild(option)
        }

        monthSelector.children[0].selected = true;
    })
    .catch(err => {
        console.error(err);
    });
}

async function renderDays(sourceSelector, yearSelector, monthSelector, daySelector) {
    
    let source = sourceSelector.value
    let year = yearSelector.value
    let month = monthSelector.value

    //Load sources
    await fetch(`${API_BASE}/days-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({"source": source, "year": year, "month": month})
    })
    .then(r => r.json())
    .then(data => {
        let value = daySelector.children.length
        for (let i = 0; i < value; i++){ 
            daySelector.children[0].remove();
        }

        for (let day of data.days){
            let option = document.createElement("option")
            option.value = day
            option.innerHTML = day
            daySelector.appendChild(option)
        }

        daySelector.children[0].selected = true;
        document.getElementById('getPuzzle').disabled = false;
    })
    .catch(err => {
        console.error(err);
    });
}

async function selectorChange(num){
    let sourceSelector = document.getElementById("source")
    let yearSelector = document.getElementById("year")
    let monthSelector = document.getElementById("month")
    let daySelector = document.getElementById("day")

    switch (num){
        case 0:
            console.log("Source has been changed")
            await renderYears(sourceSelector, yearSelector);
            await renderMonths(sourceSelector, yearSelector, monthSelector);
            await renderDays(sourceSelector, yearSelector, monthSelector, daySelector);
            break;
        case 1:
            console.log("Year has been changed")
            await renderMonths(sourceSelector, yearSelector, monthSelector);
            await renderDays(sourceSelector, yearSelector, monthSelector, daySelector);
            break;
        case 2:
            console.log("Month has been changed")
            await renderDays(sourceSelector, yearSelector, monthSelector, daySelector);
            break;
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderPuzzle(cw) {
    buildGrid(cw.width, cw.height, cw.fill);
    const acrosslist = document.getElementById('acrossList');
    const downlist   = document.getElementById('downList');
    acrosslist.style.height   = cellSize * cw.height - 28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height     = cellSize * cw.height - 28 + 'px';
    downlist.style.overflowY  = 'auto';
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