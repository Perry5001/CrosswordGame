// highlightClue is injected by the host/guest module so this file
// doesn't need to know which page it's running on.
let _highlightClue = () => {};
export function setHighlightClue(fn) { _highlightClue = fn; }

let rows = 15, cols = 15;
export let cells = [];
let focusedR = -1, focusedC = -1;
let direction = 'across';
export let cellSize = 40;
let acrosses_clue_nums = [], downs_clue_nums = [];

export function buildGrid(r, c, fill) {
    rows = r; cols = c;
    acrosses_clue_nums = []; downs_clue_nums = [];
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
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
            if (fill[r * cols + c] === '.')
                toggleBlack(r, c);

    numberCells();
    numberCellClues();
}

function onCellClick(e, r, c) {
    if (cells[r][c].isBlack) { e.preventDefault(); return; }
    if (focusedR === r && focusedC === c) {
        direction = direction === 'across' ? 'down' : 'across';
        highlightWord(r, c, direction);
        const clueNum = direction === 'across'
            ? cells[r][c].div.dataset.acrossClue
            : cells[r][c].div.dataset.downClue;
        _highlightClue(r, c, clueNum, direction);
    }
}

function toggleBlack(r, c) {
    const cell = cells[r][c];
    cell.isBlack = !cell.isBlack;
    cell.div.className = 'cell ' + (cell.isBlack ? 'black' : 'white');
    cell.inp.disabled = cell.isBlack;
    cell.inp.value = '';
}

export function onFocus(r, c, dir = null) {
    direction = dir ? dir : direction;
    focusedR = r; focusedC = c;
    highlightWord(r, c, direction);
    const clueNum = direction === 'across'
        ? cells[r][c].div.dataset.acrossClue
        : cells[r][c].div.dataset.downClue;
    _highlightClue(r, c, clueNum, direction);
}

export function highlightWord(r, c, dir) {
    for (let rr = 0; rr < rows; rr++)
        for (let cc = 0; cc < cols; cc++)
            cells[rr][cc].div.classList.remove('focused', 'word-highlight');
    if (r < 0 || c < 0) return;
    cells[r][c].div.classList.add('focused');
    if (dir === 'across') {
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
    if (e.key === 'ArrowRight') { e.preventDefault(); let oldDir = direction; direction = 'across'; move(r, c, 0, 1, oldDir); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); let oldDir = direction; direction = 'across'; move(r, c, 0, -1, oldDir); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); let oldDir = direction; direction = 'down'; move(r, c, 1, 0, oldDir); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); let oldDir = direction; direction = 'down'; move(r, c, -1, 0, oldDir); }
    else if (e.key === 'Backspace') {
        if (cells[r][c].inp.value === '') { e.preventDefault(); retreat(r, c); }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        advanceWord(r, c, e.shiftKey ? -1 : 1);
    }
}

function move(r, c, dr, dc, oldDir = direction, mode = "arrow") {
    let nr = r + dr, nc = c + dc;
    let update = false;
    if (dr !== 0 && oldDir === 'across') { nr = r; update = true; }
    else if (dc !== 0 && oldDir === 'down') { nc = c; update = true; }
    else if (mode === "input" && ((nr < 0 || nr >= rows) || (nc < 0 || nc >= cols) || cells[nr][nc].isBlack)) {
        nr = nr - dr; nc = nc - dc;
    } else {
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr][nc].isBlack) {
            nr += dr; nc += dc;
        }
        update = true;
    }
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && update) {
        cells[nr][nc].inp.focus();
        cells[nr][nc].inp.select();
        highlightWord(nr, nc, direction);
        const clueNum = direction === 'across'
            ? cells[nr][nc].div.dataset.acrossClue
            : cells[nr][nc].div.dataset.downClue;
        _highlightClue(nr, nc, clueNum, direction);
    }
}

function advance(r, c) {
    if (direction === 'across') move(r, c, 0, 1, direction, "input");
    else move(r, c, 1, 0, direction, "input");
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
    if (direction === 'across') {
        let index = acrosses_clue_nums.indexOf(cells[r][c].div.dataset.acrossClue) + step;
        index = (index < 0 || index >= acrosses_clue_nums.length) ? index - step : index;
        const clue_num = acrosses_clue_nums[index];
        const clue = document.querySelector(`[data-num="${clue_num}"][data-dir="across"]`);
        cells[parseInt(clue.dataset.r)][parseInt(clue.dataset.c)].inp.focus();
    } else {
        let index = downs_clue_nums.indexOf(cells[r][c].div.dataset.downClue) + step;
        index = (index < 0 || index >= downs_clue_nums.length) ? index - step : index;
        const clue_num = downs_clue_nums[index];
        const clue = document.querySelector(`[data-num="${clue_num}"][data-dir="down"]`);
        cells[parseInt(clue.dataset.r)][parseInt(clue.dataset.c)].inp.focus();
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
            if (acrossStart) acrosses_clue_nums.push(cell.num.textContent);
            if (downStart) downs_clue_nums.push(cell.num.textContent);
        }
}

function numberCellClues() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = cells[r][c];
            if (cell.isBlack) continue;
            for (let rr = r - 1; rr >= -1; rr--) {
                if (rr === -1 || cells[rr][c].isBlack) {
                    cell.div.dataset.downClue = cells[rr + 1][c].num.textContent;
                    break;
                }
            }
            for (let cc = c - 1; cc >= -1; cc--) {
                if (cc === -1 || cells[r][cc].isBlack) {
                    cell.div.dataset.acrossClue = cells[r][cc + 1].num.textContent;
                    break;
                }
            }
        }
    }
}