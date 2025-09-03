from flask import Blueprint, jsonify, request


bp = Blueprint('api', __name__)

@bp.route('/hello', methods=['GET'])
def hello():
    return jsonify({ "message": "hello" })

@bp.route('/compare', methods=['POST'])
def compare():
    data = request.json