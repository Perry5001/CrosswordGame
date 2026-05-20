import puz
import tempfile
import os
import base64
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from access import get_sources, get_years, get_months, get_days, get_puzzle_archive

app = Flask(__name__, static_folder='static')
CORS(app)


@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/host')
def serve_host():
    return send_from_directory('.', 'host.html')

@app.route('/guest')
def serve_guest():
    return send_from_directory('.', 'guest.html')


@app.route('/upload-puzzle', methods=['POST'])
def upload_puzzle():
    data = request.get_json()
    if not data or 'bytes' not in data:
        return jsonify({"error": "No file data received"}), 400

    try:
        # Decode base64 back to raw bytes
        raw_bytes = base64.b64decode(data['bytes'])
    except Exception as e:
        return jsonify({"error": f"Failed to decode file: {str(e)}"}), 400

    # Write explicitly in binary mode — prevents any newline or null byte mangling
    tmp = tempfile.NamedTemporaryFile(suffix='.puz', delete=False, mode='wb')
    try:
        tmp.write(raw_bytes)
        tmp.close()
        p = puz.read(tmp.name)
    except Exception as e:
        return jsonify({"error": f"Failed to parse puzzle: {str(e)}"}), 400
    finally:
        os.unlink(tmp.name)

    print(p.clues)

    numbering = p.clue_numbering()

    result = {
        "width":  p.width,
        "height": p.height,
        "fill":   p.fill,
        "title":  p.title,
        "author": p.author,
        "clues": {
            "across": numbering.across,
            "down":   numbering.down,
        },
        "solution": p.solution
    }

    print('Across Clues:')
    for clue in numbering.across:
        print(f"{clue.number}. {clue.text} - {clue.solution}")

    print('\nDown Clues:')
    for clue in numbering.down:
        print(f"{clue.number}. {clue.text} - {clue.solution}")

    return jsonify(result)

@app.route('/sources-list', methods=['POST'])
def sources_list():
    data = request.get_json()
    sources = get_sources()
    print(sources)
    return jsonify({"sources":sources})

@app.route('/years-list', methods=['POST'])
def years_list():
    data = request.get_json()
    return jsonify({"years" : get_years(data['source'])})

@app.route('/months-list', methods=['POST'])
def months_list():
    data = request.get_json()
    return jsonify({"months" : get_months(data['source'], data['year'])})

@app.route('/days-list', methods=['POST'])
def days_list():
    data = request.get_json()
    return jsonify({"days" : get_days(data['source'], data['year'], data['month'])})

@app.route('/get-puzzle', methods=['POST'])
def get_puzzle():
    data = request.get_json()
    puzzle = get_puzzle_archive(data['source'], data['year'], data['month'], data['day'])
    p = puzzle

    # try:
    #     # Decode base64 back to raw bytes
    #     raw_bytes = base64.b64decode(puzzle)
    # except Exception as e:
    #     return jsonify({"error": f"Failed to decode file: {str(e)}"}), 400

    # # Write explicitly in binary mode — prevents any newline or null byte mangling
    # tmp = tempfile.NamedTemporaryFile(suffix='.puz', delete=False, mode='wb')
    # try:
    #     tmp.write(raw_bytes)
    #     tmp.close()
    #     p = puz.read(tmp.name)
    # except Exception as e:
    #     return jsonify({"error": f"Failed to parse puzzle: {str(e)}"}), 400
    # finally:
    #     os.unlink(tmp.name)

    print(p.clues)

    numbering = p.clue_numbering()

    result = {
        "width":  p.width,
        "height": p.height,
        "fill":   p.fill,
        "title":  p.title,
        "author": p.author,
        "clues": {
            "across": numbering.across,
            "down":   numbering.down,
        },
        "solution": p.solution
    }
    print('Across Clues:')
    for clue in numbering.across:
        print(f"{clue.number}. {clue.text} - {clue.solution}")

    print('\nDown Clues:')
    for clue in numbering.down:
        print(f"{clue.number}. {clue.text} - {clue.solution}")

    return jsonify(result)



if __name__ == '__main__':
    app.run(port=5000)