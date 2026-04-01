let rows = 15, cols = 15;
let cells = [];
let mode = 'fill';
let focusedR = -1, focusedC = -1;
let direction = 'across';

function setMode(m) {
    mode = m;
    document.getElementById('btn-fill').classList.toggle('active', m === 'fill');
    document.getElementById('btn-block').classList.toggle('active', m === 'block');
    document.getElementById('hint').textContent = m === 'fill'
        ? 'Click a white square to start typing. Arrow keys to navigate. Arrow key direction sets across/down.'
        : 'Click any square to toggle it black/white. Black squares create word boundaries.';
}

export function buildGrid(r, c, fill) {
    rows = r; cols = c;
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${cols}, 40px)`;
    cells = [];
    focusedR = -1; focusedC = -1;

    for (let r = 0; r < rows; r++) {
        cells[r] = [];
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell white';
            cell.dataset.r = r;
            cell.dataset.c = c;

            const numEl = document.createElement('div');
            numEl.className = 'cell-num';
            cell.appendChild(numEl);

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.maxLength = 2;
            inp.setAttribute('autocomplete', 'off');
            inp.addEventListener('keydown', e => onKey(e, r, c));
            inp.addEventListener('input', e => onInput(e, inp, r, c));
            inp.addEventListener('focus', () => onFocus(r, c));
            cell.appendChild(inp);

            cell.addEventListener('mousedown', e => onCellClick(e, r, c));
            grid.appendChild(cell);
            cells[r][c] = { div: cell, inp, isBlack: false, num: numEl };
        }
    }

    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            if (fill[r*cols+c] === '.')
                toggleBlack(r, c);

    numberCells();
}

function onCellClick(e, r, c) {
    if (mode === 'block') {
        e.preventDefault();
        toggleBlack(r, c);
        return;
    }
    if (cells[r][c].isBlack) { e.preventDefault(); return; }
    if (focusedR === r && focusedC === c) {
        direction = direction === 'across' ? 'down' : 'across';
        highlightWord(r, c);
    }
}

function toggleBlack(r, c) {
    const cell = cells[r][c];
    cell.isBlack = !cell.isBlack;
    cell.div.className = 'cell ' + (cell.isBlack ? 'black' : 'white');
    cell.inp.disabled = cell.isBlack;
    cell.inp.value = '';
    numberCells();
    highlightWord(focusedR, focusedC);
}

function onFocus(r, c) {
    focusedR = r; focusedC = c;
    highlightWord(r, c);
}

function highlightWord(r, c) {
    for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++)
            cells[rr][cc].div.classList.remove('focused', 'word-highlight');
    if (r < 0 || c < 0) return;
    cells[r][c].div.classList.add('focused');
    if (direction === 'across') {
        let start = c;
        while (start > 0 && !cells[r][start - 1].isBlack) start--;
        let end = c;
        while (end < cols - 1 && !cells[r][end + 1].isBlack) end++;
        for (let cc = start; cc <= end; cc++)
            if (cc !== c) cells[r][cc].div.classList.add('word-highlight');
    } else {
        let start = r;
        while (start > 0 && !cells[start - 1][c].isBlack) start--;
        let end = r;
        while (end < rows - 1 && !cells[end + 1][c].isBlack) end++;
        for (let rr = start; rr <= end; rr++)
            if (rr !== r) cells[rr][c].div.classList.add('word-highlight');
    }
}

function onInput(e, inp, r, c) {
    let val = inp.value.replace(/[^a-zA-Z]/g, '');
    if (val.length > 1) val = val[val.length - 1];
    inp.value = val.toUpperCase();
    if (val.length === 1) advance(r, c);
}

function onKey(e, r, c) {
    if (e.key === 'ArrowRight') { e.preventDefault(); direction = 'across'; move(r, c, 0, 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); direction = 'across'; move(r, c, 0, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); direction = 'down'; move(r, c, 1, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); direction = 'down'; move(r, c, -1, 0); }
    else if (e.key === 'Backspace') {
        if (cells[r][c].inp.value === '') { e.preventDefault(); retreat(r, c); }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        advanceWord(r, c, e.shiftKey ? -1 : 1);
    }
}

function move(r, c, dr, dc) {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr][nc].isBlack) {
        nr += dr; nc += dc;
    }
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        cells[nr][nc].inp.focus();
        cells[nr][nc].inp.select();
    }
}

function advance(r, c) {
    if (direction === 'across') move(r, c, 0, 1);
    else move(r, c, 1, 0);
}

function retreat(r, c) {
    const dr = direction === 'down' ? -1 : 0;
    const dc = direction === 'across' ? -1 : 0;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].isBlack) {
        cells[nr][nc].inp.value = '';
        cells[nr][nc].inp.focus();
    }
}

function advanceWord(r, c, step) {
    let nr = r, nc = c;
    if (direction === 'across') {
        nc += step;
        while (nr >= 0 && nr < rows) {
            while (nc >= 0 && nc < cols) {
                if (!cells[nr][nc].isBlack) { cells[nr][nc].inp.focus(); return; }
                nc += step;
            }
            nr += step; nc = step > 0 ? 0 : cols - 1;
        }
    } else {
        nr += step;
        while (nc >= 0 && nc < cols) {
            while (nr >= 0 && nr < rows) {
                if (!cells[nr][nc].isBlack) { cells[nr][nc].inp.focus(); return; }
                nr += step;
            }
            nc += step; nr = step > 0 ? 0 : rows - 1;
        }
    }
}

function numberCells() {
    let n = 1;
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const cell = cells[r][c];
            cell.num.textContent = '';
            if (cell.isBlack) continue;
            const acrossStart = (c === 0 || cells[r][c - 1].isBlack) && (c + 1 < cols && !cells[r][c + 1].isBlack);
            const downStart = (r === 0 || cells[r - 1][c].isBlack) && (r + 1 < rows && !cells[r + 1][c].isBlack);
            if (acrossStart || downStart) cell.num.textContent = n++;
        }
}

function clearLetters() {
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            cells[r][c].inp.value = '';
}

function clearAll() {
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            const cell = cells[r][c];
            cell.isBlack = false;
            cell.div.className = 'cell white';
            cell.inp.disabled = false;
            cell.inp.value = '';
            cell.num.textContent = '';
        }
    numberCells();
}