import { buildGrid, cellSize, onFocus, setHighlightClue, setOnCellChange, applyRemoteCell } from "./crossword.js";

const log = (msg) => {
    const el = document.getElementById("log");
    if (el) el.textContent += msg + "\n";
};

// ── Clue highlighting ────────────────────────────────────────────────────────

let cluesObjects = [];

function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue");
}

setHighlightClue(highlightClue);

// When the guest types, send to host
setOnCellChange((r, c, value) => {
    if (conn && conn.open) conn.send({ type: "cell", r, c, value });
});

// ── Render (everything comes from the host over P2P) ─────────────────────────

function renderPuzzle(cw) {
    buildGrid(cw.width, cw.height, cw.fill);

    const acrosslist = document.getElementById('acrossList');
    const downlist   = document.getElementById('downList');
    acrosslist.style.height = cellSize * cw.height - 28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height   = cellSize * cw.height - 28 + 'px';
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
        li.dataset.r   = clue.row;
        li.dataset.c   = clue.col;
        li.dataset.num = clue.num;
        li.dataset.dir = "across";
        cluesObjects.push({ div: li });
        li.addEventListener('click', () => clueOnClick(clue.row, clue.col, "across"));
        acrossList.appendChild(li);
    }
    for (const clue of clues.down) {
        const li = document.createElement('li');
        li.textContent = `${clue.num}. ${clue.clue}`;
        li.classList.add("clue");
        li.dataset.r   = clue.row;
        li.dataset.c   = clue.col;
        li.dataset.num = clue.num;
        li.dataset.dir = "down";
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

// ── PeerJS ───────────────────────────────────────────────────────────────────

const urlParams = new URLSearchParams(window.location.search);
const hostID = urlParams.get('id');

const peer = new Peer(undefined, {
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
    log(`⚠️ PeerJS error: ${err.type}`);
    console.error(err);
});

let conn = null;

peer.on('open', () => {
    if (hostID) {
        connect();
    } else {
        log("⚠️ No host ID in URL. Use a link like /guest?id=HOSTID");
    }
});

function connect() {
    if (conn && conn.open) return;
    log("Connecting to host…");
    conn = peer.connect(hostID);

    conn.on('open', () => log("✅ Connected — waiting for puzzle…"));

    conn.on('data', (data) => {
        if (data?.type === "init" && data.crossword) {
            log(`📩 Received: ${data.crossword.title || "puzzle"}`);
            renderPuzzle(data.crossword);
        } else if (data?.type === "cell") {
            applyRemoteCell(data.r, data.c, data.value);
        }
    });

    conn.on('close', () => { log("❌ Disconnected"); conn = null; });
    conn.on('error', (err) => log(`⚠️ ${err}`));
}