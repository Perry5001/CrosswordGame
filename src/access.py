#!/usr/bin/env python3

"""
Download crossword puzzles from the q726kbxun archive
and convert them into valid .puz files.

Requires:
    pip install puzpy

Example usage:
    python download_puz.py nyt 2024 01 01

This will create:
    nyt_2024_01_01.puz
"""

from urllib.request import urlopen, Request
import gzip
import json
import puz
import sys
import os

# ============================================================
# DATA FETCHING
# ============================================================

_cache = {}


def get_data(num, start, length, mode="json", header=None, cache=False):
    """
    Download a byte range from an archive shard.
    """

    url = f"https://q726kbxun.github.io/xwords/xwords_data_{num:02d}.dat"

    if cache:
        if num not in _cache:
            print(f"Caching archive shard {num}...")
            _cache[num] = urlopen(url).read()

        data = _cache[num][start:start + length]

    else:
        req = Request(
            url,
            headers={
                "Range": f"bytes={start}-{start + length - 1}"
            }
        )

        data = urlopen(req).read()

    # Re-add gzip header if needed
    if header is not None:
        data = header + data

    if mode == "json":
        return json.loads(data)

    elif mode == "raw":
        return data

    elif mode == "gzip":
        return json.loads(gzip.decompress(data))

    else:
        raise ValueError("Invalid mode")


# ============================================================
# ARCHIVE LOADING
# ============================================================

def load_archive():
    """
    Loads archive metadata and returns:
        archive, header
    """

    print("Loading archive metadata...")

    # Main metadata block
    meta = get_data(0, 22, 78)

    # Gzip header bytes
    header = get_data(*meta[5:8], mode="raw")

    # Archive index
    archive = get_data(*meta[2:5], mode="gzip", header=header)

    return archive, header


# ============================================================
# PUZZLE DOWNLOAD
# ============================================================

def download_puzzle(source, year, month, day, archive, header):
    """
    Downloads one puzzle JSON from archive.
    """

    try:
        info = archive[source][year][month][day]
    except KeyError:
        raise Exception(
            f"Puzzle not found: {source} {year}-{month}-{day}"
        )

    print(f"Downloading {source} {year}-{month}-{day}...")

    data = get_data(*info, mode="gzip", header=header)

    return data


# ============================================================
# CONVERT TO .PUZ
# ============================================================

def create_puz(data, title="", author="Unknown"):
    import puz

    width = data[0]
    height = data[1]
    cells = data[2]
    clues_data = data[3]

    p = puz.Puzzle()
    p.width = width
    p.height = height

    solution = ""
    fill = ""

    for row in cells:
        for cell in row:
            if cell == 0:
                solution += "."
                fill += "."
            else:
                solution += cell[0]
                fill += "-"

    p.solution = solution
    p.fill = fill

    # -------------------------------------------------------
    # CRITICAL FIX: DO NOT use clue_numbering()
    # -------------------------------------------------------

    across = []
    down = []

    for clue in clues_data:
        text = clue[0]
        direction = clue[1]

        if direction == 0:
            across.append((clue[2], text))
        else:
            down.append((clue[2], text))

    # Sort by clue number (safe because archive already defines numbering)
    across.sort(key=lambda x: x[0])
    down.sort(key=lambda x: x[0])

    across_dict = dict(across)
    down_dict = dict(down)
    all_numbers = sorted(set(across_dict) | set(down_dict))

    ordered_clues = []
    for num in all_numbers:
        if num in across_dict:
            ordered_clues.append(across_dict[num])
        if num in down_dict:
            ordered_clues.append(down_dict[num])

    p.clues = ordered_clues

    p.title = title
    p.author = author

    return p

# ============================================================
# SAVE FILE
# ============================================================

def save_puz(puzzle, filename):
    """
    Saves puzzle to .puz file.
    """

    with open(filename, "wb") as f:
        f.write(puzzle.tobytes())

    print(f"Saved: {filename}")


# ============================================================
# LIST AVAILABLE SOURCES
# ============================================================

def list_sources(archive):
    print("\nAvailable sources:\n")

    for source in sorted(archive.keys()):
        print(source)

    print()


# ============================================================
# LIST SOME PUZZLES
# ============================================================

def list_puzzles(archive, source, limit=25):

    if source not in archive:
        print(f"Source not found: {source}")
        return

    count = 0

    print(f"\nListing puzzles for {source}:\n")

    years = archive[source]

    for year in sorted(years.keys()):

        for month in sorted(years[year].keys()):

            for day in sorted(years[year][month].keys()):

                print(f"{year}-{month}-{day}")

                count += 1

                if count >= limit:
                    return


# ============================================================
# GET SOURCES
# ============================================================

def get_sources():

    archive, header = load_archive()

    sources = []

    for source in sorted(archive.keys()):
        sources.append(source)

    return sources

# ============================================================
# GET YEARS
# ============================================================

def get_years(source):
    archive, header = load_archive()

    if source not in archive:
        print(f"Source not found: {source}")
        return

    years = archive[source]

    return sorted(years.keys(), reverse=True)

# ============================================================
# GET MONTHS
# ============================================================

def get_months(source, year):
    archive, header = load_archive()

    if source not in archive:
        print(f"Source not found: {source}")
        return

    years = archive[source]

    return sorted(years[year].keys())

# ============================================================
# GET DAYS
# ============================================================

def get_days(source, year, month):
    archive, header = load_archive()

    if source not in archive:
        print(f"Source not found: {source}")
        return

    years = archive[source]

    return sorted(years[year][month].keys())

# ============================================================
# GET PUZZLE
# ============================================================

def get_puzzle_archive(source, year, month, day):
    archive, header = load_archive()
    data = download_puzzle(
        source,
        year,
        month,
        day,
        archive,
        header
    )
    title = f"{source.upper()} Crossword {year}-{month}-{day}"

    puzzle = create_puz(
        data,
        title=title,
        author="Archive"
    )

    return puzzle


# ============================================================
# MAIN
# ============================================================

def main():

    archive, header = load_archive()

    # --------------------------------------------------------
    # COMMANDS
    # --------------------------------------------------------

    if len(sys.argv) == 2 and sys.argv[1] == "sources":
        list_sources(archive)
        return

    if len(sys.argv) == 3 and sys.argv[1] == "list":
        list_puzzles(archive, sys.argv[2])
        return

    # --------------------------------------------------------
    # DOWNLOAD ONE PUZZLE
    # --------------------------------------------------------

    if len(sys.argv) != 5:
        print("""
Usage:

    python download_puz.py sources

    python download_puz.py list nyt

    python download_puz.py nyt 2024 01 01
""")
        return

    source = sys.argv[1]
    year = sys.argv[2]
    month = sys.argv[3]
    day = sys.argv[4]

    # --------------------------------------------------------
    # DOWNLOAD
    # --------------------------------------------------------

    data = download_puzzle(
        source,
        year,
        month,
        day,
        archive,
        header
    )

    title = f"{source.upper()} Crossword {year}-{month}-{day}"

    puzzle = create_puz(
        data,
        title=title,
        author="Archive"
    )

    filename = f"{source}_{year}_{month}_{day}.puz"

    save_puz(puzzle, filename)


# ============================================================
# ENTRY
# ============================================================

if __name__ == "__main__":
    main()