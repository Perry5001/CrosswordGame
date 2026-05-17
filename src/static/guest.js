import { buildGrid, cellSize, onFocus, setHighlightClue } from "./crossword.js";

const API_BASE = window.location.hostname.includes("127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://crosswordgame-272p.onrender.com";

const log = (msg) => {
    const el = document.getElementById("log");
    if (el) el.textContent += msg + "\n";
};

// ── Clue list ────────────────────────────────────────────────────────────────

let cluesObjects = [];

export function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue");
}

setHighlightClue(highlightClue);

function buildClues(clues, crossword) {
    const acrossList = document.getElementById('acrossList');
    const downList = document.getElementById('downList');
    acrossList.innerHTML = '';
    downList.innerHTML = '';
    cluesObjects = [];

    for (const clue of clues['across']) {
        const li = document.createElement('li');
        li.textContent = `${clue['num']}. ${clue['clue']}`;
        li.classList.add("clue");
        li.dataset.r = clue['row'];
        li.dataset.c = clue['col'];
        li.dataset.num = clue['num'];
        li.dataset.dir = "across";
        cluesObjects.push({ div: li });
        const [r, c] = [clue['row'], clue['col']];
        li.addEventListener('click', () => clueOnClick(r, c, "across"));
        acrossList.appendChild(li);
    }
    for (const clue of clues['down']) {
        const li = document.createElement('li');
        li.textContent = `${clue['num']}. ${clue['clue']}`;
        li.classList.add("clue");
        li.dataset.r = clue['row'];
        li.dataset.c = clue['col'];
        li.dataset.num = clue['num'];
        li.dataset.dir = "down";
        cluesObjects.push({ div: li });
        const [r, c] = [clue['row'], clue['col']];
        li.addEventListener('click', () => clueOnClick(r, c, "down"));
        downList.appendChild(li);
    }

    // Size the clue lists to match the grid height
    const acrossListEl = document.getElementById('acrossList');
    const downListEl = document.getElementById('downList');
    acrossListEl.style.height = cellSize * crossword['height'] - 28 + 'px';
    acrossListEl.style.overflowY = 'auto';
    downListEl.style.height = cellSize * crossword['height'] - 28 + 'px';
    downListEl.style.overflowY = 'auto';
}

function clueOnClick(r, c, dir) {
    highlightClue(r, c, null, dir);
    const cell = document.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    cell.querySelector('input').focus();
    onFocus(r, c, dir);
}

// ── Render crossword received from host ──────────────────────────────────────

function renderCrossword(crossword) {
    buildGrid(crossword['width'], crossword['height'], crossword['fill']);

    // Pass the puzzle filename so the server loads the right puzzle
    // even if the host hasn't called /call-crossword on this server instance.
    const filename = crossword['filename'] || "";
    fetch(`${API_BASE}/call-clues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg: filename })
    })
    .then(r => r.json())
    .then(data => buildClues(data, crossword))
    .catch(err => {
        console.error('Error fetching clues:', err);
        log("⚠️ Could not load clues from server.");
    });
}

// ── PeerJS ───────────────────────────────────────────────────────────────────

const urlParams = new URLSearchParams(window.location.search);
const hostID = urlParams.get('id');
console.log("Host ID from URL:", hostID);

const peer = new Peer();
let conn = null;

peer.on('open', (id) => {
    log("Connected as: " + id);
    if (hostID) {
        connect();
    } else {
        log("⚠️ No host ID in URL. Use a link like /guest?id=HOSTID");
    }
});

function connect() {
    if (conn && conn.open) { log("Already connected"); return; }
    log("Connecting to host " + hostID + "…");
    conn = peer.connect(hostID);

    conn.on('open', () => {
        log("✅ Connected to host");
    });

    conn.on('data', (data) => {
        if (data && data.type === "init" && data.crossword) {
            log("📩 Received crossword from host");
            renderCrossword(data.crossword);
        } else {
            log("📩 Received: " + JSON.stringify(data));
        }
    });

    conn.on('close', () => {
        log("❌ Connection closed");
        conn = null;
    });

    conn.on('error', (err) => {
        log("⚠️ Error: " + err);
    });
}