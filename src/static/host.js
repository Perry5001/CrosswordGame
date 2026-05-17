const randomStr = Math.random().toString(36).slice(2, 8);
const peer = new Peer(randomStr);

const API_BASE = window.location.hostname.includes("127.0.0.1")
    ? "http://127.0.0.1:5000"
    : "https://crosswordgame-272p.onrender.com";

let filename = "./puzzles/CrossSampler 1 Easy.puz";
// filename is attached to the crossword object before sending so the guest
// can request clues for the same puzzle from the shared server.
import { buildGrid, cellSize, highlightWord, onFocus, setHighlightClue } from "./crossword.js";

let cluesObjects = [];
let crossword;
let connections = []; // track all connected guests

// ── Clue highlighting ────────────────────────────────────────────────────────

export function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) clue.div.classList.remove("focused-clue");
    const selector = clueNum
        ? `.clue[data-num="${clueNum}"][data-dir="${dir}"]`
        : `.clue[data-r="${r}"][data-c="${c}"]`;
    const clue = document.querySelector(selector);
    if (clue) clue.classList.add("focused-clue");
}

// Wire highlightClue into crossword.js so it doesn't need to import from us
setHighlightClue(highlightClue);

// ── Clue list builder ────────────────────────────────────────────────────────

function buildClues(clues) {
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
}

// ── API calls ────────────────────────────────────────────────────────────────

function getCrossword(arg) {
    fetch(`${API_BASE}/call-crossword`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg })
    })
    .then(r => r.text())
    .then(data => {
        crossword = JSON.parse(data)['message'];
        crossword.filename = filename; // carry the filename so guests can request the same puzzle
        start(crossword);
    })
    .catch(err => console.error('Error:', err));
}

function getClues() {
    fetch(`${API_BASE}/call-clues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arg: "" })
    })
    .then(r => r.json())
    .then(data => buildClues(data))
    .catch(err => console.error('Error:', err));
}

// ── Grid setup ───────────────────────────────────────────────────────────────

function start(crossword) {
    buildGrid(crossword['width'], crossword['height'], crossword['fill']);
    const acrosslist = document.getElementById('acrossList');
    const downlist = document.getElementById('downList');
    acrosslist.style.height = cellSize * crossword['height'] - 28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height = cellSize * crossword['height'] - 28 + 'px';
    downlist.style.overflowY = 'auto';
    getClues();
}

function clueOnClick(r, c, dir) {
    highlightClue(r, c, null, dir);
    const cell = document.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    cell.querySelector('input').focus();
    onFocus(r, c, dir);
}

// ── PeerJS ───────────────────────────────────────────────────────────────────

getCrossword(filename);

peer.on('open', (id) => {
    console.log('My peer ID:', id);
    // Build the guest URL relative to the current origin so it works both
    // locally and on the deployed server.
    const guestURL = `${window.location.origin}/guest?id=${id}`;
    document.getElementById('peer-id').innerHTML =
        `Share this link with your partner: <a href="${guestURL}">${guestURL}</a>`;
});

peer.on('connection', (conn) => {
    console.log("Guest connected:", conn.peer);
    connections.push(conn);

    conn.on('open', () => {
        // Send the crossword data as soon as the connection opens
        if (crossword) {
            conn.send({ type: "init", crossword });
        } else {
            // Crossword may still be loading — poll briefly
            const wait = setInterval(() => {
                if (crossword) {
                    conn.send({ type: "init", crossword });
                    clearInterval(wait);
                }
            }, 200);
        }
    });

    conn.on('data', (data) => {
        console.log("Received from guest:", data);
        // Future: handle guest letter updates here and broadcast to others
    });

    conn.on('close', () => {
        connections = connections.filter(c => c !== conn);
        console.log("Guest disconnected:", conn.peer);
    });
});