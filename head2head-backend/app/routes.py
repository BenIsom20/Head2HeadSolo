from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from datetime import datetime

from app import db
from app.models import User, Group, Membership, Invite


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


@bp.route('/auth/login', methods=['POST'])
def login():
    payload = request.get_json(silent=True) or {}

    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''

    if not username or not password:
        return jsonify({'ok': False, 'error': 'Username and password required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'ok': False, 'error': 'Invalid credentials'}), 401

    return jsonify({
        'ok': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    }), 200


def _current_user():
    uid = request.headers.get('X-User-Id')
    if not uid:
        return None
    try:
        uid = int(uid)
    except ValueError:
        return None
    return User.query.get(uid)


# Groups
@bp.route('/groups', methods=['POST'])
def create_group():
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    sport = (payload.get('sport') or '').strip()
    invitees = payload.get('invitees') or []  # list of usernames

    if not name:
        return jsonify({'ok': False, 'error': 'Group name is required'}), 400
    if not sport:
        return jsonify({'ok': False, 'error': 'Group sport is required'}), 400
    if Group.query.filter_by(name=name).first():
        return jsonify({'ok': False, 'error': 'Group name already exists'}), 409

    group = Group(name=name, sport=sport)
    db.session.add(group)
    db.session.flush()

    owner = Membership(user_id=me.id, group_id=group.id, role='owner')
    db.session.add(owner)

    # Prepare invites
    created_invites = []
    for uname in invitees:
        uname = (uname or '').strip()
        if not uname or uname == me.username:
            continue
        user = User.query.filter_by(username=uname).first()
        if not user:
            continue
        # skip if already a member
        if Membership.query.filter_by(user_id=user.id, group_id=group.id).first():
            continue
        # upsert-like: if an invite exists and is pending, skip
        existing = Invite.query.filter_by(group_id=group.id, invitee_id=user.id).first()
        if existing and existing.status == 'pending':
            continue
        inv = Invite(group_id=group.id, inviter_id=me.id, invitee_id=user.id, status='pending')
        db.session.add(inv)
        created_invites.append({'id': None, 'username': user.username})

    db.session.commit()

    return jsonify({
        'ok': True,
        'group': {
            'id': group.id,
            'name': group.name,
            'sport': group.sport,
        },
        'invites_created': created_invites,
    }), 201


@bp.route('/my/groups', methods=['GET'])
def my_groups():
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    memberships = (
        db.session.query(Membership, Group)
        .join(Group, Group.id == Membership.group_id)
        .filter(Membership.user_id == me.id)
        .all()
    )
    groups = []
    for m, g in memberships:
        groups.append({
            'id': g.id,
            'name': g.name,
            'sport': g.sport,
            'role': m.role,
        })
    return jsonify({'ok': True, 'groups': groups}), 200


@bp.route('/groups/<int:group_id>', methods=['GET'])
def get_group(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    membership = Membership.query.filter_by(user_id=me.id, group_id=group.id).first()
    if not membership:
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403

    members = (
        db.session.query(User, Membership)
        .join(Membership, Membership.user_id == User.id)
        .filter(Membership.group_id == group.id)
        .all()
    )
    members_payload = [
        {
            'id': u.id,
            'username': u.username,
            'role': m.role,
        }
        for (u, m) in members
    ]
    return jsonify({
        'ok': True,
        'group': {
            'id': group.id,
            'name': group.name,
            'sport': group.sport,
            'members': members_payload,
            'my_role': membership.role,
        },
    }), 200


@bp.route('/groups/<int:group_id>', methods=['PATCH'])
def update_group(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    my = Membership.query.filter_by(user_id=me.id, group_id=group.id).first()
    if not my or my.role != 'owner':
        return jsonify({'ok': False, 'error': 'Only owners can edit this group'}), 403

    payload = request.get_json(silent=True) or {}
    new_name = payload.get('name')
    new_sport = payload.get('sport')

    if new_name is not None:
        new_name = new_name.strip()
        if not new_name:
            return jsonify({'ok': False, 'error': 'Name cannot be empty'}), 400
        if new_name != group.name and Group.query.filter_by(name=new_name).first():
            return jsonify({'ok': False, 'error': 'Group name already exists'}), 409
        group.name = new_name

    if new_sport is not None:
        new_sport = new_sport.strip()
        if not new_sport:
            return jsonify({'ok': False, 'error': 'Sport cannot be empty'}), 400
        group.sport = new_sport

    db.session.commit()
    return jsonify({'ok': True, 'group': {'id': group.id, 'name': group.name, 'sport': group.sport}}), 200


@bp.route('/groups/<int:group_id>/invites', methods=['POST'])
def invite_to_group(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    my = Membership.query.filter_by(user_id=me.id, group_id=group.id).first()
    if not my or my.role != 'owner':
        return jsonify({'ok': False, 'error': 'Only owners can invite'}), 403

    payload = request.get_json(silent=True) or {}
    username = (payload.get('username') or '').strip()
    if not username:
        return jsonify({'ok': False, 'error': 'Username required'}), 400
    if username == me.username:
        return jsonify({'ok': False, 'error': 'Cannot invite yourself'}), 400

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'ok': False, 'error': 'User not found'}), 404

    # Already a member
    if Membership.query.filter_by(user_id=user.id, group_id=group.id).first():
        return jsonify({'ok': False, 'error': 'User already a member'}), 409

    inv = Invite.query.filter_by(group_id=group.id, invitee_id=user.id).first()
    if inv and inv.status == 'pending':
        return jsonify({'ok': False, 'error': 'Invite already pending'}), 409

    if not inv:
        inv = Invite(group_id=group.id, inviter_id=me.id, invitee_id=user.id, status='pending')
        db.session.add(inv)
    else:
        inv.status = 'pending'
        inv.inviter_id = me.id
        inv.created_at = datetime.utcnow()
        inv.responded_at = None
    db.session.commit()
    return jsonify({'ok': True, 'invite': {'id': inv.id, 'group_id': inv.group_id, 'username': user.username, 'status': inv.status}}), 201


# Invites inbox
@bp.route('/invites', methods=['GET'])
def list_invites():
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    status = request.args.get('status') or 'pending'
    q = Invite.query.filter_by(invitee_id=me.id)
    if status:
        q = q.filter_by(status=status)
    invs = q.order_by(Invite.created_at.desc()).all()

    def as_payload(inv: Invite):
        g = Group.query.get(inv.group_id)
        inviter = User.query.get(inv.inviter_id)
        return {
            'id': inv.id,
            'status': inv.status,
            'created_at': inv.created_at.isoformat(),
            'group': {'id': g.id, 'name': g.name, 'sport': g.sport} if g else None,
            'inviter': {'id': inviter.id, 'username': inviter.username} if inviter else None,
        }

    return jsonify({'ok': True, 'invites': [as_payload(i) for i in invs]}), 200


@bp.route('/invites/<int:invite_id>/respond', methods=['POST'])
def respond_invite(invite_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    inv = Invite.query.get_or_404(invite_id)
    if inv.invitee_id != me.id:
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403
    if inv.status != 'pending':
        return jsonify({'ok': False, 'error': 'Invite already processed'}), 409

    payload = request.get_json(silent=True) or {}
    action = (payload.get('action') or '').strip().lower()
    if action not in ('accept', 'decline'):
        return jsonify({'ok': False, 'error': 'Invalid action'}), 400

    if action == 'accept':
        # Make member if not already
        if not Membership.query.filter_by(user_id=me.id, group_id=inv.group_id).first():
            db.session.add(Membership(user_id=me.id, group_id=inv.group_id, role='member'))
        inv.status = 'accepted'
        inv.responded_at = datetime.utcnow()
    else:
        inv.status = 'declined'
        inv.responded_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'ok': True, 'invite': {'id': inv.id, 'status': inv.status}}), 200
@bp.route('/compare', methods=['POST'])
def compare():
    data = request.json
