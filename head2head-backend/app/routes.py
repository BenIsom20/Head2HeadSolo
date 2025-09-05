from flask import Blueprint, jsonify, request, current_app
from sqlalchemy import or_
from datetime import datetime
import time, json, base64, hmac, hashlib

from app import db
from app.models import User, Group, Membership, Invite, Ranking, Match, MatchParticipant


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
    token = _issue_token(user.id)
    return jsonify({
        'ok': True,
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'created_at': user.created_at.isoformat(),
        }
    }), 201


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

    token = _issue_token(user.id)
    return jsonify({
        'ok': True,
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    }), 200


def _current_user():
    auth = request.headers.get('Authorization') or ''
    if auth.lower().startswith('bearer '):
        token = auth.split(' ', 1)[1].strip()
        payload = _jwt_decode(token)
        if payload and 'sub' in payload:
            return User.query.get(int(payload['sub']))
        return None
    uid = request.headers.get('X-User-Id')
    if not uid:
        return None
    try:
        uid = int(uid)
    except ValueError:
        return None
    return User.query.get(uid)


@bp.route('/auth/me', methods=['GET'])
def auth_me():
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401
    return jsonify({'ok': True, 'user': {'id': me.id, 'username': me.username, 'email': me.email}}), 200


# Groups
@bp.route('/groups', methods=['POST'])
def create_group():
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    payload = request.get_json(silent=True) or {}
    name = (payload.get('name') or '').strip()
    sport = (payload.get('sport') or '').strip()
    default_team_size = payload.get('default_team_size')
    invitees = payload.get('invitees') or []  # list of usernames

    if not name:
        return jsonify({'ok': False, 'error': 'Group name is required'}), 400
    if not sport:
        return jsonify({'ok': False, 'error': 'Group sport is required'}), 400
    if Group.query.filter_by(name=name).first():
        return jsonify({'ok': False, 'error': 'Group name already exists'}), 409

    # Validate and set default team size (fallback to 1)
    try:
        dts = int(default_team_size) if default_team_size is not None else 1
    except (TypeError, ValueError):
        dts = 1
    if dts < 1:
        dts = 1

    group = Group(name=name, sport=sport, default_team_size=dts)
    db.session.add(group)
    db.session.flush()

    owner = Membership(user_id=me.id, group_id=group.id, role='owner')
    db.session.add(owner)
    # Ensure owner has an initial ELO ranking
    db.session.flush()
    if not Ranking.query.filter_by(user_id=me.id, group_id=group.id).first():
        db.session.add(Ranking(user_id=me.id, group_id=group.id, points=1000))

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
            'default_team_size': group.default_team_size,
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
        db.session.query(User, Membership, Ranking)
        .join(Membership, Membership.user_id == User.id)
        .outerjoin(Ranking, (Ranking.user_id == User.id) & (Ranking.group_id == group.id))
        .filter(Membership.group_id == group.id)
        .all()
    )
    members_payload = []
    for (u, m, r) in members:
        elo = r.points if r and r.points is not None else 1000
        members_payload.append({'id': u.id, 'username': u.username, 'role': m.role, 'elo': elo})
    # Sort by ELO desc
    members_payload.sort(key=lambda x: x['elo'], reverse=True)
    return jsonify({
        'ok': True,
        'group': {
            'id': group.id,
            'name': group.name,
            'sport': group.sport,
            'default_team_size': group.default_team_size,
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
    new_default_team_size = payload.get('default_team_size')

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

    if new_default_team_size is not None:
        try:
            dts2 = int(new_default_team_size)
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'default_team_size must be an integer'}), 400
        if dts2 < 1:
            return jsonify({'ok': False, 'error': 'default_team_size must be at least 1'}), 400
        group.default_team_size = dts2

    db.session.commit()
    return jsonify({'ok': True, 'group': {'id': group.id, 'name': group.name, 'sport': group.sport, 'default_team_size': group.default_team_size}}), 200


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
            # Also ensure an initial ELO ranking
            if not Ranking.query.filter_by(user_id=me.id, group_id=inv.group_id).first():
                db.session.add(Ranking(user_id=me.id, group_id=inv.group_id, points=1000))
        inv.status = 'accepted'
        inv.responded_at = datetime.utcnow()
    else:
        inv.status = 'declined'
        inv.responded_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'ok': True, 'invite': {'id': inv.id, 'status': inv.status}}), 200


@bp.route('/groups/<int:group_id>/matches', methods=['POST'])
def record_match(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    # Must be a member to record
    if not Membership.query.filter_by(user_id=me.id, group_id=group.id).first():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403

    payload = request.get_json(silent=True) or {}
    is_tie = bool(
        payload.get('is_tie')
        or payload.get('tie')
        or (isinstance(payload.get('result'), str) and payload.get('result', '').strip().lower() == 'tie')
    )
    is_ffa = bool(payload.get('ffa') or payload.get('mode') == 'ffa' or payload.get('free_for_all'))
    # Optional team scores for team/duel
    def _parse_team_scores(pl):
        a = pl.get('score_a')
        b = pl.get('score_b')
        try:
            a = int(a) if a is not None else None
            b = int(b) if b is not None else None
        except (TypeError, ValueError):
            return (None, None, 'score_a and score_b must be integers')
        return (a, b, None)

    # Free-For-All (FFA) flow
    if is_ffa:
        # Collect players and rankings/placements
        players = payload.get('players') or []
        ranks_input = payload.get('ranks') or payload.get('placements')
        ordering = payload.get('ordering')  # list of user_ids in finish order (best to worst)
        winner_id = payload.get('winner_id')

        # Normalize players list if ranks/ordering provided
        if not players and isinstance(ranks_input, dict):
            try:
                players = [int(k) for k in ranks_input.keys()]
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': 'Invalid ranks keys'}), 400
        if not players and isinstance(ordering, list):
            try:
                players = [int(x) for x in ordering]
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': 'Invalid ordering values'}), 400

        # Validate players
        if not isinstance(players, list) or len(players) < 2:
            return jsonify({'ok': False, 'error': 'FFA requires at least 2 participants'}), 400
        try:
            player_ids = [int(x) for x in players]
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'players must be an array of user ids'}), 400
        if len(set(player_ids)) != len(player_ids):
            return jsonify({'ok': False, 'error': 'Duplicate players in FFA participants'}), 400
        # membership and rankings
        for uid in player_ids:
            if not Membership.query.filter_by(user_id=uid, group_id=group.id).first():
                return jsonify({'ok': False, 'error': f'User {uid} is not a member of this group'}), 400
        rankings = {}
        for uid in player_ids:
            r = Ranking.query.filter_by(user_id=uid, group_id=group.id).first()
            if not r:
                r = Ranking(user_id=uid, group_id=group.id, points=1000)
                db.session.add(r)
            rankings[uid] = r

        # Build rank map: lower number is better (1 = winner). Ties allowed.
        rank_map = {}
        if isinstance(ranks_input, dict):
            # keys may be strings
            tmp = {}
            for k, v in ranks_input.items():
                try:
                    uid = int(k)
                    place = int(v)
                except (TypeError, ValueError):
                    return jsonify({'ok': False, 'error': 'ranks must map user_id to integer place'}), 400
                if uid not in player_ids:
                    return jsonify({'ok': False, 'error': f'user {uid} in ranks not in players'}), 400
                if place < 1:
                    return jsonify({'ok': False, 'error': 'place must be >= 1'}), 400
                tmp[uid] = place
            rank_map = tmp
        elif isinstance(ordering, list) and ordering:
            # assign 1..N
            try:
                ordering_ids = [int(x) for x in ordering]
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': 'ordering must contain user ids'}), 400
            if set(ordering_ids) != set(player_ids):
                return jsonify({'ok': False, 'error': 'ordering must include all players exactly once'}), 400
            for idx, uid in enumerate(ordering_ids, start=1):
                rank_map[uid] = idx
        elif winner_id is not None:
            try:
                winner_id = int(winner_id)
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': 'winner_id must be an integer'}), 400
            if winner_id not in player_ids:
                return jsonify({'ok': False, 'error': 'winner_id must be one of players'}), 400
            for uid in player_ids:
                rank_map[uid] = 1 if uid == winner_id else 2
        else:
            return jsonify({'ok': False, 'error': 'Provide ranks, ordering, or winner_id for FFA'}), 400

        # Compute pairwise expected and score averages
        ids = player_ids
        current = {uid: float(rankings[uid].points or 1000) for uid in ids}
        import math
        def expected(p_i, p_j):
            return 1.0 / (1.0 + 10.0 ** ((p_j - p_i) / 400.0))
        score = {}
        exp_avg = {}
        for i in ids:
            s = 0.0
            e = 0.0
            for j in ids:
                if i == j:
                    continue
                # outcome for i vs j based on places
                if rank_map[i] < rank_map[j]:
                    s += 1.0
                elif rank_map[i] > rank_map[j]:
                    s += 0.0
                else:
                    s += 0.5
                e += expected(current[i], current[j])
            n_opp = max(1, len(ids) - 1)
            score[i] = s / n_opp
            exp_avg[i] = e / n_opp

        k = 32.0
        deltas = {uid: int(round(k * (score[uid] - exp_avg[uid]))) for uid in ids}
        # Apply updates
        for uid in ids:
            rankings[uid].points = int((rankings[uid].points or 1000) + deltas[uid])

        # Persist match and participants
        top_place = min(rank_map.values())
        winners = [uid for uid, plc in rank_map.items() if plc == top_place]
        match = Match(
            group_id=group.id,
            winner_id=winners[0] if len(winners) == 1 else None,
            loser_id=None,
            is_tie=(len(winners) != 1),
        )
        db.session.add(match)
        db.session.flush()
        for uid in ids:
            db.session.add(MatchParticipant(match_id=match.id, user_id=uid, team=0, place=int(rank_map[uid])))
        db.session.commit()

        return jsonify({
            'ok': True,
            'ffa': True,
            'players': [
                {'id': uid, 'elo': rankings[uid].points, 'delta': deltas[uid], 'place': int(rank_map[uid])}
                for uid in ids
            ],
        }), 201
    # Teams (arrays) support
    players_a = payload.get('playersA') or payload.get('team_a') or payload.get('team1') or []
    players_b = payload.get('playersB') or payload.get('team_b') or payload.get('team2') or []
    if players_a and players_b:
        # Validate arrays
        if not isinstance(players_a, list) or not isinstance(players_b, list):
            return jsonify({'ok': False, 'error': 'playersA and playersB must be arrays of user ids'}), 400
        try:
            team_a_ids = [int(x) for x in players_a]
            team_b_ids = [int(x) for x in players_b]
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'playersA/playersB must contain integers'}), 400
        if len(team_a_ids) == 0 or len(team_b_ids) == 0:
            return jsonify({'ok': False, 'error': 'Both teams must have at least one player'}), 400
        if len(set(team_a_ids).intersection(set(team_b_ids))) > 0:
            return jsonify({'ok': False, 'error': 'A player cannot be on both teams'}), 400
        if len(team_a_ids) != len(team_b_ids):
            return jsonify({'ok': False, 'error': 'Both teams must have the same number of players'}), 400

        # Validate all are members and load/create rankings
        all_ids = team_a_ids + team_b_ids
        for uid in all_ids:
            if not Membership.query.filter_by(user_id=uid, group_id=group.id).first():
                return jsonify({'ok': False, 'error': f'User {uid} is not a member of this group'}), 400
        rankings = {}
        for uid in all_ids:
            r = Ranking.query.filter_by(user_id=uid, group_id=group.id).first()
            if not r:
                r = Ranking(user_id=uid, group_id=group.id, points=1000)
                db.session.add(r)
            rankings[uid] = r

        # Average team ratings
        import statistics
        ra = statistics.fmean([(rankings[uid].points or 1000) for uid in team_a_ids])
        rb = statistics.fmean([(rankings[uid].points or 1000) for uid in team_b_ids])
        k = 32.0
        expected_a = 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))
        expected_b = 1.0 / (1.0 + 10.0 ** ((ra - rb) / 400.0))
        if is_tie:
            score_a = 0.5
            score_b = 0.5
        else:
            # If not tie, determine winner by explicit field or assume team A is winner when winner_team==1
            winner_team = payload.get('winner_team')
            if winner_team not in (1, 2, None):
                return jsonify({'ok': False, 'error': 'winner_team must be 1 or 2 when using team arrays'}), 400
            if winner_team is None:
                # Fallback: require explicit since arrays provided
                return jsonify({'ok': False, 'error': 'winner_team (1 or 2) is required when using team arrays'}), 400
            score_a = 1.0 if winner_team == 1 else 0.0
            score_b = 1.0 - score_a

        # Compute deltas and distribute per member to keep rating pool balanced
        delta_a = k * (score_a - expected_a)
        delta_b = k * (score_b - expected_b)
        per_a = round(delta_a / len(team_a_ids))
        per_b = round(delta_b / len(team_b_ids))

        for uid in team_a_ids:
            rankings[uid].points = int((rankings[uid].points or 1000) + per_a)
        for uid in team_b_ids:
            rankings[uid].points = int((rankings[uid].points or 1000) + per_b)

        # Persist match and participants
        ta, tb, score_err = _parse_team_scores(payload)
        if score_err:
            return jsonify({'ok': False, 'error': score_err}), 400
        if is_tie:
            match = Match(group_id=group.id, winner_id=team_a_ids[0], loser_id=team_b_ids[0], is_tie=True, team_a_score=ta, team_b_score=tb)
        else:
            if score_a > score_b:
                match = Match(group_id=group.id, winner_id=team_a_ids[0], loser_id=team_b_ids[0], is_tie=False, team_a_score=ta, team_b_score=tb)
            else:
                match = Match(group_id=group.id, winner_id=team_b_ids[0], loser_id=team_a_ids[0], is_tie=False, team_a_score=ta, team_b_score=tb)
        db.session.add(match)
        db.session.flush()
        for uid in team_a_ids:
            db.session.add(MatchParticipant(match_id=match.id, user_id=uid, team=1))
        for uid in team_b_ids:
            db.session.add(MatchParticipant(match_id=match.id, user_id=uid, team=2))
        db.session.commit()

        return jsonify({
            'ok': True,
            'tie': is_tie,
            'team_a': [{'id': uid, 'elo': rankings[uid].points} for uid in team_a_ids],
            'team_b': [{'id': uid, 'elo': rankings[uid].points} for uid in team_b_ids],
        }), 201
    # Fallback to 1v1 flow
    if is_tie:
        p1_id = payload.get('player1_id') if 'player1_id' in payload else payload.get('winner_id')
        p2_id = payload.get('player2_id') if 'player2_id' in payload else payload.get('loser_id')
        if not isinstance(p1_id, int) or not isinstance(p2_id, int):
            return jsonify({'ok': False, 'error': 'player1_id and player2_id (or winner_id and loser_id) are required for ties'}), 400
        if p1_id == p2_id:
            return jsonify({'ok': False, 'error': 'Players must be different for a tie'}), 400

        # Validate both are members
        m1 = Membership.query.filter_by(user_id=p1_id, group_id=group.id).first()
        m2 = Membership.query.filter_by(user_id=p2_id, group_id=group.id).first()
        if not m1 or not m2:
            return jsonify({'ok': False, 'error': 'Both users must be members of the group'}), 400

        # Load or create rankings
        r1 = Ranking.query.filter_by(user_id=p1_id, group_id=group.id).first()
        if not r1:
            r1 = Ranking(user_id=p1_id, group_id=group.id, points=1000)
            db.session.add(r1)
        r2 = Ranking.query.filter_by(user_id=p2_id, group_id=group.id).first()
        if not r2:
            r2 = Ranking(user_id=p2_id, group_id=group.id, points=1000)
            db.session.add(r2)

        ra = float(r1.points or 1000)
        rb = float(r2.points or 1000)
        k = 32.0
        expected_a = 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))
        expected_b = 1.0 / (1.0 + 10.0 ** ((ra - rb) / 400.0))
        # Tie: both score 0.5
        new_ra = round(ra + k * (0.5 - expected_a))
        new_rb = round(rb + k * (0.5 - expected_b))

        r1.points = int(new_ra)
        r2.points = int(new_rb)
        ta, tb, score_err = _parse_team_scores(payload)
        if score_err:
            return jsonify({'ok': False, 'error': score_err}), 400
        db.session.add(Match(group_id=group.id, winner_id=p1_id, loser_id=p2_id, is_tie=True, team_a_score=ta, team_b_score=tb))
        db.session.commit()

        return jsonify({
            'ok': True,
            'tie': True,
            'player1': {'id': p1_id, 'elo': r1.points},
            'player2': {'id': p2_id, 'elo': r2.points},
        }), 201
    else:
        winner_id = payload.get('winner_id')
        loser_id = payload.get('loser_id')
        if not isinstance(winner_id, int) or not isinstance(loser_id, int):
            return jsonify({'ok': False, 'error': 'winner_id and loser_id are required'}), 400
        if winner_id == loser_id:
            return jsonify({'ok': False, 'error': 'Winner and loser must be different'}), 400

        # Validate both are members
        win_mem = Membership.query.filter_by(user_id=winner_id, group_id=group.id).first()
        lose_mem = Membership.query.filter_by(user_id=loser_id, group_id=group.id).first()
        if not win_mem or not lose_mem:
            return jsonify({'ok': False, 'error': 'Both users must be members of the group'}), 400

        # Load or create rankings
        win_rank = Ranking.query.filter_by(user_id=winner_id, group_id=group.id).first()
        if not win_rank:
            win_rank = Ranking(user_id=winner_id, group_id=group.id, points=1000)
            db.session.add(win_rank)
        lose_rank = Ranking.query.filter_by(user_id=loser_id, group_id=group.id).first()
        if not lose_rank:
            lose_rank = Ranking(user_id=loser_id, group_id=group.id, points=1000)
            db.session.add(lose_rank)

        ra = float(win_rank.points or 1000)
        rb = float(lose_rank.points or 1000)
        k = 32.0
        expected_a = 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))
        expected_b = 1.0 / (1.0 + 10.0 ** ((ra - rb) / 400.0))
        # Winner score=1, loser score=0
        new_ra = round(ra + k * (1.0 - expected_a))
        new_rb = round(rb + k * (0.0 - expected_b))

        win_rank.points = int(new_ra)
        lose_rank.points = int(new_rb)
        ta, tb, score_err = _parse_team_scores(payload)
        if score_err:
            return jsonify({'ok': False, 'error': score_err}), 400
        db.session.add(Match(group_id=group.id, winner_id=winner_id, loser_id=loser_id, is_tie=False, team_a_score=ta, team_b_score=tb))
        db.session.commit()

        return jsonify({
            'ok': True,
            'winner': {'id': winner_id, 'elo': win_rank.points},
            'loser': {'id': loser_id, 'elo': lose_rank.points},
        }), 201


@bp.route('/groups/<int:group_id>/matches', methods=['GET'])
def list_matches(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    # Must be a member to view
    if not Membership.query.filter_by(user_id=me.id, group_id=group.id).first():
        return jsonify({'ok': False, 'error': 'Forbidden'}), 403

    try:
        limit = int(request.args.get('limit', 20))
        offset = int(request.args.get('offset', 0))
    except ValueError:
        return jsonify({'ok': False, 'error': 'limit and offset must be integers'}), 400
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    matches = (
        Match.query.filter_by(group_id=group.id)
        .order_by(Match.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    def match_payload(m: Match):
        # Collect participants if present
        parts = (
            db.session.query(MatchParticipant, User)
            .join(User, User.id == MatchParticipant.user_id)
            .filter(MatchParticipant.match_id == m.id)
            .all()
        )
        participants = [
            {
                'user': {'id': u.id, 'username': u.username},
                'team': p.team,
                'place': p.place,
            }
            for (p, u) in parts
        ]
        kind = 'ffa' if any(p['team'] == 0 for p in participants) else ('team' if participants else 'duel')
        # Fallback participants for duels
        if not participants and (m.winner_id or m.loser_id):
            if m.winner_id:
                u = User.query.get(m.winner_id)
                if u:
                    participants.append({'user': {'id': u.id, 'username': u.username}, 'team': 1, 'place': None})
            if m.loser_id:
                u = User.query.get(m.loser_id)
                if u:
                    participants.append({'user': {'id': u.id, 'username': u.username}, 'team': 2, 'place': None})
        return {
            'id': m.id,
            'created_at': m.created_at.isoformat(),
            'is_tie': m.is_tie,
            'kind': kind,
            'winner_id': m.winner_id,
            'team_a_score': m.team_a_score,
            'team_b_score': m.team_b_score,
            'participants': participants,
        }

    return jsonify({'ok': True, 'matches': [match_payload(m) for m in matches]}), 200

@bp.route('/groups/<int:group_id>/transfer-ownership', methods=['POST'])
def transfer_ownership(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    my = Membership.query.filter_by(user_id=me.id, group_id=group.id).first()
    if not my or my.role != 'owner':
        return jsonify({'ok': False, 'error': 'Only owners can transfer ownership'}), 403

    payload = request.get_json(silent=True) or {}
    new_owner_id = payload.get('new_owner_id')
    if not isinstance(new_owner_id, int):
        return jsonify({'ok': False, 'error': 'new_owner_id is required'}), 400
    if new_owner_id == me.id:
        return jsonify({'ok': False, 'error': 'You already are the owner'}), 400

    target = Membership.query.filter_by(user_id=new_owner_id, group_id=group.id).first()
    if not target:
        return jsonify({'ok': False, 'error': 'Target user is not a member of this group'}), 404

    # Demote current owner and promote target
    my.role = 'member'
    target.role = 'owner'
    db.session.commit()

    return jsonify({'ok': True, 'group_id': group.id, 'old_owner_id': me.id, 'new_owner_id': new_owner_id}), 200

@bp.route('/groups/<int:group_id>/leave', methods=['POST'])
def leave_group(group_id: int):
    me = _current_user()
    if not me:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    group = Group.query.get_or_404(group_id)
    my = Membership.query.filter_by(user_id=me.id, group_id=group.id).first()
    if not my:
        return jsonify({'ok': False, 'error': 'You are not a member of this group'}), 404

    member_count = Membership.query.filter_by(group_id=group.id).count()
    if my.role == 'owner' and member_count > 1:
        return jsonify({'ok': False, 'error': 'Owner must transfer ownership before leaving'}), 400

    if my.role == 'owner' and member_count == 1:
        db.session.delete(group)
        db.session.commit()
        return jsonify({'ok': True, 'group_deleted': True}), 200
    else:
        rank = Ranking.query.filter_by(user_id=me.id, group_id=group.id).first()
        if rank:
            db.session.delete(rank)
        db.session.delete(my)
        db.session.commit()
        return jsonify({'ok': True, 'left_group': True}), 200

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def _b64url_decode(data: str) -> bytes:
    pad = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _jwt_encode(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    p = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f"{h}.{p}".encode('ascii')
    secret = current_app.config['SECRET_KEY'].encode('utf-8')
    sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    s = _b64url_encode(sig)
    return f"{h}.{p}.{s}"


def _jwt_decode(token: str) -> dict | None:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        h_b, p_b, s_b = parts
        signing_input = f"{h_b}.{p_b}".encode('ascii')
        sig = _b64url_decode(s_b)
        secret = current_app.config['SECRET_KEY'].encode('utf-8')
        expected = hmac.new(secret, signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(p_b).decode('utf-8'))
        if 'exp' in payload and int(payload['exp']) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def _issue_token(user_id: int) -> str:
    now = int(time.time())
    exp = now + int(current_app.config.get('JWT_EXP_SECONDS', 1209600))
    return _jwt_encode({"sub": int(user_id), "iat": now, "exp": exp})
@bp.route('/compare', methods=['POST'])
def compare():
    data = request.json
