import { buildGrid } from "./crossword.js";

const API_BASE = window.location.hostname.includes("127.0.0.1")
? "http://127.0.0.1:5000"
: "https://handwriting-analyzer-e146.onrender.com/";

let filename = 'CrossSampler 1 Easy.puz'

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
        console.log(JSON.parse(data)['message']);
        start(JSON.parse(data)['message']);
    })
    .catch(error => console.error('Error:', error));
}

function start(crossword){
    console.log(crossword['fill']);
    buildGrid(crossword['width'], crossword['height'], crossword['fill']);
}

getCrossword(filename);