import { buildGrid, cellSize, cells, updateCellStatus, onFocus, setHighlightClue, setOnCellChange, applyRemoteCell, setOnPositionChange, applyRemoteCursor, removeRemoteCursor, direction } from "./crossword.js";

// ── State ─────────────────────────────────────────────────────────────────────
let cluesObjects  = [];
let guestUsername = "Guest";
let conn          = null;
let peerId = "";

const log = (msg) => {
    const el = document.getElementById("log");
    if (el) el.textContent = msg;
};

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

// When guest types, send to host
setOnCellChange((r, c, value) => {
    if (conn && conn.open) conn.send({ type: "cell", r, c, value });
    updateCellStatus("self", r, c, value, peerId);
});

// When guest moves, send position to host
setOnPositionChange((r, c, dir) => {
    if (conn && conn.open) conn.send({ type: "position", r, c, dir });
});

// ── Username ──────────────────────────────────────────────────────────────────
document.getElementById('setUsernameBtn').addEventListener('click', () => {
    const val = document.getElementById('guestUsername').value.trim();
    if (!val) return;
    guestUsername = val;
    document.getElementById('usernameStatus').textContent = `Name set to "${guestUsername}"`;
    if (conn && conn.open) conn.send({ type: "username", username: guestUsername });
});

document.getElementById('guestUsername').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('setUsernameBtn').click();
});

// ── Game Code ──────────────────────────────────────────────────────────────────
document.getElementById('joinBtn').addEventListener('click', () => {
    const val = document.getElementById('gameCode').value.trim();
    if (!val) return;
    console.log(val.length);
    if (val.length != 6) {document.getElementById('gameCodeStatus').textContent = `Game code must be 6 characters.`; return;}
    hostID = val;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("id", hostID);
    window.history.pushState({}, '', currentUrl);
    createPeer();
});

document.getElementById('gameCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('joinBtn').click();
});

// ── Player list ───────────────────────────────────────────────────────────────
function renderPlayerList(players) {
    const ul = document.getElementById('player-list');
    ul.innerHTML = '';
    for (const p of players) {
        const li = document.createElement('li');
        li.textContent = p.isHost
            ? `${p.username} (host)`
            : p.username === guestUsername
                ? `${p.username} (you)`
                : p.username;
        ul.appendChild(li);
    }
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
// Receives plain data from host: [{ peerId, username, score }, ...]
//!!Need to change this to render the popup and not the list
function renderScoreboard(scoreData) {
    const el = document.getElementById('scoreboard');
    if (!el) return;
    el.innerHTML = '';
    for (const s of scoreData) {
        const li = document.createElement('li');
        li.textContent = `${s.username}: ${s.score}`;
        li.dataset.peerId = s.peerId;
        el.appendChild(li);
    }
}

// ── Reveal ────────────────────────────────────────────────────────────────
function initHelpSection(){
    document.getElementById("revealLetter").addEventListener('click', () => {
        revealLetterPending();
    });

    document.getElementById("revealWord").addEventListener('click', () => {
        revealWordPending();
    });

    document.getElementById("revealPuzzle").addEventListener('click', () => {
        //revealPuzzlePending();
    });
}

//Letter
function revealLetterPending(){
    let cell = document.getElementsByClassName("focused")[0];
    if (!cell) return;
    let row = parseInt(cell.dataset.r);
    let col = parseInt(cell.dataset.c);
    if (conn && conn.open) conn.send({ type: "revealPending", level: "letter", r: row, c: col});
    renderRevealLetterPending(row, col);
}

function renderRevealLetterPending(row, col){
    let cell = document.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    //Turn square red
    cell.classList.add("pending");
}

function revealLetter(row, col, value){
    let cell = document.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    cell.classList.remove("pending");
    if (cells[row] && cells[row][col] && !cells[row][col].isBlack) {
        cells[row][col].inp.value = value;
        cells[row][col].status.style.display = "";
        cells[row][col].status.style.color = "#f00";
    }
}

//Word
function revealWordPending(){
    let cell = document.getElementsByClassName("focused")[0];
    if (!cell) return;
    let row = parseInt(cell.dataset.r);
    let col = parseInt(cell.dataset.c);
    if (conn && conn.open) conn.send({ type: "revealPending", level: "word", r: row, c: col, dir: direction});
    renderRevealWordPending(row, col, direction);
}

function renderRevealWordPending(row, col, dir){
    let wordCells;
    let mainCell = document.querySelector(`[data-r="${row}"][data-c="${col}"]`);

    console.log(dir);
    //Get all cells + reveal letter pendings on them
    if (dir === 'across') {
        let start = col;
        while (start > 0 && !cells[row][start - 1].isBlack) start--;
        let end = col;
        while (end < cells[row].length - 1 && !cells[row][end + 1].isBlack) end++;
        for (let cc = start; cc <= end; cc++){
            renderRevealLetterPending(row ,cc);
        }
    } else {
        let start = row;
        while (start > 0 && !cells[start - 1][col].isBlack) start--;
        let end = row;
        while (end < cells.length - 1 && !cells[end + 1][col].isBlack){ console.log(end); end++;}
        for (let rr = start; rr <= end; rr++){
            renderRevealLetterPending(rr, col);
        }
    }
}

// ── Game screen ───────────────────────────────────────────────────────────────
function showGame(crossword) {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display  = 'block';
    document.getElementById('puzzle-title').textContent = crossword.title || "Crossword";
    renderPuzzle(crossword);
    initHelpSection();
}

function renderPuzzle(cw) {
    buildGrid(cw.width, cw.height, cw.fill);
    const acrosslist = document.getElementById('acrossList');
    const downlist   = document.getElementById('downList');
    acrosslist.style.height    = cellSize * cw.height - 28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height      = cellSize * cw.height - 28 + 'px';
    downlist.style.overflowY   = 'auto';
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

// ── PeerJS ────────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
let hostID    = urlParams.get('id');

async function createPeer() {
    const peer = new Peer({ config: { iceServers: [
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

    peer.on("open", () => {
        const params = new URLSearchParams(window.location.search);
        const hostId = params.get("id");
        if (hostID) connect();
        else log("⚠️ No host ID in URL.");
    });

    peer.on('error', (err) => {
        log(`⚠️ PeerJS error: ${err.type}`);
        console.error(err);
    });

    function connect() {
        if (conn && conn.open) return;
        log("Connecting to host…");
        conn = peer.connect(hostID);

        conn.on('open', () => {
            log("✅ Connected — waiting for host to start…");
            conn.send({ type: "join", username: guestUsername });
        });

        conn.on('data', (data) => {
            if (data?.type === "start" && data.crossword) {
                showGame(data.crossword);
            } else if (data?.type === "player-list") {
                renderPlayerList(data.players);
            } else if (data?.type === "cell") {
                console.log(`${data.r}, ${data.c}: ${data.value} - ${data.peerId}`);
                applyRemoteCell(data.r, data.c, data.value, data.peerId);
            } else if (data?.type === "scoreboard") {
                renderScoreboard(data.scores);
            } else if (data?.type === "position") {
                if (data.r === -1) {
                    removeRemoteCursor(data.peerId);
                } else {
                    applyRemoteCursor(data.peerId, data.username, data.r, data.c, data.dir);
                }
            } else if (data?.type === "revealPending") {
                switch (data.level){
                    case "letter":
                        renderRevealLetterPending(data.r, data.c)
                    case "word":

                    case "puzzle":


                }
            } else if (data?.type === "revealLetter") {
                revealLetter(data.r, data.c, data.value);
            }
        });

        conn.on('close', () => { log("❌ Disconnected from host"); conn = null; });
        conn.on('error', (err) => log(`⚠️ ${err}`));
    }
}

if (hostID){
    document.getElementById("gameCodeSection").style.display = "none";
    createPeer();
}