from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from app import db
from app.models import User


bp = Blueprint('api', __name__)


@bp.route('/hello', methods=['GET'])
def hello():
    return jsonify({"message": "hello"})


@bp.route('/users', methods=['POST'])
def create_user():
    payload = request.get_json(silent=True) or {}

    username = (payload.get('username') or '').strip()
    email = (payload.get('email') or '').strip().lower() or None
    password = payload.get('password') or ''

    # Basic validation
    errors = {}
    if not username:
        errors['username'] = 'Username is required'
    if not password or len(password) < 6:
        errors['password'] = 'Password must be at least 6 characters'
    if email is not None and '@' not in email:
        errors['email'] = 'Email must be valid'
    if errors:
        return jsonify({'ok': False, 'errors': errors}), 400

    # Check duplicates (username and email if provided)
    q = []
    q.append(User.username == username)
    if email:
        q.append(User.email == email)

    existing = User.query.filter(or_(*q)).first() if q else None
    if existing:
        conflict = {}
        if existing.username == username:
            conflict['username'] = 'Username already taken'
        if email and existing.email == email:
            conflict['email'] = 'Email already in use'
        return jsonify({'ok': False, 'errors': conflict}), 409

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return (
        jsonify(
            {
                'ok': True,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'created_at': user.created_at.isoformat(),
                }
            }
        ),
        201,
    )


@bp.route('/compare', methods=['POST'])
def compare():
    data = request.json
