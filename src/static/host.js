import { buildGrid, cellSize, onFocus, updateCellStatus, setHighlightClue, setOnCellChange, applyRemoteCell, cells, setOnPositionChange, applyRemoteCursor, removeRemoteCursor, crosswordString, direction, peerColor, checkSolve } from "./crossword.js";

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

//pendingReveals: tracks which players have asked to reveal which cells
// { "r,c" as string : [peerID_1, peerID_2, ...]}
// pendingReveals["puzzle"] is reused (as a Set of peerIds) to track votes
// for a full-puzzle reveal.
let pendingReveals = {};

// gameOver: true once the puzzle has been fully solved/revealed and the
// end-game popup has been broadcast, so we don't fire it more than once.
let gameOver = false;

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
    broadcast({ type: "cell", r, c, value, peerId: "host"});
    recalculateScore("host", r, c, value);
    updateCellStatus("self", r, c, value);
    checkGameOverCondition();
});

// When host moves, broadcast position
setOnPositionChange((r, c, dir) => {
    broadcast({ type: "position", peerId: "host", username: hostUsername, r, c, dir });
});

// ── PeerJS ────────────────────────────────────────────────────────────────────
async function createPeer() {
    let hostid = Math.random().toString(36).slice(2, 8);
    hostid = 987654
    const peer = new Peer(hostid, { config: { iceServers: [
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "75d1952d9c5038c533d1f7d0",
            credential: "p8ezSCXYfu1Py8TO",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "75d1952d9c5038c533d1f7d0",
            credential: "p8ezSCXYfu1Py8TO",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "75d1952d9c5038c533d1f7d0",
            credential: "p8ezSCXYfu1Py8TO",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "75d1952d9c5038c533d1f7d0",
            credential: "p8ezSCXYfu1Py8TO",
        }
    ]} });

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
                renderPlayerListGame();
                broadcastScoreboard();
            }
            broadcastPlayerList();
        });

        conn.on('data', (data) => {
            switch (data?.type){
                case "join":
                    entry.username = data.username || "Guest";
                    renderPlayerListGame();
                    broadcastPlayerList();
                    break;
                case "username":
                    entry.username = data.username || entry.username;
                    // Update name in scores if game already running
                    if (scores[entry.peerId]) {
                        scores[entry.peerId].username = entry.username;
                        renderPlayerListGame();
                        broadcastScoreboard();
                    }
                    broadcastPlayerList();
                    break;
                case "cell":
                    applyRemoteCell(data.r, data.c, data.value, entry.peerId);
                    // Relay to all other guests
                    for (const other of connections) {
                        if (other !== entry && other.conn.open) {
                            other.conn.send({ type: "cell", r: data.r, c: data.c, value: data.value, peerId: entry.peerId});
                        }
                    }
                    // Recalculate this guest's score
                    recalculateScore(entry.peerId, data.r, data.c, data.value);
                    checkGameOverCondition();
                    break;
                case "revealPuzzleRequest":
                    requestRevealPuzzle(entry.peerId, entry.username);
                    break;
                case "revealPuzzleVote":
                    voteRevealPuzzle(entry.peerId, data.vote);
                    break;
                case "position":
                    // Show this guest's cursor on the host's grid
                    applyRemoteCursor(entry.peerId, entry.username, data.r, data.c, data.dir);
                    // Relay to all other guests so they see it too
                    for (const other of connections) {
                        if (other !== entry && other.conn.open) {
                            other.conn.send({ type: "position", peerId: entry.peerId, username: entry.username, r: data.r, c: data.c, dir: data.dir });
                        }
                    }
                    break;
                case "revealPending":
                    switch (data.level){
                        case "letter":
                            revealLetterPending(entry.peerId, data.r, data.c);
                            break;
                        case "word":
                            revealWordPending(entry.peerId, data.r, data.c, data.dir);
                    }
                    break;
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
            renderPlayerListGame();
            // If they were part of an in-progress reveal-puzzle vote, drop
            // them from it and re-check whether everyone remaining agrees.
            if (pendingReveals["puzzle"]) {
                pendingReveals["puzzle"].delete(entry.peerId);
                updateRevealPuzzleStatus();
                if (pendingReveals["puzzle"].size === totalPlayers()) {
                    performRevealPuzzle();
                }
            }
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

function broadcastOthers(peerId, msg) {
    for (const entry of connections) {
        if(entry.peerId != peerId){
            if (entry.conn.open) entry.conn.send(msg);
        }
    }
}

// Kick a connected guest. Confirms with the host, tells the guest why their
// connection is closing, then closes it. All bookkeeping (removing them from
// scores/correctCells/connections, clearing remote cursors, re-broadcasting
// the player list & scoreboard, and settling any in-progress reveal-puzzle
// vote) is already handled by the conn.on('close') listener, so we don't
// duplicate it here — we just trigger the close.
// kickTargetPeerId: peerId currently awaiting confirmation in the kick popup
let kickTargetPeerId = null;

function kickPlayer(peerId) {
    if (peerId === "host") return; // can't kick yourself
    const entry = connections.find(e => e.peerId === peerId);
    if (!entry) return;

    kickTargetPeerId = peerId;
    document.getElementById('kick-confirm-message').textContent =
        `Are you sure you want to remove ${entry.username} from the game?`;
    document.getElementById('kick-confirm').style.display = 'flex';
}

document.getElementById('kickConfirmYes').addEventListener('click', () => {
    document.getElementById('kick-confirm').style.display = 'none';
    if (!kickTargetPeerId) return;
    const entry = connections.find(e => e.peerId === kickTargetPeerId);
    kickTargetPeerId = null;
    if (!entry) return;

    if (entry.conn.open) {
        entry.conn.send({ type: "kicked" });
        // Give the message a moment to actually go out over the data
        // channel before we tear it down.
        setTimeout(() => entry.conn.close(), 150);
    } else {
        entry.conn.close();
    }
});

document.getElementById('kickConfirmNo').addEventListener('click', () => {
    kickTargetPeerId = null;
    document.getElementById('kick-confirm').style.display = 'none';
});

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

    //renderScoreboard();
    //broadcastScoreboard();
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

function renderPlayerListGame() {
    const el = document.getElementById('player-list-game');
    if (!el) return;
    el.innerHTML = '';
    for (const [peerId, s] of Object.entries(scores)) {
        const li = document.createElement('li');
        li.dataset.peerId = peerId;
        if (peerId !== "host"){
            li.classList.add("non-host-player");
            li.title = `Click to kick ${s.username}`;
            li.innerHTML = `<span>${s.username}: ${s.score}</span><span class="kick-icon">✕</span>`;
            li.addEventListener('click', () => kickPlayer(peerId));
        } else {
            li.textContent = `${s.username}: ${s.score}`;
        }
        el.appendChild(li);
    }
}

function initScoreboard() {
    gameOver = false;
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
    correctCells["revealed"] = new Set();
    renderPlayerListGame();
    //renderScoreboard();
    //broadcastScoreboard();
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
    buildGrid(cw.width, cw.height, cw.fill, cw.solution);
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

// ── Reveal ────────────────────────────────────────────────────────────────────
document.getElementById("revealLetter").addEventListener('click', () => {
    revealLetterPending("host");
});

document.getElementById("revealWord").addEventListener('click', () => {
    revealWordPending("host");
});

document.getElementById("revealPuzzle").addEventListener('click', () => {
    requestRevealPuzzle("host", hostUsername);
});

document.getElementById("revealPuzzleYes").addEventListener('click', () => {
    document.getElementById("revealPuzzleYes").disabled = true;
    document.getElementById("revealPuzzleNo").disabled = true;
    voteRevealPuzzle("host", "yes");
});

document.getElementById("revealPuzzleNo").addEventListener('click', () => {
    voteRevealPuzzle("host", "no");
});

document.getElementById("closeEndGame").addEventListener('click', () => {
    document.getElementById("end-game").style.display = "none";
});

function revealLetterPending(peerId, row=null, col=null) {
    let cell;
    if(peerId === "host" && (row === null || col === null)){
        cell = document.getElementsByClassName("focused")[0];
        row = parseInt(cell.dataset.r);
        col = parseInt(cell.dataset.c);
    }else{
        cell = document.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    }
    
    //Add the peerId to cell's reveal pending
    const key = `${row}, ${col}`;
    if (!Object.hasOwn(pendingReveals, key)) pendingReveals[key] = new Set();
    pendingReveals[key].add(peerId);

    //Check if everyone has allowed reveal
    if (pendingReveals[key].size == connections.length + 1){
        revealLetter(row, col);
    }else{
        //Turn square red
        cell.classList += " pending";
        //Broadcast the square being red
        broadcastOthers(peerId, {type:"revealPending", level: "letter", r: row, c: col});

    }
    
}

function revealWordPending(peerId, row=null, col=null, dir=null) {
    let mainCell;
    let wordCells;
    //Get Main Cell
    if(peerId === "host"){
        mainCell = document.getElementsByClassName("focused")[0];
        row = parseInt(mainCell.dataset.r);
        col = parseInt(mainCell.dataset.c);
        dir = direction;
    }else{
        mainCell = document.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    }

    console.log(dir);

    //Get all cells + reveal letter pendings on them
    if (dir === 'across') {
        let start = col;
        while (start > 0 && !cells[row][start - 1].isBlack) start--;
        let end = col;
        while (end < cells[row].length - 1 && !cells[row][end + 1].isBlack) end++;
        for (let cc = start; cc <= end; cc++){
            revealLetterPending(peerId, row ,cc);
        }
    } else {
        let start = row;
        while (start > 0 && !cells[start - 1][col].isBlack) start--;
        let end = row;
        while (end < cells.length - 1 && !cells[end + 1][col].isBlack) end++;
        for (let rr = start; rr <= end; rr++){
            revealLetterPending(peerId, rr, col);
        }
    }



}

function revealLetter(row, col){
    const sol = crossword.solution;
    const idx = row * crossword.width + col;
    if (sol[idx] === '.') return;   // black cell, ignore
    if (cells[row] && cells[row][col] && !cells[row][col].isBlack) {
        cells[row][col].inp.value = sol[idx];
        cells[row][col].status.style.display = "";
        cells[row][col].status.style.color = "#f00";
    }
    cells[row][col].div.classList.remove("pending");
    // Keep the shared solve-tracking string in sync so reveals (not just
    // typing) can trigger the game-over check below.
    checkSolve(row, col, sol[idx]);
    broadcast({type:"revealLetter", r: row, c: col, value: sol[idx]});
    checkGameOverCondition();
};

// ── Reveal Puzzle (unanimous vote + popup) ─────────────────────────────────────
function totalPlayers() {
    return connections.length + 1; // + host
}

function usernameFor(peerId) {
    if (peerId === "host") return hostUsername;
    return connections.find(e => e.peerId === peerId)?.username ?? "Guest";
}

function requestRevealPuzzle(requesterPeerId, requesterUsername) {
    if (pendingReveals["puzzle"]) return; // a vote is already in progress
    pendingReveals["puzzle"] = new Set([requesterPeerId]);
    showRevealPuzzlePopup(requesterUsername);
    broadcast({ type: "revealPuzzlePopup", requester: requesterUsername });
    updateRevealPuzzleStatus();
}

function voteRevealPuzzle(peerId, vote) {
    if (!pendingReveals["puzzle"]) return;
    if (vote === "no") {
        cancelRevealPuzzle();
        return;
    }
    pendingReveals["puzzle"].add(peerId);
    updateRevealPuzzleStatus();
    if (pendingReveals["puzzle"].size === totalPlayers()) {
        performRevealPuzzle();
    }
}

function cancelRevealPuzzle() {
    delete pendingReveals["puzzle"];
    hideRevealPuzzlePopup();
    broadcast({ type: "revealPuzzleCancelled" });
}

function performRevealPuzzle() {
    delete pendingReveals["puzzle"];
    hideRevealPuzzlePopup();
    broadcast({ type: "revealPuzzleDone" });
    for (let r = 0; r < crossword.height; r++) {
        for (let c = 0; c < crossword.width; c++) {
            if (crossword.solution[r * crossword.width + c] === '.') continue;
            revealLetter(r, c);
        }
    }
}

function updateRevealPuzzleStatus() {
    const set = pendingReveals["puzzle"];
    if (!set) return;
    const allPeerIds    = ["host", ...connections.map(e => e.peerId)];
    const allPlayers    = allPeerIds.map(pid => ({ peerId: pid, username: usernameFor(pid) }));
    const agreedPeerIds = [...set];
    renderRevealPuzzleStatus(agreedPeerIds, allPlayers);
    broadcast({ type: "revealPuzzleStatus", agreed: agreedPeerIds, all: allPlayers });
}

function renderRevealPuzzleStatus(agreedPeerIds, allPlayers) {
    const ul = document.getElementById('reveal-puzzle-status');
    if (!ul) return;
    ul.innerHTML = '';
    for (const p of allPlayers) {
        const li = document.createElement('li');
        const agreed = agreedPeerIds.includes(p.peerId);
        li.innerHTML = `<span>${p.username}</span><span class="${agreed ? 'vote-check' : 'vote-waiting'}">${agreed ? '✓' : '…'}</span>`;
        ul.appendChild(li);
    }
}

function showRevealPuzzlePopup(requesterUsername) {
    document.getElementById('reveal-puzzle-message').textContent =
        `${requesterUsername} wants to reveal the entire puzzle. Everyone must agree.`;
    document.getElementById('revealPuzzleYes').disabled = false;
    document.getElementById('revealPuzzleNo').disabled = false;
    document.getElementById('reveal-puzzle').style.display = 'flex';
}

function hideRevealPuzzlePopup() {
    document.getElementById('reveal-puzzle').style.display = 'none';
}

// ── Game Over ───────────────────────────────────────────────────────────────
function checkGameOverCondition() {
    if (gameOver || !crossword?.solution) return;
    if (crosswordString !== crossword.solution) return;
    gameOver = true;
    const scoreData = Object.entries(scores).map(([peerId, s]) => ({
        peerId, username: s.username, score: s.score
    }));
    broadcast({ type: "gameOver", scores: scoreData });
    showEndGamePopup(scoreData);
}

function showEndGamePopup(scoreData) {
    const sorted = [...scoreData].sort((a, b) => b.score - a.score);
    const topScore = sorted[0]?.score;
    const ol = document.getElementById('end-game-scores');
    ol.innerHTML = '';
    sorted.forEach((s, i) => {
        const li = document.createElement('li');
        if (s.score === topScore) li.classList.add('winner');
        li.innerHTML = `<span><span class="rank">${i + 1}.</span>${s.username}</span><span>${s.score}</span>`;
        ol.appendChild(li);
    });
    document.getElementById('end-game').style.display = 'flex';
}

// ── Checking ────────────────────────────────────────────────────────────────────
document.getElementById("checkPuzzle").addEventListener('click', () => {
    console.log(crosswordString);
});

// Init player list with just the host
renderPlayerList([{ username: hostUsername, isHost: true }]);