# Crossword Game

A project that serves playable crossword puzzles in the browser, with a collaborative mode that lets multiple people solve the same puzzle together in real time.

## Overview

This project pairs a Flask backend with a JavaScript/HTML/CSS front end. The server's role is limited to parsing crossword puzzle files and handing the grid and clues to the browser — all of the actual gameplay, including collaborative solving, happens client-side. When multiple people solve a puzzle together, their inputs are synced directly peer-to-peer in the browser, with no game state passing through the server. It also has access to an archive that updates weekly with the latest crosswords.

## Tech Stack

- **Python / Flask** — backend that loads and serves crossword puzzle data
- **puzpy** — parsing `.puz` crossword puzzle files
- **JavaScript / HTML / CSS** — interactive crossword grid and front-end UI
- **PeerJS** — WebRTC-based peer-to-peer connections powering collaborative solving
- **Flask-CORS** — cross-origin support for the API
- **Gunicorn** — production WSGI server
- **Docker / Fly.io** — containerized deployment (via `Dockerfile` and `fly.toml`)

## Website

The website link is: https://crosswordgame-272p.onrender.com. It might take a second for the website to spin up, but once it has loaded you can pick a puzzle, share the link, and start solving.

## How It Works

1. Crossword puzzles must be uploaded or loaded from the archive.
2. The Flask backend will parse the requested puzzle file and hand its grid, clues, and answer structure to the front end.
3. The browser renders the interactive crossword grid where the user can click cells, type letters, and navigate between clues.
4. For collaborative solving, PeerJS establishes a direct peer-to-peer connection between solvers directly within the front end, so everyone's inputs stay in sync live without ever routing through the server.

## Acknowledgments

Would like to thank [Q726kbXuN](https://github.com/Q726kbXuN/q726kbxun.github.io) for use of their archive.
