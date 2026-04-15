
const API_BASE = window.location.hostname.includes("127.0.0.1")
? "http://127.0.0.1:5000"
: "https://crosswordgame-272p.onrender.com";

let filename = "./puzzles/CrossSampler 1 Easy.puz";
import { buildGrid, cellSize, highlightWord, onFocus} from "./crossword.js";
let cluesObjects = []

function buildClues(clues) {
    const acrossList = document.getElementById('acrossList');
    const downList = document.getElementById('downList');
    acrossList.innerHTML = '';
    downList.innerHTML = '';
    for (const clue of clues['across']) {
        const li = document.createElement('li');
        li.textContent = `${clue['num']}. ${clue['clue']}`;
        li.classList.add("clue");
        li.dataset.r = clue['row'];
        li.dataset.c = clue['col'];
        li.dataset.num = clue['num'];
        li.dataset.dir = "across";
        cluesObjects.push({div: li});
        const [r, c] = [clue['row'], clue['col']];
        li.addEventListener('click', () => {clueOnClick(r, c, "across");});
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
        cluesObjects.push({div: li});
        const [r, c] = [clue['row'], clue['col']];
        li.addEventListener('click', () => {clueOnClick(r, c, "down");});
        downList.appendChild(li);
    }
}

// Example function to call your Python endpoint
function getCrossword(arg) {
    fetch(`${API_BASE}/call-crossword`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ arg: arg })
    })
    .then(response => response.text())
    .then(data => {
        start(JSON.parse(data)['message']);
    })
    .catch(error => console.error('Error:', error));
}

function getClues() {
    fetch(`${API_BASE}/call-clues`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ arg: "" })
    })
    .then(response => response.json())
    .then(data => {
        buildClues(data);
    })
    .catch(error => console.error('Error:', error));
}

function start(crossword){
    buildGrid(crossword['width'], crossword['height'], crossword['fill']);
    const acrosslist = document.getElementById('acrossList');
    const downlist = document.getElementById('downList');
    acrosslist.style.height = cellSize*crossword['height']-28 + 'px';
    acrosslist.style.overflowY = 'auto';
    downlist.style.height = cellSize*crossword['height']-28 + 'px';
    downlist.style.overflowY = 'auto';
    getClues();
}

function clueOnClick(r, c, dir){
    highlightClue(r, c, null, dir);
    const cell = document.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    cell.querySelector('input').focus();
    onFocus(r, c, dir);
}

export function highlightClue(r, c, clueNum = null, dir) {
    for (const clue of cluesObjects) {
        clue.div.classList.remove("focused-clue");
    }
    const clue = clueNum ? document.querySelector(`.clue[data-num="${clueNum}"][data-dir="${dir}"]`) : document.querySelector(`.clue[data-r="${r}"][data-c="${c}"]`);
    clue.classList.add("focused-clue");
}

getCrossword(filename);
