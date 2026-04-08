import puz
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='static')
CORS(app)  # Allow requests from JS (like http://localhost:5500)

global puzzle

def load_puzzle(filename):
    p = puz.read(filename)
    global puzzle
    puzzle = p
    return p

@app.route('/')
def serve_index():
  return send_from_directory('.', 'index.html')

@app.route('/call-crossword', methods=['POST'])
def call_crossword():
    data = request.json
    arg = data.get('arg', '')
    puzz = load_puzzle(arg)
    result = puzz.__dict__
    result['unk1'] = result['unk1'].decode()
    result['unk2'] = result['unk2'].decode()
    result['version'] = result['version'].decode()
    result['preamble'] = result['preamble'].decode()
    result['postscript'] = result['postscript'].decode()
    result['fileversion'] = result['fileversion'].decode()
    return jsonify({"message": result})

@app.route('/call-clues', methods=['POST'])
def call_clues():
    data = request.json
    arg = data.get('arg', '')
    result = puzzle.clue_numbering().__dict__
    return jsonify({"across": result['across'], "down": result['down']})


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