import puz
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
 
app = Flask(__name__, static_folder='static')
CORS(app)
 
 
@app.route('/')
def serve_index():
    return send_from_directory('.', 'host.html')
 
@app.route('/host')
def serve_host():
    return send_from_directory('.', 'host.html')
 
@app.route('/guest')
def serve_guest():
    return send_from_directory('.', 'guest.html')
 
 
@app.route('/upload-puzzle', methods=['POST'])
def upload_puzzle():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
 
    f = request.files['file']
    if not f.filename.endswith('.puz'):
        return jsonify({"error": "File must be a .puz file"}), 400
 
    try:
        data = f.read()
        p = puz.read(io.BytesIO(data))
    except Exception as e:
        return jsonify({"error": f"Failed to parse puzzle: {str(e)}"}), 400
 
    # Build the grid object
    result = {
        "width":  p.width,
        "height": p.height,
        "fill":   p.fill,
        "title":  p.title,
        "author": p.author,
    }
 
    # Build clues
    numbering = p.clue_numbering()
    result["clues"] = {
        "across": numbering.across,
        "down":   numbering.down,
    }
 
    return jsonify(result)
 
 
if __name__ == '__main__':
    app.run(port=5000)


# #
# # Load a puzzle file:
# #
# p = puz.read('CrossSampler 1 Easy.puz')

# #
# # Print all clues and their answers
# #
# clues = p.clue_numbering()


# print('Across')
# for clue in clues.across:
#     print(f'{clue.number}. {clue.text} - {clue.solution}')

# print('Down')
# for clue in clues.down:
#     print(f'{clue.number}. {clue.text} - {clue.solution}')

# #
# # Print the puzzle grid
# #
# for row in p.grid():
#     print(row)

# #
# # Unlock a puzzle that has a locked solution
# #
# p.unlock_solution(7844)

# # Now print the unscrambed solution grid:
# for row in p.solution_grid():
#     print(' '.join(row))

# #
# # Save a puzzle with modifications:
# #
# p.fill = 'LAMB' + p.fill[:4]
# p.save('example.puz')

# #
# # New! Convert from Across Lite text format to .puz:
# #
# p2 = puz.read_text('testfiles/text_format_v1.txt')
# p2.save('example.puz')  