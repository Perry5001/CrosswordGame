import { buildGrid, cellSize, onFocus, setHighlightClue, setOnCellChange, applyRemoteCell } from "./crossword.js";

const API_BASE = window.location.hostname.includes("127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://crosswordgame-272p.onrender.com";

let cluesObjects = [];
let crossword = null;   // holds grid + clues once a puzzle is uploaded
let connections = [];

// ── Clue highlighting ────────────────────────────────────────────────────────

function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue");
}

setHighlightClue(highlightClue);

// When the host types, broadcast to all connected guests
setOnCellChange((r, c, value) => {
    for (const conn of connections) {
        if (conn.open) conn.send({ type: "cell", r, c, value });
    }
});

// ── PeerJS ───────────────────────────────────────────────────────────────────

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
    const el = document.getElementById('peer-id');
    if (err.type === 'unavailable-id') {
        el.textContent = "ID conflict — please refresh.";
    } else {
        el.textContent = `⚠️ PeerJS error: ${err.type}`;
    }
});

peer.on('open', (id) => {
    const guestURL = `${window.location.origin}/guest?id=${id}`;
    document.getElementById('peer-id').innerHTML =
        `Share with your partner: <a href="${guestURL}">${guestURL}</a>`;
});

peer.on('connection', (conn) => {
    console.log("Guest connected:", conn.peer);
    connections.push(conn);

    conn.on('open', () => {
        // Send puzzle immediately if already loaded, otherwise wait
        if (crossword) {
            conn.send({ type: "init", crossword });
        } else {
            const wait = setInterval(() => {
                if (crossword) {
                    conn.send({ type: "init", crossword });
                    clearInterval(wait);
                }
            }, 200);
        }
    });

    conn.on('data', (data) => {
        if (data?.type === "cell") {
            // Apply to host's own grid
            applyRemoteCell(data.r, data.c, data.value);
            // Broadcast to all other guests
            for (const other of connections) {
                if (other !== conn && other.open) {
                    other.send({ type: "cell", r: data.r, c: data.c, value: data.value });
                }
            }
        }
    });
    conn.on('close', () => { connections = connections.filter(c => c !== conn); });
});

// ── Puzzle upload ─────────────────────────────────────────────────────────────

document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const status = document.getElementById('upload-status');
    status.textContent = "Parsing puzzle…";

    // Read the file as raw bytes, then base64 encode before sending.
    // This guarantees the server receives identical bytes regardless of
    // platform newline handling or multipart encoding quirks.
    const reader = new FileReader();
    reader.onload = () => {
        // reader.result is an ArrayBuffer — convert to base64 string
        const bytes = new Uint8Array(reader.result);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        fetch(`${API_BASE}/upload-puzzle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bytes: base64 })
        })
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                status.textContent = `Error: ${data.error}`;
                return;
            }
            crossword = data;
            status.textContent = `Loaded: ${crossword.title || file.name}`;
            renderPuzzle(crossword);
            // Push to any guests already connected
            for (const conn of connections) {
                if (conn.open) conn.send({ type: "init", crossword });
            }
        })
        .catch(err => {
            status.textContent = "Upload failed — is the server running?";
            console.error(err);
        });
    };
    reader.readAsArrayBuffer(file);
});

// ── Render ───────────────────────────────────────────────────────────────────

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