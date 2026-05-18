import puz
import tempfile
import os
import base64
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

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

    return jsonify(result)


if __name__ == '__main__':
    app.run(port=5000)