"""Synthetic events and frames only; no game process, network, or administrator access."""
import io
import json
import struct
import unittest
from contextlib import redirect_stderr, redirect_stdout
from threading import Event
from unittest.mock import patch

from electron.prts_battle_core.analyzer import Analyzer
from electron.prts_battle_core.live import collect_reports
from electron.prts_battle_core.stats import MatchStats
from electron.prts_battle_core.windows_capture import RetiredConnections, Segment, segments


OLD = (('192.0.2.1', 40001), ('192.0.2.2', 8443))
NEW = (('192.0.2.1', 40002), ('192.0.2.2', 8443))
TOKEN = (36 << 16) | 7
TOKEN_TYPE = 'enemy_1137_plasm'


def segment(key, seq, payload=b'', *, syn=False):
    return Segment(0.0, *key, payload, seq, syn, not syn, False, False)


def settle(number, leaks, *, rejoin=False):
    return dict(kind='self_finish', round=number, escaped_count=leaks, from_rejoin=rejoin,
                escaped_ids=tuple(range(1, leaks + 1)), escaped_token_ids=())


def wire_ints(values):
    return struct.pack(f'!H{len(values)}i', len(values), *values)


def settle_frame(number, leaks, *, rejoin=False, tokens=(), instances=None):
    ordinary = range(1, leaks + 1) if instances is None else instances
    body = struct.pack('!BB', number, rejoin) + wire_ints(ordinary) + wire_ints(tokens)
    return frame(311, body + bytes(4))  # Empty action results and character statuses.


def wire_text(value):
    raw = value.encode('utf-8')
    return struct.pack('!H', len(raw)) + raw


def frame(message_id, body):
    return struct.pack('!II', len(body), message_id) + body


def preview_frame(name, number=1):
    return frame(303, struct.pack('!HB', 1, 0) + wire_text(name) + struct.pack('!bBB', 0, 8, number))


def runtime_body(totals):
    return struct.pack('!H', len(totals)) + b''.join(
        struct.pack('!BBBBhBBBBi', seat, 1, 0, 0, 10, 0, 0, 0, 0, damage)
        for seat, damage in totals.items())


def boss_scene_frame(number, state, *, totals=None, records=(), hp=None, groups=None, cooperative=None, costs=None):
    body = struct.pack('!bBBq', 0, state, number, 0) + runtime_body(totals or {}) + bytes(8)
    groups = groups or {}
    body += struct.pack('!H', len(groups))
    for seat, spawns in groups.items():
        body += struct.pack('!BH', seat, len(spawns))
        for action, enemy_id, instances in spawns:
            body += wire_text(enemy_id) + struct.pack('!bi', action, 0) + wire_ints(instances)
    body += (bytes(2) if cooperative is None else struct.pack('!HH', 1, len(cooperative)) +
             b''.join(escaped(*enemy) for enemy in cooperative) + bytes(2))
    body += bytes(2) if hp is None else struct.pack('!HBihHH', 1, 0, hp, 0, 0, 0)
    costs = costs or {}
    body += struct.pack('!H', len(costs)) + b''.join(struct.pack('!Bh', seat, cost) for seat, cost in costs.items())
    body += (struct.pack('!HBH', 1, 1, len(records)) + b''.join(
        wire_text('synthetic_boss') + struct.pack('!BB', 1, record == 15) for record in records)
        if records else bytes(2))
    return frame(302, body + bytes(2))


def boss_rank_frame(damage, seq=1):
    return frame(348, struct.pack('!iiHBHiii', seq, 0, 1, 20, 3, 1, 777, damage))


def boss_ratio_frame(seat=1, tier=7):
    return frame(366, struct.pack('!BhHH', seat, tier, 0, 0))


def uplink_boss_hit_frame(damage, seat=4, attacker=42, source=1, seq=1):
    return frame(341, struct.pack('!iBHB', seq, seat, 1, 3) + wire_ints((damage, attacker, source, seat)))


def escaped(owner, instance, token=False, enemy_id='synthetic_enemy'):
    return struct.pack('!B', owner) + wire_text(enemy_id) + struct.pack('!iBB', instance, token, 0)


def help_frame(number, kills, *, remaining=(), rejoin=False):
    body = struct.pack('!BBH', number, rejoin, len(remaining))
    body += b''.join(escaped(*enemy) for enemy in remaining)
    body += struct.pack('!H', len(kills))
    body += b''.join(struct.pack('!B', killer) + escaped(*enemy) + bytes(5) for killer, *enemy in kills)
    return frame(313, body)


def roster_frame(self_seat, players, *, banned_bonds=(), banned_units=None, scene_round=0, truncate_scene=False):
    body = b''.join(wire_text(value) for value in ('mode_multi_hard', 'synthetic', '', ''))
    body += struct.pack('!iBH', 42, self_seat, len(banned_bonds))
    body += b''.join(wire_text(bond) for bond in banned_bonds)
    body += struct.pack('!H', len(players))
    banned_units = banned_units or {}
    for seat, label in players.items():
        body += struct.pack('!HbHH', 0, seat, 0, 0) + wire_text(label) + bytes(20)
        seat_bans = banned_units.get(seat, ())
        body += struct.pack('!H', len(seat_bans))
        for bond_id, ids in seat_bans:
            body += wire_text(bond_id) + struct.pack(f'!H{len(ids)}h', len(ids), *ids)
    if truncate_scene:
        body += struct.pack('!bBBq', 0, 1, scene_round, 0) + b'\x00'
    else:
        body += struct.pack('!bBBq', 0, 1, scene_round, 0) + bytes(24)
    return frame(300, body)


def phase(number, name='prep', *, seed=None, escaped=None, costs=None):
    event = dict(kind='phase', round=number, phase=name, spawn_preview=(), spawn_groups=(), boss_spawns=(),
                 preparations=(), global_effects=(), boss_plan=None, escaped_players=escaped, last_hp_cost=costs or {},
                 escaped_enemies=(), escaped_details=None, runtime={}, player_status={})
    if seed is not None:
        event.update(stage_seed=seed, stage_id='synthetic', self_uid=1, players={1: 'example'},
                     mode_id='mode_multi_hard', boss_id='', hidden_boss_id='')
    return event


class MatchStatsTests(unittest.TestCase):
    def test_zero_refresh_does_not_erase_positive_hp_cost_across_updates_or_reconnects(self):
        report = MatchStats()
        report.set_hp_costs(7, {1: 10})
        report.set_help_skipped(7, {1: 10})
        report.set_hp_costs(7, {1: 0, 2: 0})
        self.assertEqual(report.snapshot()['rounds'][7]['hp_costs'], {1: 10, 2: 0})

        rejoined = MatchStats()
        rejoined.set_hp_costs(7, {1: 0, 2: 4})
        report.merge_reconnect(rejoined)
        self.assertEqual(report.snapshot()['rounds'][7]['hp_costs'], {1: 10, 2: 4})

        earlier = MatchStats()
        earlier.set_hp_costs(7, {1: 15})
        refreshed = MatchStats()
        refreshed.set_hp_costs(7, {1: 0})
        refreshed.merge_reconnect(earlier)
        self.assertEqual(refreshed.snapshot()['rounds'][7]['hp_costs'], {1: 15})

    def test_boss_round_basis_survives_reconnect_and_promotes_to_confirmed(self):
        inferred = MatchStats()
        inferred.set_boss_totals(14, {1: 500}, inferred=True)
        confirmed = MatchStats()
        confirmed.set_boss_totals(14, {1: 500})

        inferred.merge_reconnect(confirmed)
        self.assertEqual(inferred.snapshot()['rounds'][14]['boss_round_basis'], 'confirmed')
        stale = MatchStats()
        stale.set_boss_totals(14, {1: 500}, inferred=True)
        confirmed.merge_reconnect(stale)
        self.assertEqual(confirmed.snapshot()['rounds'][14]['boss_round_basis'], 'confirmed')

class AnalyzerTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer()
        self.analyzer.accept(segment(OLD, 1, syn=True), 'up')
        self.analyzer.accept(segment(NEW, 1, syn=True), 'up')

    def event(self, key, event, message_id):
        self.analyzer._record_event(self.analyzer.connections[key], key, message_id, event)

    def test_banned_bonds_locked_within_same_match_and_reset_on_new_match(self):
        cases = (
            (20, 1, ('bond_flame', 'bond_precise', 'bond_flame'), ['bond_flame', 'bond_precise']),
            (20, 2, ('bond_precise', 'bond_sargon'), ['bond_flame', 'bond_precise']),
            (21, 1, ('bond_victoria',), ['bond_victoria']),
        )
        for seed, number, bonds, expected in cases:
            with self.subTest(seed=seed, round=number):
                self.event(OLD, {**phase(number, seed=seed), 'banned_bonds': bonds}, 300)
                self.assertEqual(self.analyzer.snapshot()['battle_config']['banned_bonds'], expected)

    def test_new_match_promotes_buffered_result_after_old_socket_disappears(self):
        self.event(OLD, phase(4, seed=20), 300)
        self.event(OLD, settle(3, 2), 311)
        self.event(NEW, settle(1, 0), 311)
        before = self.analyzer.snapshot()
        self.assertEqual(self.analyzer.current[0], OLD)
        self.assertEqual(before['rounds'][3]['self_leaks'], 2)

        self.analyzer.retire_connections([OLD])
        after = self.analyzer.snapshot()
        self.assertEqual(self.analyzer.current[0], NEW)
        self.assertNotEqual(after['capture']['match'], before['capture']['match'])
        self.assertEqual(after['capture']['round'], 0)
        self.assertEqual(set(after['rounds']), {1})
        self.assertEqual(after['rounds'][1]['unassigned_self_leaks'], 0)

    def test_explicit_loading_on_same_connection_clears_old_rounds(self):
        self.event(OLD, phase(4, seed=20), 300)
        self.event(OLD, settle(4, 3), 311)
        first = self.analyzer.snapshot()['capture']['match']
        self.event(OLD, phase(0, 'loading'), 302)
        blank = self.analyzer.snapshot()
        self.assertEqual(blank['rounds'], {})
        self.assertIsNone(blank['capture']['self'])
        self.event(OLD, settle(1, 1), 311)
        second = self.analyzer.snapshot()
        self.assertNotEqual(second['capture']['match'], first)
        self.assertEqual(set(second['rounds']), {1})
        self.assertEqual(second['rounds'][1]['self_leaks'], 1)

    def test_different_full_scene_fingerprint_resets_same_connection(self):
        self.event(OLD, phase(4, seed=20), 300)
        self.event(OLD, settle(4, 3), 311)
        first = self.analyzer.snapshot()['capture']['match']
        self.event(OLD, phase(0, 'loading', seed=21), 300)
        second = self.analyzer.snapshot()
        self.assertNotEqual(second['capture']['match'], first)
        self.assertEqual(second['rounds'], {})
        self.assertEqual(second['capture']['round'], 0)

    def test_same_fingerprint_reconnect_keeps_history_and_new_local_result(self):
        self.event(OLD, phase(4, seed=20), 300)
        self.event(OLD, settle(4, 3), 311)
        first = self.analyzer.snapshot()['capture']['match']
        self.analyzer.retire_connections([OLD])
        self.event(NEW, settle(5, 0), 311)
        self.event(NEW, phase(5, seed=20), 300)
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['match'], first)
        self.assertEqual(set(report['rounds']), {4, 5})
        self.assertEqual([report['rounds'][n]['self_leaks'] for n in (4, 5)], [3, 0])

    def test_known_match_keeps_upcoming_forecast_when_the_next_scene_is_missing(self):
        self.event(OLD, phase(3, seed=20), 300)
        self.analyzer.accept(segment(OLD, 2, preview_frame('round_four_preview', number=4)), 'up')
        plan = self.analyzer.snapshot()['spawn_plan']
        self.assertEqual([(row['round'], row['enemy_id'], row['seen_round']) for row in plan],
                         [(4, 'round_four_preview', 3)])
        self.assertEqual(self.analyzer.snapshot()['capture']['round'], 3)

    def test_forecast_after_loading_is_kept_without_confirming_round(self):
        self.event(OLD, phase(3, seed=20), 300)
        self.event(OLD, phase(0, 'loading'), 302)
        self.analyzer.accept(segment(OLD, 2, preview_frame('round_four_preview', number=4)), 'up')
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['round'], 0)
        self.assertEqual([(row['round'], row['enemy_id']) for row in report['spawn_plan']],
                         [(4, 'round_four_preview')])

    def test_new_fingerprint_discards_provisional_rounds_after_its_confirmed_round(self):
        self.event(OLD, phase(4, seed=20), 300)
        self.event(NEW, settle(4, 2, rejoin=True), 311)
        self.event(NEW, phase(1, seed=21), 300)
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['round'], 1)
        self.assertEqual(set(report['rounds']), {1})

    def test_old_round_or_rejoin_without_boundary_does_not_start_a_match(self):
        self.event(OLD, settle(3, 1), 311)
        first = self.analyzer.snapshot()['capture']['match']
        self.event(OLD, settle(1, 4, rejoin=True), 311)
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['match'], first)
        self.assertEqual(set(report['rounds']), {3})

    def test_forward_rejoin_settlement_keeps_missing_mid_match_round(self):
        self.event(OLD, settle(3, 0), 311)
        self.event(OLD, settle(4, 2, rejoin=True), 311)
        self.event(OLD, settle(2, 5, rejoin=True), 311)
        self.event(OLD, settle(5, 3), 311)
        report = self.analyzer.snapshot()
        self.assertEqual(set(report['rounds']), {3, 4, 5})
        self.assertEqual([report['rounds'][n]['self_leaks'] for n in (3, 4, 5)], [0, 2, 3])

    def test_preparation_confirms_round_but_does_not_fabricate_phase(self):
        self.event(OLD, phase(1, seed=20), 300)
        self.event(OLD, dict(kind='preparation', preparation=(1, 22, 3, (), ())), 306)
        self.event(OLD, dict(kind='preparation', preparation=(1, 16, 2, (), ())), 306)
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['round'], 3)
        self.assertEqual(report['rounds'][3]['phase'], 'other')
        self.assertNotIn(2, report['rounds'])
        self.assertEqual(report['hp'][1], 22)

    def test_confirmed_boss_end_during_reconnect_preserves_the_same_match(self):
        self.event(OLD, phase(14, 'boss', seed=1), 300)
        active = self.analyzer.snapshot()['capture']['match']
        self.analyzer.retire_connections({OLD})
        self.event(NEW, {**phase(14, 'end'), 'runtime': {1: 12000}, 'boss_record_rounds': (14,)}, 302)
        self.event(NEW, phase(15, 'prep', seed=1), 300)
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['match'], active)
        self.assertEqual(report['rounds'][14]['phase'], 'end')
        self.assertEqual(report['rounds'][14]['boss_damage'], {1: 12000})
        self.assertEqual(report['rounds'][15]['boss_damage'], {})
        self.event(NEW, phase(1, 'prep', seed=2), 300)
        self.assertNotIn(14, self.analyzer.snapshot()['rounds'])

    def test_local_result_and_cooperative_result_keep_distinct_counts(self):
        self.event(OLD, phase(2, 'settle', seed=20, escaped=()), 300)
        self.event(OLD, settle(2, 3), 311)
        row = self.analyzer.snapshot()['rounds'][2]
        self.assertEqual(row['leaks'][1], 0)
        self.assertEqual(row['self_leaks'], 3)

    def test_token_resolves_on_both_sides_of_a_mixed_assist_settlement(self):
        local = settle_frame(6, 1, tokens=(TOKEN,))
        support = help_frame(6, [(4, 2, 1, False), (4, 2, TOKEN, True, '')])
        sparse = help_frame(6, [(4, 2, 1, False, '')])
        self.analyzer.accept(segment(OLD, 2, local + support + sparse * 2), 'up')
        report = self.analyzer.snapshot()
        row = report['rounds'][6]
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(report['capture']['self'], 2)
        self.assertEqual(row['self_leaks'], 2)
        self.assertEqual(row['assist_pairs'], [{'killer': 4, 'owner': 2, 'count': 2}])
        expected = {TOKEN_TYPE: 1, 'synthetic_enemy': 1}
        self.assertEqual({enemy['id']: enemy['count'] for enemy in row['self_leak_enemies']}, expected)
        self.assertEqual({enemy['id']: enemy['count'] for enemy in row['assist_enemies']}, expected)
        self.assertEqual(row['self_leak_enemies'][0]['name'], '\u7578\u53d8\u8d58\u751f\u7269')

    def test_token_catalog_works_without_a_seat_and_only_for_flagged_tokens(self):
        unknown = (655 << 16) | 7
        self.analyzer.accept(segment(OLD, 2, settle_frame(4, 1, instances=(TOKEN,), tokens=(TOKEN, unknown))), 'up')
        report = self.analyzer.snapshot()
        row = report['rounds'][4]
        self.assertIsNone(report['capture']['self'])
        self.assertEqual(row['self_leaks'], 3)
        self.assertEqual(row['assists_status'], 'unknown')
        self.assertEqual([(enemy['id'], enemy['count']) for enemy in row['self_leak_enemies']], [(TOKEN_TYPE, 1)])

    def test_all_eight_leaks_get_types_from_late_actual_spawns_without_help(self):
        self.analyzer.accept(segment(OLD, 2, settle_frame(8, 8)), 'up')
        self.assertEqual(self.analyzer.snapshot()['rounds'][8]['self_leak_enemies'], [])
        first = boss_scene_frame(8, 4, groups={2: [(0, 'synthetic_a', range(1, 5))]})
        sparse = boss_scene_frame(8, 7, groups={2: [(1, 'synthetic_b', range(5, 9))]}, costs={2: 8})
        self.analyzer.accept(segment(OLD[::-1], 42, first + sparse), 'down')
        report = self.analyzer.snapshot()
        row = report['rounds'][8]
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(report['capture']['self'], 2)
        self.assertEqual(row['self_leaks'], 8)
        self.assertEqual(row['assists_status'], 'skipped')
        self.assertEqual(row['assist_pairs'], [])
        expected = {'synthetic_a': 4, 'synthetic_b': 4}
        self.assertEqual({enemy['id']: enemy['count'] for enemy in row['self_leak_enemies']}, expected)
        self.assertEqual({enemy['id']: enemy['leaked'] for wave in row['wave_power']['rows']
                          for enemy in wave['enemies'] if enemy['leaked']}, expected)

    def test_late_same_round_escape_detail_names_a_blank_assist_and_wave(self):
        self.event(OLD, phase(6, seed=20), 300)
        packets = settle_frame(6, 1) + help_frame(6, [(4, 1, 1, False, '')])
        blank = boss_scene_frame(6, 5, cooperative=[(1, 1, False, '')])
        self.analyzer.accept(segment(OLD[::-1], 42, blank), 'down')
        self.analyzer.accept(segment(OLD, 2, packets), 'up')
        self.assertEqual(self.analyzer.snapshot()['rounds'][6]['assist_enemies'], [])
        typed = boss_scene_frame(6, 5, cooperative=[(1, 1, False, 'synthetic_late')])
        self.analyzer.accept(segment(OLD[::-1], 42 + len(blank), typed + blank), 'down')
        self.analyzer.accept(segment(OLD, 2 + len(packets), settle_frame(7, 1)), 'up')
        row = self.analyzer.snapshot()['rounds'][6]
        self.assertEqual(row['self_leak_enemies'][0]['id'], 'synthetic_late')
        self.assertEqual(row['assist_enemies'][0]['id'], 'synthetic_late')
        self.assertEqual(row['wave_power']['rows'][0]['enemies'][0]['id'], 'synthetic_late')
        self.assertEqual(self.analyzer.snapshot()['rounds'][7]['self_leak_enemies'], [])

    def test_conflicting_types_retain_count_and_do_not_use_the_token_default(self):
        local = settle_frame(6, 0, tokens=(TOKEN,))
        first = help_frame(6, [(4, 2, TOKEN, True, 'synthetic_first')])
        changed = help_frame(6, [(4, 2, TOKEN, True, 'synthetic_other')])
        self.analyzer.accept(segment(OLD, 2, local + first), 'up')
        self.assertEqual(self.analyzer.snapshot()['rounds'][6]['self_leak_enemies'][0]['id'], 'synthetic_first')
        self.analyzer.accept(segment(OLD, 2 + len(local + first), changed), 'up')
        row = self.analyzer.snapshot()['rounds'][6]
        self.assertEqual(row['self_leaks'], 1)
        self.assertEqual(row['assist_pairs'], [{'killer': 4, 'owner': 2, 'count': 1}])
        self.assertEqual(row['self_leak_enemies'], [])
        self.assertEqual(row['assist_enemies'], [])


    def test_help_settlement_assigns_both_sides_without_a_scene(self):
        local = settle_frame(2, 2)
        support = help_frame(2, [(3, 2, 1, False)], remaining=[(2, 2, False)])
        self.analyzer.accept(segment(OLD, 2, local + support), 'up')
        report = self.analyzer.snapshot()
        row = report['rounds'][2]
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(report['capture']['self'], 2)
        self.assertEqual(report['capture']['self_basis'], 'help')
        self.assertEqual(report['capture']['round'], 0)
        self.assertEqual(report['players'], {2: '', 3: ''})
        self.assertEqual(row['self_leaks'], 2)
        self.assertNotIn('unassigned_self_leaks', row)
        self.assertEqual(row['assist_pairs'], [{'killer': 3, 'owner': 2, 'count': 1}])
        self.assertEqual([(item['killer'], item['owner'], item['id'], item['count']) for item in row['assist_enemies']],
                         [(3, 2, 'synthetic_enemy', 1)])
        self.assertEqual([(item['id'], item['count']) for item in row['self_leak_enemies']], [('synthetic_enemy', 2)])
        self.assertEqual(row['assists_others'][3], 1)
        self.assertEqual(row['unattributed_assists'], 0)
        self.assertEqual(row['leaks_status'], 'reported')
        self.assertEqual(row['leaks'], {1: 0, 2: 2, 3: 0, 4: 0})

    def test_hp_cost_from_next_round_prep_stays_with_the_previous_round(self):
        self.event(OLD, phase(5, 'self', seed=20), 300)
        self.event(OLD, settle(5, 10), 311)
        self.event(OLD, phase(6, 'prep', costs={1: 10}), 302)
        row = self.analyzer.snapshot()['rounds'][5]
        self.assertEqual(row['self_leaks'], 10)
        self.assertEqual(row['hp_costs'][1], 10)

    def test_ambiguous_or_different_round_instances_do_not_assign_own_seat(self):
        local = settle_frame(2, 2)
        support = help_frame(2, [(3, 2, 1, False), (1, 4, 1, False)], remaining=[(2, 2, False)])
        different_round = help_frame(3, [(3, 2, 1, False), (3, 2, 2, False)])
        self.analyzer.accept(segment(OLD, 2, local + support + different_round), 'up')
        report = self.analyzer.snapshot()
        self.assertIsNone(report['capture']['self'])
        self.assertEqual(report['rounds'][2]['unassigned_self_leaks'], 2)
        self.assertEqual(len(report['rounds'][2]['assist_pairs']), 2)
        self.assertEqual(report['rounds'][2]['self_leak_enemies'], [])

    def test_partial_rejoin_and_missing_owner_do_not_claim_a_seat(self):
        local = settle_frame(2, 1)
        partial = help_frame(2, [(3, 2, 1, False), (3, 0, 2, False)], rejoin=True)
        self.analyzer.accept(segment(OLD, 2, local + partial), 'up')
        report = self.analyzer.snapshot()
        row = report['rounds'][2]
        self.assertIsNone(report['capture']['self'])
        self.assertEqual(row['assists_status'], 'observed')
        self.assertEqual(row['assist_pairs'], [{'killer': 3, 'owner': 2, 'count': 1}])
        self.assertEqual(row['unattributed_assists'], 1)

    def test_older_help_pairs_survive_a_round_change_and_narrower_settlement(self):
        first = settle_frame(4, 1) + help_frame(4, [(1, 3, 1, False), (1, 4, 2, False)])
        self.analyzer.accept(segment(OLD, 2, first), 'up')
        before = self.analyzer.snapshot()
        pair = {'killer': 1, 'owner': 3, 'count': 1}
        self.assertIn(pair, before['rounds'][4]['assist_pairs'])

        after_round = settle_frame(5, 0)
        partial = help_frame(4, [(1, 4, 2, False)], rejoin=True)
        self.analyzer.accept(segment(OLD, 2 + len(first), after_round + partial), 'up')
        resumed = self.analyzer.snapshot()
        self.assertEqual(resumed['rounds'][4], before['rounds'][4])

        narrower = help_frame(4, [(1, 4, 2, False)])
        self.analyzer.accept(segment(OLD, 2 + len(first + after_round + partial), narrower * 2), 'up')
        after = self.analyzer.snapshot()
        self.assertEqual(after['capture']['self'], 3)
        self.assertEqual(after['rounds'][4]['assists_status'], 'observed')
        self.assertEqual(after['rounds'][4]['assist_pairs'], before['rounds'][4]['assist_pairs'])
        self.assertEqual(after['rounds'][4]['assist_enemies'], before['rounds'][4]['assist_enemies'])
        self.assertEqual(after['rounds'][4]['self_leak_enemies'], before['rounds'][4]['self_leak_enemies'])
        self.assertEqual(after['rounds'][4]['assists_others'], {1: 2})
        self.assertEqual(after['rounds'][4]['leaks_status'], 'observed')
        self.assertEqual(after['rounds'][4]['leak_minimums'], {3: 1, 4: 1})
        self.assertEqual(after['rounds'][5]['self_leaks'], 0)

    def test_later_settlement_can_reassign_or_uncount_an_explicit_instance(self):
        local = settle_frame(4, 1)
        first = help_frame(4, [(1, 3, 1, False)])
        corrected = help_frame(4, [(2, 3, 1, False), (2, 3, 1, False)])
        packets = local + first + corrected * 2
        self.analyzer.accept(segment(OLD, 2, packets), 'up')
        row = self.analyzer.snapshot()['rounds'][4]
        self.assertEqual(row['assist_pairs'], [{'killer': 2, 'owner': 3, 'count': 1}])
        self.assertEqual(row['assists_status'], 'reported')

        remaining = help_frame(4, [], remaining=[(3, 1, False)])
        self.analyzer.accept(segment(OLD, 2 + len(packets), remaining), 'up')
        after = self.analyzer.snapshot()
        self.assertEqual(after['capture']['self'], 3)
        self.assertEqual(after['rounds'][4]['assist_pairs'], [])
        self.assertEqual(after['rounds'][4]['assist_enemies'], [])
        self.assertEqual(after['rounds'][4]['self_leaks'], 1)
        self.assertEqual(after['rounds'][4]['self_leak_enemies'][0]['id'], 'synthetic_enemy')

    def test_known_reconnect_merges_help_facts_without_leaking_into_new_match(self):
        self.event(OLD, phase(4, seed=20), 300)
        first = help_frame(4, [(2, 1, 1, False), (2, 4, 2, False)])
        self.analyzer.accept(segment(OLD, 2, first), 'up')
        before = self.analyzer.snapshot()
        self.analyzer.retire_connections([OLD])
        next_packet = help_frame(4, [(3, 4, 2, False, '')])
        self.analyzer.accept(segment(NEW, 2, next_packet), 'up')
        self.event(NEW, phase(5, seed=20), 300)
        after = self.analyzer.snapshot()
        self.assertEqual(after['capture']['match'], before['capture']['match'])
        self.assertEqual(after['rounds'][4]['assist_pairs'], [
            {'killer': 2, 'owner': 1, 'count': 1}, {'killer': 3, 'owner': 4, 'count': 1},
        ])
        self.assertEqual(after['rounds'][4]['assists_status'], 'observed')
        self.assertIn((3, 4, 'synthetic_enemy'), [(enemy['killer'], enemy['owner'], enemy['id'])
                                                for enemy in after['rounds'][4]['assist_enemies']])

        self.event(NEW, phase(1, seed=21), 300)
        new = self.analyzer.snapshot()
        self.assertNotEqual(new['capture']['match'], before['capture']['match'])
        self.assertEqual(set(new['rounds']), {1})
        self.assertEqual(new['rounds'][1]['assist_pairs'], [])

    def test_eliminated_player_spectating_keeps_self_seat_across_300_341_311_and_reconnect(self):
        players = {1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4'}
        alive_status = {s: {'hp': 25, 'finished': True} for s in range(1, 5)}
        self.event(OLD, {**phase(1, 'prep', seed=88), 'self_uid': 4, 'players': players, 'player_status': alive_status}, 300)
        first_match = self.analyzer.snapshot()['capture']['match']
        self.assertEqual(self.analyzer.snapshot()['capture']['self'], 4)

        # R8: seat 4 loses HP -> 0 (eliminated at R8) and emits own R8 self_finish
        dead_status = {1: {'hp': 12, 'finished': True}, 2: {'hp': 10, 'finished': True},
                       3: {'hp': 8, 'finished': True}, 4: {'hp': 0, 'finished': True}}
        self.event(OLD, {**phase(8, 'settle'), 'player_status': dead_status}, 302)
        self.event(OLD, settle(8, 2), 311)

        # R9-R14: spectating surviving seat 3; 300 switches self_uid=3, 341 sends uid=3, 311 sends spectator self_finish
        self.event(OLD, {**phase(9, 'prep', seed=88), 'self_uid': 3, 'players': players, 'player_status': dead_status}, 300)
        self.event(OLD, settle(9, 5), 311)
        self.event(OLD, {**phase(10, 'settle', escaped=(3,)), 'player_status': dead_status}, 302)
        self.event(OLD, settle(10, 1), 311)
        self.event(OLD, {**phase(14, 'boss'), 'boss_hp': 200000, 'player_status': dead_status}, 302)
        self.event(OLD, {'kind': 'step', 'uplink': True, 'uid': 3, 'steps': ((1, ((3, (15000, 10, 1, 3)),)),)}, 341)
        self.event(OLD, settle(14, 3), 311)

        # Reconnect on NEW: spectator 311 arrives before reconnect 300 with self_uid=3
        self.analyzer.retire_connections([OLD])
        self.event(NEW, settle(11, 4), 311)
        self.event(NEW, {**phase(14, 'boss', seed=88), 'self_uid': 3, 'players': players, 'player_status': dead_status}, 300)

        snap = self.analyzer.snapshot()
        self.assertEqual(snap['capture']['match'], first_match)
        self.assertEqual(len(self.analyzer.matches), 1)
        self.assertEqual(snap['capture']['self'], 4)
        self.assertEqual(snap['rounds'][8]['self_leaks'], 2)
        for spectator_round in (9, 10, 11, 14):
            if spectator_round in snap['rounds']:
                self.assertNotIn('self_leaks', snap['rounds'][spectator_round])
                self.assertNotIn(4, snap['rounds'][spectator_round]['leaks'])
        self.assertEqual(snap['rounds'][14]['boss_uplink'], {3: 15000})

    def test_missing_opening_300_locks_self_seat_from_354_shop_purchase_result(self):
        # Buffer R2 self_finish before seat is known, align downlink with 302 (no self_uid), then receive wire 354 for seat 4
        self.analyzer.accept(segment(OLD, 2, settle_frame(2, 3)), 'up')
        scene302 = boss_scene_frame(3, 3)
        self.analyzer.accept(segment(OLD[::-1], 100, scene302), 'down')
        prep_body = bytearray()
        prep_body += struct.pack('!BhB', 4, 24, 3)  # seat=4, hp=24, round=3
        prep_body += struct.pack('!7B', 3, 0, 0, 0, 0, 0, 0)
        prep_body += struct.pack('!HB', 0, 1)  # goods=0, seq=1
        prep_body += struct.pack('!5H', 0, 0, 0, 0, 0)  # pieces, equips, traps, positions, bonds
        prep_body += struct.pack('!HBH', 0, 0, 0)  # sp_prepare_after + enemies
        prep_body += struct.pack('!HBH', 0, 0, 0)  # after_enemies
        prep_body += struct.pack('!H', 0) + wire_text('') + bytes(13)
        f354 = frame(354, b'\x00\x00\x00\x00\x00\x00\x01' + bytes(prep_body))
        self.analyzer.accept(segment(OLD[::-1], 100 + len(scene302), f354), 'down')

        snap = self.analyzer.snapshot()
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(snap['capture']['self'], 4)
        self.assertEqual(snap['rounds'][2]['self_leaks'], 3)

    def test_missing_300_354_spectator_311_after_elimination_does_not_misidentify_survivor(self):
        from electron.prts_battle_core.wire import SpawnGroup

        # Case 1: No 300/354 at all; seat 4 eliminated at R8, then R9 spectator 311 matches survivor seat 3
        dead_status = {3: {'hp': 10, 'finished': True}, 4: {'hp': 0, 'finished': True}}
        self.event(OLD, {**phase(8, 'settle'), 'player_status': dead_status}, 302)
        self.analyzer.accept(segment(OLD, 2, settle_frame(9, 2, instances=(101, 102))), 'up')
        self.event(OLD, {
            **phase(9, 'self'),
            'spawn_groups': (SpawnGroup(3, 'synthetic_a', 0, 0, (101, 102)),),
        }, 302)
        self.analyzer.accept(segment(OLD, 2 + len(settle_frame(9, 2, instances=(101, 102))),
                                     help_frame(9, [(1, 3, 101, False)], remaining=[(3, 102, False)])), 'up')
        # Also R14 uplink step from spectating seat 3 after elimination must not lock self=3
        self.event(OLD, {**phase(14, 'boss'), 'boss_hp': 200000, 'player_status': dead_status}, 302)
        self.event(OLD, {'kind': 'step', 'uplink': True, 'uid': 3, 'steps': ((1, ((3, (9000, 10, 1, 3)),)),)}, 341)
        snap = self.analyzer.snapshot()
        self.assertIsNone(snap['capture']['self'])
        self.assertEqual(snap['rounds'][14]['boss_uplink'], {3: 9000})

        # Case 2: R4 help settlement identified seat 4 (self_basis='help'), then R8 seat 4 eliminated,
        # R9 spectator 311 + 313 for seat 3 must keep player=4 and not leak R9 spectator count to R9
        analyzer2 = Analyzer()
        analyzer2.accept(segment(OLD, 1, syn=True), 'up')
        conn2 = analyzer2.connections[OLD]
        r4_packets = settle_frame(4, 1, instances=(50,)) + help_frame(4, [(1, 4, 50, False)])
        analyzer2.accept(segment(OLD, 2, r4_packets), 'up')
        analyzer2._record_event(conn2, OLD, 302, {**phase(8, 'settle'), 'player_status': dead_status})
        r9_packets = settle_frame(9, 2, instances=(60, 61)) + help_frame(9, [(1, 3, 60, False)], remaining=[(3, 61, False)])
        analyzer2.accept(segment(OLD, 2 + len(r4_packets), r9_packets), 'up')
        snap2 = analyzer2.snapshot()
        self.assertEqual(snap2['capture']['self'], 4)
        self.assertEqual(snap2['rounds'][4]['self_leaks'], 1)
        self.assertNotIn('self_leaks', snap2['rounds'][9])


class BossCaptureTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer()
        self.analyzer.accept(segment(OLD, 1, syn=True), 'up')
        self.seq = 100

    def down(self, payload):
        self.analyzer.accept(segment(OLD[::-1], self.seq, payload), 'down')
        self.seq += len(payload)

    def test_end_scene_only_records_boss_totals_and_survives_reset_summary(self):
        # The previous known round is R8; the first R14 event is a final scene.
        self.analyzer.accept(segment(OLD, 2, settle_frame(8, 1)), 'up')
        terminal = boss_scene_frame(14, 8, totals={1: 35000, 2: 0}, records=(14,), hp=100000)
        self.down(terminal[:24])
        self.down(terminal[24:])
        self.down(boss_scene_frame(14, 8, totals={1: 0, 2: 0}))
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['round'], 14)
        self.assertEqual(report['rounds'][8]['self_leaks'], 1)
        row = report['rounds'][14]
        self.assertEqual(row['boss_status'], 'settlement')
        self.assertTrue(row['boss_ended'])
        self.assertEqual(row['boss_damage'], {1: 35000, 2: 0})
        self.assertEqual(row['boss_percent'], {1: 35, 2: 0})
        self.assertEqual(self.analyzer.boss_events['terminal'], 2)

    def test_same_round_boss_payload_in_terminal_scene_is_sufficient(self):
        self.down(boss_scene_frame(15, 8, totals={2: 2000}, hp=10000))
        row = self.analyzer.snapshot()['rounds'][15]
        self.assertTrue(row['boss_ended'])
        self.assertEqual(row['boss_damage'], {2: 2000})

    def test_runtime_after_confirmed_boss_end_is_kept_in_that_round(self):
        self.down(boss_scene_frame(14, 6, hp=10000))
        self.down(boss_scene_frame(14, 8, records=(14,), hp=10000))
        self.down(frame(310, runtime_body({1: 7000})))
        row = self.analyzer.snapshot()['rounds'][14]
        self.assertTrue(row['boss_ended'])
        self.assertEqual(row['boss_damage'], {1: 7000})
        self.assertEqual(row['boss_round_basis'], 'confirmed')

    def test_boss_only_updates_after_r13_can_fill_missing_r14_stage(self):
        self.down(boss_scene_frame(13, 4))
        self.down(frame(310, runtime_body({1: 6000})))
        self.down(boss_ratio_frame(seat=1, tier=7) + boss_rank_frame(6000))
        report = self.analyzer.snapshot()
        row = report['rounds'][14]
        self.assertEqual(row['boss_damage'], {1: 6000})
        self.assertEqual(row['boss_percent'], {1: 20})
        self.assertEqual(row['boss_official'][0]['damage'], 6000)
        self.assertEqual(row['boss_round_basis'], 'inferred')
        self.assertEqual(self.analyzer.boss_events['inferred'], 3)

    def test_boss_stage_confirms_inferred_damage_without_another_damage_update(self):
        self.down(boss_scene_frame(13, 4))
        self.down(frame(310, runtime_body({1: 6000})))
        self.down(boss_scene_frame(14, 4))
        self.assertEqual(self.analyzer.snapshot()['rounds'][14]['boss_round_basis'], 'inferred')
        self.down(boss_scene_frame(14, 6))
        row = self.analyzer.snapshot()['rounds'][14]
        self.assertEqual(row['boss_round_basis'], 'confirmed')
        self.assertEqual(row['boss_damage'], {1: 6000})
        self.assertEqual(row['boss_status'], 'reported')
        self.assertNotIn(15, self.analyzer.snapshot()['rounds'])

    def test_boss_runtime_without_nearby_round_confirmation_is_not_guessed(self):
        self.down(boss_scene_frame(12, 4, totals={1: 0}))
        self.down(frame(310, runtime_body({1: 6000})))
        report = self.analyzer.snapshot()
        self.assertNotIn(14, report['rounds'])
        self.assertEqual(self.analyzer.boss_events['unassigned'], 0)

    def test_late_boss_specific_results_stay_with_the_verified_round(self):
        self.down(boss_scene_frame(14, 6, hp=10000))
        self.down(boss_scene_frame(14, 8))
        self.down(boss_rank_frame(2000) + boss_ratio_frame())
        # A terminal R15 scene which only mentions a historical R14 result does not
        # authorize copying its unlabelled runtime totals to R15.
        self.down(boss_scene_frame(15, 8, records=(14,), totals={1: 2000}))
        self.down(boss_rank_frame(9999, seq=2) + boss_ratio_frame(tier=9))
        rows = self.analyzer.snapshot()['rounds']
        self.assertEqual(rows[14]['boss_percent'], {1: 20})
        self.assertEqual(rows[14]['boss_official'][0]['damage'], 2000)
        self.assertEqual(rows[15]['boss_damage'], {})
        self.assertEqual(rows[15]['boss_official'], [])
        self.assertEqual(self.analyzer.boss_events['unassigned'], 2)

    def test_runtime_and_quota_without_round_are_not_a_boss_record(self):
        # A valid quota can re-align a midstream decoder without proving a round.
        self.down(b'\xff\xff' + boss_ratio_frame(seat=0) + boss_ratio_frame())
        self.down(frame(310, runtime_body({1: 5000})))
        self.assertEqual(self.analyzer.boss_events['ratio'], 1)
        self.assertEqual(self.analyzer.boss_events['unassigned'], 1)
        self.assertEqual(self.analyzer.boss_events['runtime'], 1)
        self.assertEqual(self.analyzer.snapshot()['rounds'], {})

    def test_broken_phase_clears_boss_context_but_not_recorded_damage(self):
        self.down(boss_scene_frame(14, 6, totals={1: 2000}))
        self.down(frame(302, b'\x00'))  # Aligned frame, truncated body.
        self.down(frame(310, runtime_body({1: 6000})) + boss_ratio_frame(tier=8))
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['round'], 0)
        self.assertEqual(report['rounds'][14]['boss_damage'], {1: 2000})
        self.assertEqual(report['rounds'][14]['boss_percent'], {})
        self.assertEqual(self.analyzer.boss_events['unassigned'], 1)

    def test_uplink_boss_hits_after_r13_infer_r14_without_downlink(self):
        early = settle_frame(12, 1) + uplink_boss_hit_frame(1000, seat=4, seq=1)
        self.analyzer.accept(segment(OLD, 2, early), 'up')
        self.assertNotIn(14, self.analyzer.snapshot()['rounds'])
        late = settle_frame(13, 3) + uplink_boss_hit_frame(1200, seat=4, seq=2) + uplink_boss_hit_frame(1300, seat=4, seq=3)
        self.analyzer.accept(segment(OLD, 2 + len(early), late), 'up')
        report = self.analyzer.snapshot()
        self.assertEqual(report['capture']['self'], 4)
        row = report['rounds'][14]
        self.assertEqual(row['boss_round_basis'], 'inferred')
        self.assertEqual(row['boss_uplink'], {4: 2500})
        self.assertEqual(row['boss_uplink_rows'], [{'player': 4, 'attacker': 42, 'source': 1, 'damage': 2500}])
        self.assertEqual(self.analyzer.boss_events['inferred'], 2)

    def test_full_state_extracts_banned_bonds_and_defeated_boss_rounds(self):
        opening = roster_frame(2, {1: 'A', 2: 'B'}, banned_bonds=('yanShip', 'preciShip'))
        self.down(opening)
        self.down(boss_scene_frame(14, 8, totals={2: 9000}, records=(14,), hp=10000))
        report = self.analyzer.snapshot()
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(report['battle_config']['banned_bonds'], ['yanShip', 'preciShip'])
        self.assertEqual(report['defeated_boss_rounds'], [14])

    def test_partial_opening_300_with_banned_units_aligns_and_keeps_bans(self):
        partial = roster_frame(
            1, {1: 'Self'}, banned_bonds=('sargonShip', 'arcaneShip'),
            banned_units={1: [('sargonShip', (101, 102))]}, scene_round=1, truncate_scene=True,
        )
        self.down(partial)
        report = self.analyzer.snapshot()
        self.assertEqual(self.analyzer.parse_errors, 0)
        self.assertEqual(report['players'], {1: 'Self'})
        self.assertEqual(report['battle_config']['banned_bonds'], ['sargonShip', 'arcaneShip'])

    def test_downlink_gap_recovers_via_phase_anchor_without_ack(self):
        self.down(boss_scene_frame(3, 3))
        # Simulate a dropped downlink segment followed by a buffered R6 scene without peer ACK.
        r6 = b'\xde\xad\xbe\xef' + boss_scene_frame(6, 4)
        self.analyzer.accept(Segment(1.0, *OLD[::-1], r6, self.seq + 50, False, True, False, False), 'down')
        self.assertEqual(self.analyzer.snapshot()['capture']['round'], 3)
        self.analyzer.resume_acknowledged_gaps(2.0)
        self.assertEqual(self.analyzer.snapshot()['capture']['round'], 6)
        self.assertEqual(self.analyzer.snapshot()['rounds'][6]['phase'], 'self')

    def test_zero_runtime_heartbeat_does_not_wipe_boss_ratios(self):
        self.down(boss_scene_frame(14, 6, hp=16200400))
        self.down(boss_ratio_frame(seat=3, tier=7))
        # Zero-damage runtime heartbeats during active boss combat must not erase 20%/50%/80% milestone signals.
        self.down(frame(310, runtime_body({1: 0, 2: 0, 3: 0, 4: 0})))
        row = self.analyzer.snapshot()['rounds'][14]
        self.assertEqual(row['boss_percent'].get(3), 20)

    def test_r14_to_r15_prep_transition_captures_r14_settlement_and_late_runtime(self):
        # Case 1: direct (14, boss) -> (15, prep) carrying R14's non-zero runtime totals
        self.down(boss_scene_frame(14, 6, hp=16200400))
        self.down(boss_scene_frame(15, 3, totals={1: 4200000, 2: 4800000, 3: 3300000, 4: 3900400}, records=(14,)))
        rows = self.analyzer.snapshot()['rounds']
        self.assertEqual(rows[14]['boss_status'], 'settlement')
        self.assertEqual(rows[14]['boss_damage'], {1: 4200000, 2: 4800000, 3: 3300000, 4: 3900400})
        self.assertEqual(rows[15]['boss_damage'], {})

        # Case 2: direct (14, boss) -> (15, prep) with zero totals, followed by a late non-zero 310 before R15 boss starts
        late_analyzer = Analyzer()
        late_analyzer.accept(segment(OLD, 1, syn=True), 'up')
        seq = 100
        for pkt in (
            boss_scene_frame(14, 6, hp=16200400),
            boss_scene_frame(15, 3, totals={1: 0, 2: 0, 3: 0, 4: 0}, records=(14,)),
            frame(310, runtime_body({1: 4000000, 2: 4500000, 3: 3200000, 4: 4500400})),
        ):
            late_analyzer.accept(segment(OLD[::-1], seq, pkt), 'down')
            seq += len(pkt)
        late_rows = late_analyzer.snapshot()['rounds']
        self.assertEqual(late_rows[14]['boss_status'], 'settlement')
        self.assertEqual(late_rows[14]['boss_damage'][3], 3200000)
        self.assertEqual(late_rows[15]['boss_damage'], {})


class LiveCaptureTests(unittest.TestCase):
    def test_worker_reports_top_unknown_message_ids_without_payload_data(self):
        payload = frame(310, runtime_body({})) + frame(399, bytes(8))
        results = [(segment(OLD[::-1], 100, payload), 'down')]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), lambda status: self.fail(status))
        self.assertIn('PRTS_REPORT_UNKNOWN 0 399 1', diagnostics.getvalue())
        self.assertNotIn('synthetic', diagnostics.getvalue().lower())

    def test_worker_emits_first_final_boss_snapshot_before_disconnect(self):
        payload = boss_scene_frame(14, 8, totals={1: 4321}, records=(14,))
        closed = Segment(0.0, *OLD[::-1], payload, 100, False, True, True, False)
        results = [(closed, 'down'), None, None]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), lambda status: self.fail(status))
        values = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertEqual(len(values), 2)
        self.assertEqual(values[0]['rounds']['14']['boss_damage'], {'1': 4321})
        self.assertIsNone(values[1])
        self.assertIn('PRTS_REPORT_BOSS 0 1 0 0 0 0', diagnostics.getvalue())

    def test_worker_clears_old_report_on_new_loading_frame_on_same_socket(self):
        first = settle_frame(5, 3)
        loading_body = struct.pack('!bBBq', 0, 1, 0, 0) + bytes(22)
        loading = struct.pack('!II', len(loading_body), 302) + loading_body
        results = [(segment(OLD, 1, first), 'up'),
                   (segment(OLD[::-1], 1, loading), 'down'),
                   (segment(OLD, 1 + len(first), settle_frame(1, 0)), 'up')]
        out, diagnostics = io.StringIO(), io.StringIO()
        status = []
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), status.append)
        first_report, cleared, new_report = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertFalse(status)
        self.assertEqual(set(first_report['rounds']), {'5'})
        self.assertIsNone(cleared)
        self.assertEqual(set(new_report['rounds']), {'1'})
        self.assertNotEqual(first_report['capture']['match'], new_report['capture']['match'])

    def test_worker_immediately_reports_settlement_only_and_then_clears_on_close(self):
        first = settle_frame(1, 0)
        second = settle_frame(2, 5)
        results = [(segment(OLD, 1, first), 'up'), (segment(OLD, 1 + len(first), second), 'up'),
                   RetiredConnections(frozenset({OLD})), None, (segment(NEW, 1, settle_frame(1, 2)), 'up')]
        out, diagnostics = io.StringIO(), io.StringIO()
        status = []
        with redirect_stdout(out), redirect_stderr(diagnostics), patch('electron.prts_battle_core.live.monotonic', return_value=1.0):
            collect_reports(iter(results), Event(), status.append)
        reports = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertFalse(status)
        self.assertEqual(len(reports), 4)
        first_report, second_report, cleared, new_report = reports
        self.assertEqual(first_report['rounds']['1']['self_leaks'], 0)
        self.assertEqual(second_report['rounds']['2']['self_leaks'], 5)
        self.assertEqual(second_report['capture']['round'], 0)  # No downlink scene was received.
        self.assertEqual(set(second_report['capture']), {'match', 'round', 'self'})
        self.assertIsNone(cleared)
        self.assertEqual(set(new_report['rounds']), {'1'})
        self.assertEqual(new_report['rounds']['1']['self_leaks'], 2)
        self.assertNotEqual(second_report['capture']['match'], new_report['capture']['match'])

    def test_worker_switches_on_new_socket_r1_without_downlink_or_old_socket_retirement(self):
        old = preview_frame('old_preview') + settle_frame(9, 3)
        new = preview_frame('new_preview')
        rejoin = settle_frame(1, 5, rejoin=True)
        results = [(segment(OLD, 1, old), 'up'),
                   (segment(NEW, 1, syn=True), 'up'),
                   (segment(NEW, 2, new + rejoin), 'up'),
                   (segment(NEW, 2 + len(new + rejoin), settle_frame(1, 2)), 'up')]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), self.fail)
        before, after = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertEqual(set(before['rounds']), {'9'})
        self.assertNotEqual(before['capture']['match'], after['capture']['match'])
        self.assertEqual(after['capture']['round'], 0)  # A settlement does not certify the live phase.
        self.assertEqual(set(after['rounds']), {'1'})
        self.assertEqual(after['rounds']['1']['self_leaks'], 2)
        self.assertEqual([item['enemy_id'] for item in after['spawn_plan']], ['new_preview'])

    def test_worker_switches_on_reused_socket_at_r1_preview_then_updates_its_result(self):
        old = preview_frame('old_preview') + settle_frame(9, 3)
        new = preview_frame('new_preview')
        rejoin = settle_frame(1, 5, rejoin=True)
        results = [(segment(OLD, 1, old), 'up'),
                   (segment(OLD, 1 + len(old), new + rejoin), 'up'),
                   (segment(OLD, 1 + len(old + new + rejoin), settle_frame(1, 0)), 'up')]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), self.fail)
        reports = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        before, after = reports[0], reports[-1]
        self.assertNotEqual(before['capture']['match'], after['capture']['match'])
        self.assertEqual([item['enemy_id'] for item in before['spawn_plan']], ['old_preview'])
        self.assertEqual([item['enemy_id'] for item in after['spawn_plan']], ['new_preview'])
        self.assertEqual(set(after['rounds']), {'1'})

    def test_worker_promotes_opening_preview_after_old_client_fin_without_server_fin(self):
        old = settle_frame(9, 3)
        new = preview_frame('new_preview')
        fin = Segment(0.0, *OLD, b'', 1 + len(old), False, True, True, False)
        results = [(segment(OLD, 1, old), 'up'), (segment(NEW, 1, new), 'up'), (fin, 'up'), None]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), self.fail)
        before, after = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertNotEqual(before['capture']['match'], after['capture']['match'])
        self.assertEqual(after['rounds'], {})
        self.assertEqual([item['enemy_id'] for item in after['spawn_plan']], ['new_preview'])

    def test_worker_switches_on_a_verified_r1_scene_even_without_a_full_scene(self):
        old = settle_frame(9, 3)
        new = boss_scene_frame(1, 3)
        results = [(segment(OLD, 1, old), 'up'), (segment(OLD[::-1], 42, new), 'down')]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), self.fail)
        before, after = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertNotEqual(before['capture']['match'], after['capture']['match'])
        self.assertEqual(after['capture']['round'], 1)
        self.assertEqual(set(after['rounds']), {'1'})

    def test_roster_labels_stay_in_local_feed_and_clear_at_match_boundary(self):
        before = roster_frame(2, {2: 'SyntheticSelf#1001', 3: 'SyntheticTeammate#1002'})
        after = roster_frame(1, {1: 'DifferentSyntheticSelf#1003'})
        results = [(segment(OLD[::-1], 1, before), 'down'),
                   (segment(OLD, 1, settle_frame(1, 1)), 'up'),
                   (segment(OLD[::-1], 1 + len(before), after), 'down')]
        out, diagnostics = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(diagnostics):
            collect_reports(iter(results), Event(), lambda _: None)
        reports = [json.loads(line)['report'] for line in out.getvalue().splitlines()]
        self.assertEqual(reports[0]['players']['3'], 'SyntheticTeammate#1002')
        self.assertEqual(reports[0]['capture']['self'], 2)
        self.assertEqual(reports[-1]['players'], {'1': 'DifferentSyntheticSelf#1003'})
        self.assertNotEqual(reports[0]['capture']['match'], reports[-1]['capture']['match'])
        self.assertNotIn('Synthetic', diagnostics.getvalue())

    def test_capture_emits_retirement_without_fin_or_reset(self):
        stopped = Event()
        with patch('electron.prts_battle_core.windows_capture.game_pids', return_value={1}), \
             patch('electron.prts_battle_core.windows_capture.game_connections', side_effect=[{OLD}, {NEW}]), \
             patch('electron.prts_battle_core.windows_capture.monotonic', side_effect=[0.0, 0.3]), \
             patch('electron.prts_battle_core.windows_capture.open_receiver'), \
             patch('electron.prts_battle_core.windows_capture.select', return_value=([], [], [])), \
             redirect_stderr(io.StringIO()):
            stream = segments(stopped, lambda _: None)
            try:
                self.assertIsNone(next(stream))
                self.assertEqual(next(stream), RetiredConnections(frozenset({OLD})))
            finally:
                stream.close()


class _SyntheticMemory:
    def __init__(self, base: int = 0x180000000):
        self.base = base
        self.mem: dict[int, bytes] = {}
        self.write(base, b'MZ')
        self.hook_on_address: dict[int, callable] = {}

    def write(self, addr: int, raw: bytes) -> None:
        for i, b in enumerate(raw):
            self.mem[addr + i] = bytes((b,))

    def write_il2cpp_str(self, addr: int, text: str) -> int:
        encoded = text.encode('utf-16-le')
        self.write(addr + 0x10, struct.pack('<i', len(text)) + encoded)
        return addr

    def module_base(self, module_name: str) -> int | None:
        return self.base if module_name.lower() == 'gameassembly.dll' else None

    def read_bytes(self, address: int, size: int) -> bytes | None:
        hook = self.hook_on_address.get(address)
        if hook:
            hook()
        out = bytearray()
        for off in range(size):
            chunk = self.mem.get(address + off)
            if chunk is None:
                return None
            out.extend(chunk)
        return bytes(out)

    def close(self) -> None:
        pass


class CombatMeterAndInspectorTests(unittest.TestCase):
    def test_three_rate_calibers_summon_rollup_trap_isolation_and_pause_invariance(self):
        from electron.prts_battle_core.combat_meter import (
             ArenaTelemetryCoordinator, BattleFrameSample, CombatMeter, EnemySample, UnitSample,
        )

        meter = CombatMeter(battle_id='b1', stage_id='act38_ex08', stage_name='熔炉边界')
        # Tick 0 (0.0s): Wis'adel deployed, no damage yet
        meter.observe_frame(BattleFrameSample(
            battle_id='b1',
            logic_tick=0,
            units=(UnitSample(instance_id=10, unit_id='char_1035_wisdel', owner_seat=1, on_field=True),),
            enemies=(EnemySample(instance_id=900, enemy_id='enemy_boss', name='首领', hp=50000, max_hp=50000, is_boss=True),),
        ))
        # Tick 90 (3.0s): Idle waiting for enemies -> presence=3.0s, active=0
        meter.observe_frame(BattleFrameSample(
            battle_id='b1',
            logic_tick=90,
            units=(UnitSample(instance_id=10, unit_id='char_1035_wisdel', owner_seat=1, on_field=True),),
            enemies=(EnemySample(instance_id=900, enemy_id='enemy_boss', name='首领', hp=50000, max_hp=50000, is_boss=True),),
        ))
        # Tick 120 (4.0s): Deals 6000 physical + summon deals 3000 arts; stage trap deals 99999 true
        meter.observe_frame(BattleFrameSample(
            battle_id='b1',
            logic_tick=120,
            units=(
                UnitSample(instance_id=10, unit_id='char_1035_wisdel', owner_seat=1, on_field=True, physical=6000),
                UnitSample(instance_id=11, unit_id='token_10042_wisdel_soul', owner_seat=1, host_instance_id=10, is_summon=True, on_field=True, arts=3000),
                UnitSample(instance_id=88, unit_id='trap_042_altar', name='源石祭坛', is_device=True, true=99999),
            ),
            enemies=(EnemySample(instance_id=900, enemy_id='enemy_boss', name='首领', hp=5000, max_hp=50000, is_boss=True),),
        ))
        # Pause test: repeated identical logic_tick=120 must NOT advance presence or alter DPS
        snap_before_pause = meter.snapshot()
        meter.observe_frame(BattleFrameSample(
            battle_id='b1',
            logic_tick=120,
            units=(
                UnitSample(instance_id=10, unit_id='char_1035_wisdel', owner_seat=1, on_field=True, physical=6000),
                UnitSample(instance_id=11, unit_id='token_10042_wisdel_soul', owner_seat=1, host_instance_id=10, is_summon=True, on_field=True, arts=3000),
                UnitSample(instance_id=88, unit_id='trap_042_altar', name='源石祭坛', is_device=True, true=99999),
            ),
            enemies=(EnemySample(instance_id=900, enemy_id='enemy_boss', name='首领', hp=5000, max_hp=50000, is_boss=True),),
        ))
        snap_after_pause = meter.snapshot()
        self.assertEqual(snap_before_pause['operators'][0]['active_dps'], snap_after_pause['operators'][0]['active_dps'])
        self.assertEqual(snap_before_pause['operators'][0]['presence_seconds'], 4.0)

        # Trap isolated from team_total_damage and share_ratio
        self.assertEqual(snap_after_pause['team_total_damage'], 9000.0)
        self.assertEqual(len(snap_after_pause['stage_devices']), 1)
        self.assertEqual(snap_after_pause['stage_devices'][0]['total_damage'], 99999.0)
        op = snap_after_pause['operators'][0]
        self.assertEqual(op['name'], '维什戴尔')
        self.assertEqual(op['summon_damage'], 3000.0)
        self.assertEqual(op['share_ratio'], 1.0)
        # Future tail clipped at now=4.0s -> active window [3.0, 4.0] = 1.0s (NOT 2.5s!) -> 9000 / 1.0 = 9000 DPS
        self.assertEqual(op['active_seconds'], 1.0)
        self.assertEqual(op['active_dps'], 9000.0)
        # Unhooked fields stay honest None
        self.assertIsNone(op['shield_guarded'])
        self.assertIsNone(op['overkill_trimmed'])
        self.assertIsNone(op['mitigation_ratio'])

        # Tick 180 (6.0s): Host retreats (on_field=False), summon deals +1000 arts; boss respawns HP pool to 50000
        meter.observe_frame(BattleFrameSample(
            battle_id='b1',
            logic_tick=180,
            units=(
                UnitSample(instance_id=10, unit_id='char_1035_wisdel', owner_seat=1, on_field=False, physical=6000),
                UnitSample(instance_id=11, unit_id='token_10042_wisdel_soul', owner_seat=1, host_instance_id=10, is_summon=True, on_field=True, arts=4000),
            ),
            enemies=(EnemySample(instance_id=900, enemy_id='enemy_boss', name='首领', hp=50000, max_hp=50000, is_boss=True),),
        ))
        snap_retreated = meter.snapshot()
        self.assertEqual(snap_retreated['operators'][0]['total_damage'], 10000.0)
        self.assertEqual(snap_retreated['operators'][0]['presence_seconds'], 4.0)
        self.assertEqual(snap_retreated['enemy_pool']['respawn_resets'], 1)

        # Prep-phase defense telemetry retention in ArenaTelemetryCoordinator
        coord = ArenaTelemetryCoordinator()
        coord.accept_battle_frame(
            BattleFrameSample(
                battle_id='r3_def',
                logic_tick=60,
                units=(UnitSample(instance_id=1, unit_id='char_4133_logos', owner_seat=2, arts=12000),),
            ),
            in_stronghold=True,
            mode_id='mode_multi_hard',
            round_number=3,
            phase='self',
        )
        coord.accept_battle_frame(None, in_stronghold=True)
        report = {
            'capture': {'match': 1, 'round': 4, 'self': 2},
            'rounds': {4: {'phase': 'prep'}},
            'battle_config': {'mode_id': 'mode_multi_hard'},
        }
        # Clear active meter to simulate entering R4 shop where battle controller is destroyed
        coord._active_meter = None
        enriched = coord.enrich_report(report)
        self.assertEqual(enriched['telemetry']['retained_round'], 3)
        self.assertEqual(enriched['telemetry']['operators'][0]['name'], '逻各斯')

    def test_protocol_squad_lineups_and_boss_attacker_operator_mapping(self):
        stats = MatchStats()
        stats.set_players({1: 'Alpha', 2: 'Bravo'})
        stats.set_roster_squads({
            2: [
                {'chess_id': 'chess_char_6_24_a', 'char_id': 'char_1035_wisdel', 'bonds': ('sargonShip',), 'is_banned': False},
                {'chess_id': 'chess_char_6_08_a', 'char_id': 'char_4133_logos', 'bonds': ('arcaneShip',), 'is_banned': True},
            ]
        })
        stats.set_shops([
            {'seat': 2, 'round': 14, 'shop_level': 6, 'skill_id': 'band_kalts', 'pieces': {501: 1035}, 'positions': {501: 12}}
        ])
        stats.set_phase(14, 'boss')
        stats.add_step(14, 1, ((3, (48000, 501, 1, 2)),), uplink=True, uid=2)
        snap = stats.snapshot()
        self.assertEqual(snap['lineups'][2]['shop_level'], 6)
        self.assertEqual(snap['lineups'][2]['strategist'], '凯尔希')
        self.assertEqual(snap['lineups'][2]['squad'][0]['name'], '维什戴尔')
        hit = snap['rounds'][14]['boss_uplink_rows'][0]
        self.assertEqual(hit['char_id'], 'char_1035_wisdel')
        self.assertEqual(hit['operator_name'], '维什戴尔')

    def test_guarded_pc_inspector_reads_clean_frame_and_discards_torn_frame(self):
        from electron.prts_battle_core.pc_inspector import FieldLayout, PcBattleInspector

        mem = _SyntheticMemory()
        layout = FieldLayout(build_tag='*', controller_rva=0x1000)
        ctrl = 0x20000000
        mem.write(mem.base + layout.controller_rva, struct.pack('<Q', ctrl))
        mem.write(ctrl + layout.logic_tick_offset, struct.pack('<i', 150))
        stage_str = mem.write_il2cpp_str(0x20001000, 'main_14-21')
        mem.write(ctrl + layout.stage_id_offset, struct.pack('<Q', stage_str))

        # 1 unit in list
        ulist = 0x20002000
        uarr = 0x20002100
        u0 = 0x20003000
        stats_ptr = 0x20003200
        cid_str = mem.write_il2cpp_str(0x20003400, 'char_4116_blkkgt')
        name_str = mem.write_il2cpp_str(0x20003600, '锏')
        mem.write(ctrl + layout.unit_list_offset, struct.pack('<Q', ulist))
        mem.write(ctrl + layout.enemy_list_offset, struct.pack('<Q', 0))
        mem.write(ulist + layout.list_items_offset, struct.pack('<Q', uarr))
        mem.write(ulist + layout.list_size_offset, struct.pack('<i', 1))
        mem.write(uarr + layout.array_first_offset, struct.pack('<Q', u0))
        mem.write(u0 + layout.unit_instance_id_offset, struct.pack('<i', 7))
        mem.write(u0 + layout.unit_char_id_offset, struct.pack('<Q', cid_str))
        mem.write(u0 + layout.unit_name_offset, struct.pack('<Q', name_str))
        mem.write(u0 + layout.unit_seat_offset, struct.pack('<i', 1))
        mem.write(u0 + layout.unit_flags_offset, struct.pack('<I', 1))
        mem.write(u0 + layout.unit_host_inst_offset, struct.pack('<i', 0))
        mem.write(u0 + layout.unit_stats_offset, struct.pack('<Q', stats_ptr))
        mem.write(stats_ptr + layout.stats_channels_offset, struct.pack('<5d', 45000.0, 0.0, 0.0, 0.0, 0.0))

        inspector = PcBattleInspector(layout_registry={'*': layout}, source_factory=lambda: mem)
        frame = inspector.poll()
        self.assertIsNotNone(frame)
        self.assertEqual(inspector.status, 'active')
        self.assertEqual(frame.stage_id, 'main_14-21')
        self.assertEqual(frame.units[0].name, '锏')
        self.assertEqual(frame.units[0].physical, 45000.0)

        # Simulate mid-read frame mutation (tick jumps by +10 while reading stats) -> must be discarded as torn!
        def mutate_mid_poll():
            mem.write(ctrl + layout.logic_tick_offset, struct.pack('<i', 160))

        mem.hook_on_address[stats_ptr + layout.stats_channels_offset] = mutate_mid_poll
        torn = inspector.poll()
        self.assertIsNone(torn)
        self.assertEqual(inspector.torn_reads, 1)

    def test_quick_mode_r9_boss_capture_and_protocol_telemetry(self):
        from electron.prts_battle_core.combat_meter import ArenaTelemetryCoordinator

        analyzer = Analyzer()
        analyzer.accept(segment(OLD, 1, syn=True), 'up')
        # Mode: mode_single_funny (极速模拟, R9 Boss)
        opening_event = {
            **phase(8, 'self', seed=99),
            'mode_id': 'mode_single_funny',
            'players': {1: '单人玩家'},
            'boss_id': 'boss_3',
        }
        analyzer._record_event(analyzer.connections[OLD], OLD, 300, opening_event)
        # R9 boss phase + official rank (op=20, chess_id=4 -> 黑键 char_4046_ebnhlz) + ratio + terminal
        analyzer._record_event(analyzer.connections[OLD], OLD, 302, {
            **phase(9, 'boss'),
            'boss_hp': 4200000,
        })
        analyzer._record_event(analyzer.connections[OLD], OLD, 348, {
            'kind': 'step',
            'steps': ((1, ((20, (1, 4, 180000, 1, 2, 95000)),)),),
        })
        analyzer._record_event(analyzer.connections[OLD], OLD, 366, {
            'kind': 'boss_ratio', 'uid': 1, 'ratio': 0.2,
        })
        analyzer._record_event(analyzer.connections[OLD], OLD, 302, {
            **phase(9, 'end'),
            'runtime': {1: 275000},
            'boss_hp': 4200000,
            'boss_records_raw': ((False, True),),
        })
        snap = analyzer.snapshot()
        self.assertEqual(snap['boss_rounds'], [9])
        self.assertEqual(snap['defeated_boss_rounds'], [9])
        self.assertEqual(snap['battle_config']['mode_name'], '极速模拟')
        r9 = snap['rounds'][9]
        self.assertEqual(r9['boss_damage'], {1: 275000})
        self.assertEqual(r9['boss_official'][0]['operator_name'], '黑键')
        self.assertEqual(r9['boss_official'][1]['operator_name'], '车尔尼')
        self.assertEqual(analyzer.boss_events['unassigned'], 0)

        coord = ArenaTelemetryCoordinator()
        enriched = coord.enrich_report(snap)
        ops = enriched['telemetry']['operators']
        self.assertEqual(ops[0]['name'], '黑键')
        self.assertEqual(ops[0]['total_damage'], 180000.0)
        self.assertEqual(ops[1]['name'], '车尔尼')

    def test_eliminated_seat_returns_cards_to_deck_pool_and_blocks_spectator_leaks(self):
        analyzer = Analyzer()
        analyzer.accept(segment(OLD, 1, syn=True), 'up')
        conn = analyzer.connections[OLD]
        analyzer._record_event(conn, OLD, 300, {
            **phase(5, 'prep', seed=55),
            'players': {1: '我', 2: '队友2', 3: '队友3', 4: '队友4'},
            'squads': {
                1: [
                    {'chess_id': 'chess_char_4_01_a', 'char_id': 'char_4046_ebnhlz', 'bonds': ('leithanienShip',), 'is_banned': False},
                    {'chess_id': 'chess_char_1_09_a', 'char_id': 'char_4166_varkis', 'bonds': ('minosShip',), 'is_banned': False},
                ],
            },
            'shops': [
                {'seat': 1, 'round': 5, 'shop_level': 4, 'skill_id': 'aceffect_band_22', 'pieces': {10: 4}, 'positions': {10: 3, 20: 5, 999: 8}, 'equips': {20: 311}, 'traps': {}, 'shop': [{'slot': 0, 'price': 2, 'chess_id': 4, 'frozen': 0}]},
                {'seat': 2, 'round': 5, 'shop_level': 4, 'skill_id': 'aceffect_band_22', 'pieces': {11: 5}, 'positions': {11: 3}, 'equips': {}, 'traps': {}, 'shop': []},
            ],
            'player_status': {1: {'hp': 10, 'finished': True}, 2: {'hp': 5, 'finished': True}, 3: {'hp': 15, 'finished': True}, 4: {'hp': 20, 'finished': True}},
        })
        snap_alive = analyzer.snapshot()
        self.assertEqual(snap_alive['lineups'][1]['strategist'], '阿米娅·众志合一')
        self.assertEqual(snap_alive['lineups'][1]['piece_count'], 1)
        self.assertEqual(snap_alive['lineups'][1]['deployed_count'], 1)
        self.assertEqual(len(snap_alive['lineups'][1]['deployed']), 1)
        self.assertEqual(snap_alive['lineups'][1]['deployed'][0]['name'], '黑键')
        self.assertEqual(snap_alive['lineups'][1]['equips'][0]['name'], '维式重锤')
        ebn_alive = next(o for o in snap_alive['deck_pool']['operators'] if o['char_id'] == 'char_4046_ebnhlz')
        # Seat 1 holds 1 normal copy (1), Seat 2 holds 1 golden copy (3) -> taken 4, remaining 12 of 16
        self.assertEqual(ebn_alive['taken_total'], 4)
        self.assertEqual(ebn_alive['remaining'], 12)

        # Round 6 prep: Seat 2 is eliminated (hp=0 -> eliminated at R5); Seat 2's golden copy returns to pool!
        analyzer._record_event(conn, OLD, 302, {
            **phase(6, 'prep'),
            'player_status': {1: {'hp': 3, 'finished': True}, 2: {'hp': 0, 'finished': True}, 3: {'hp': 8, 'finished': True}, 4: {'hp': 13, 'finished': True}},
        })
        analyzer._record_event(conn, OLD, 302, {
            **phase(6, 'settle', escaped=(1,)),
            'player_status': {1: {'hp': 0, 'finished': True}, 2: {'hp': 0, 'finished': True}, 3: {'hp': 8, 'finished': True}, 4: {'hp': 13, 'finished': True}},
        })
        # Round 7 spectator self_finish must be ignored since self (seat 1) died at R6
        analyzer._record_event(conn, OLD, 311, settle(7, 12))
        snap_after = analyzer.snapshot()
        self.assertEqual(snap_after['eliminated'][2], 5)
        self.assertEqual(snap_after['eliminated'][1], 6)
        self.assertNotIn(2, snap_after['rounds'][6]['leaks'])
        self.assertNotIn(7, snap_after['rounds'])
        ebn_after = next(o for o in snap_after['deck_pool']['operators'] if o['char_id'] == 'char_4046_ebnhlz')
        self.assertEqual(ebn_after['taken_total'], 0)
        self.assertEqual(ebn_after['remaining'], 16)


class MumuCaptureDetectionTests(unittest.TestCase):
    def test_resolve_capture_target_prioritizes_pc_and_detects_mumu_instance_launch(self):
        from electron.prts_battle_core.windows_capture import resolve_capture_target

        win = {'title': 'MuMu安卓设备-1', 'x': 100, 'y': 60, 'width': 1280, 'height': 720}
        # 1. PC Arknights.exe + MuMu running simultaneously -> must pick PC
        both_map = {101: 'arknights.exe', 202: 'mumunxdevice.exe', 203: 'mumuvmmheadless.exe'}
        self.assertEqual(resolve_capture_target(both_map, win), ('pc', {101}, None))

        # 2. MuMu 12 v5 device running with instance-name title -> picks MuMu PIDs + window bounds
        mumu_running = {202: 'MuMuNxDevice.exe', 203: 'MuMuNxMain.exe', 205: 'MuMuNxSVC.exe', 204: 'explorer.exe'}
        self.assertEqual(resolve_capture_target(mumu_running, win), ('mumu', {202, 203, 205}, win))

        # 3. MuMu emulator instance minimized (window=None) -> keeps MuMu capture alive without dropping
        self.assertEqual(resolve_capture_target(mumu_running, None), ('mumu', {202, 203, 205}, None))

        # 4. Only MuMu launcher / background services running without any emulator instance -> does NOT misdetect
        launcher_only = {203: 'MuMuNxMain.exe', 205: 'MuMuNxSVC.exe', 204: 'explorer.exe'}
        self.assertEqual(resolve_capture_target(launcher_only, None), ('none', set(), None))

        # 5. Legacy launcher process with active Stronghold traffic -> keeps MuMu capture alive
        self.assertEqual(
            resolve_capture_target(launcher_only, None, has_mumu_traffic=True),
            ('mumu', {203, 205}, None),
        )

    def test_select_best_mumu_window_prefers_arknights_title_and_falls_back_to_instance_window(self):
        from electron.prts_battle_core.windows_capture import _select_best_mumu_window

        # 1. MuMu 12 v5 tab-bar UI keeps Win32 title as `MuMu安卓设备-1` -> must match device window, not launcher hub
        picked = _select_best_mumu_window([
            ('mumunxmain.exe', 'MuMu模拟器12', 0, 0, 1440, 900),
            ('mumunxdevice.exe', 'MuMu多开器', 0, 0, 1600, 900),
            ('mumunxdevice.exe', 'MuMu安卓设备-1', 40, 80, 1280, 720),
            ('mumunxdevice.exe', '', 0, 0, 1920, 1080),
        ])
        self.assertEqual(picked, {'title': 'MuMu安卓设备-1', 'x': 40, 'y': 80, 'width': 1280, 'height': 720})

        # 2. Explicit Arknights / 明日方舟 title still wins over a larger generic instance window
        preferred = _select_best_mumu_window([
            ('mumunxdevice.exe', 'MuMu安卓设备-2', 0, 0, 1600, 900),
            ('mumuplayer.exe', '明日方舟 - MuMu模拟器12', 80, 60, 1280, 720),
        ])
        self.assertEqual(preferred, {'title': '明日方舟 - MuMu模拟器12', 'x': 80, 'y': 60, 'width': 1280, 'height': 720})

        # 3. Launcher-only window without Arknights title is ignored
        self.assertIsNone(_select_best_mumu_window([
            ('mumunxmain.exe', 'MuMu游戏中心', 0, 0, 1280, 720),
            ('mumunxdevice.exe', 'Mini', 0, 0, 200, 120),
        ]))

    def test_parse_tcp_table_filters_mumu_control_ports_and_keeps_stronghold_ports(self):
        import socket
        from electron.prts_battle_core.windows_capture import _parse_tcp_table

        def row(state: int, lip: str, lport: int, rip: str, rport: int, pid: int) -> bytes:
            return (
                struct.pack('<I4s', state, socket.inet_aton(lip))
                + struct.pack('!H2x', lport)
                + socket.inet_aton(rip)
                + struct.pack('!H2x', rport)
                + struct.pack('<I', pid)
            )

        rows = [
            row(5, '127.0.0.1', 50100, '127.0.0.1', 8443, 203),      # loopback
            row(5, '192.168.1.10', 50101, '192.168.1.10', 5037, 203), # ADB 5037
            row(5, '192.168.1.10', 50102, '192.168.1.10', 5555, 203), # ADB 5555
            row(5, '192.168.1.10', 50104, '192.168.1.10', 5557, 203), # Multi-instance ADB 5557
            row(5, '192.168.1.10', 50103, '192.168.1.10', 7555, 203), # MuMu control 7555
            row(5, '192.168.1.10', 16416, '192.168.1.10', 16384, 203), # MuMu range 16384-16500
            row(5, '10.0.2.15', 43210, '203.0.113.8', 8443, 203),    # Stronghold 8443
            row(5, '198.18.0.1', 49801, '106.14.87.204', 6101, 203), # MuMu Stronghold 6101
        ]
        buf = struct.pack('<I', len(rows)) + b''.join(rows)

        all_conns = _parse_tcp_table(buf, {203}, exclude_mumu_control=False)
        self.assertEqual(len(all_conns), 8)

        filtered = _parse_tcp_table(buf, {203}, exclude_mumu_control=True)
        self.assertEqual(filtered, {
            (('10.0.2.15', 43210), ('203.0.113.8', 8443)),
            (('198.18.0.1', 49801), ('106.14.87.204', 6101)),
        })

    def test_looks_like_stronghold_segment_defers_6101_frames_and_syn_without_https_noise(self):
        from electron.prts_battle_core.windows_capture import _looks_like_stronghold_segment

        # Port 6101 & 8443 are deferred
        self.assertTrue(_looks_like_stronghold_segment(
            Segment(0.0, ('198.18.0.1', 49801), ('106.14.87.204', 6101), b'', 1, False, True, False, False)
        ))
        self.assertTrue(_looks_like_stronghold_segment(
            Segment(0.0, ('192.0.2.1', 40001), ('192.0.2.2', 8443), b'', 1, False, True, False, False)
        ))
        # Stronghold V3_1 heartbeat / scene frame on any non-standard port is deferred
        heartbeat = struct.pack('!II', 12, 1) + bytes(12)
        self.assertTrue(_looks_like_stronghold_segment(
            Segment(0.0, ('198.18.0.1', 50000), ('198.51.100.9', 19001), heartbeat, 1, False, True, False, False)
        ))
        # Initial outbound SYN to non-web game port is deferred; HTTPS 443 SYN / TLS data is NOT deferred
        self.assertTrue(_looks_like_stronghold_segment(
            Segment(0.0, ('198.18.0.1', 50001), ('198.51.100.9', 19001), b'', 1, True, False, False, False)
        ))
        self.assertFalse(_looks_like_stronghold_segment(
            Segment(0.0, ('198.18.0.1', 50002), ('198.51.100.9', 443), b'\x16\x03\x03\x00\x20' + bytes(16), 1, False, True, False, False)
        ))
        self.assertFalse(_looks_like_stronghold_segment(
            Segment(0.0, ('198.18.0.1', 50003), ('198.51.100.9', 443), b'', 1, True, False, False, False)
        ))

    def test_segments_emits_mumu_source_callback(self):
        stopped = Event()
        sources = []
        win = {'title': 'MuMu安卓设备-1', 'x': 80, 'y': 40, 'width': 1280, 'height': 720}
        with patch('electron.prts_battle_core.windows_capture.list_process_map', return_value={202: 'mumunxdevice.exe'}), \
             patch('electron.prts_battle_core.windows_capture.find_mumu_arknights_window', return_value=win), \
             patch('electron.prts_battle_core.windows_capture.game_connections', return_value={OLD}), \
             patch('electron.prts_battle_core.windows_capture.monotonic', return_value=0.0), \
             patch('electron.prts_battle_core.windows_capture.open_receiver'), \
             patch('electron.prts_battle_core.windows_capture.select', return_value=([], [], [])), \
             redirect_stderr(io.StringIO()):
            stream = segments(stopped, lambda _: None, on_source=sources.append)
            try:
                self.assertIsNone(next(stream))
            finally:
                stream.close()
        self.assertEqual(sources, [{'client': 'mumu', 'mumuWindow': win}])

    def test_ldplayer_9_5_4_detection_priority_hub_exclusion_and_port_5554_filter(self):
        import socket
        from electron.prts_battle_core.windows_capture import (
            _is_mumu_control_port,
            _parse_tcp_table,
            _select_best_ldplayer_window,
            resolve_capture_target,
        )

        ld_win = {'title': '雷电模拟器', 'x': 120, 'y': 60, 'width': 1280, 'height': 720}
        mumu_win = {'title': 'MuMu安卓设备-1', 'x': 40, 'y': 40, 'width': 1280, 'height': 720}

        # 1. LDPlayer 9 / 5 / 4 process recognition (strictly excludes dnmultiplayer(ex).exe and ldnews.exe)
        ld9_map = {301: 'dnplayer.exe', 302: 'Ld9BoxHeadless.exe', 303: 'Ld9BoxSVC.exe', 304: 'Ld9BoxNetDHCP.exe', 305: 'dnmultiplayerex.exe', 306: 'ldnews.exe'}
        self.assertEqual(resolve_capture_target(ld9_map, None, ldplayer_window=ld_win), ('ldplayer', {301, 302, 303, 304}, ld_win))

        ld5_map = {311: 'dnplayer.exe', 312: 'LdVBoxHeadless.exe', 313: 'LdVBoxSVC.exe', 314: 'dnmultiplayer.exe'}
        self.assertEqual(resolve_capture_target(ld5_map, None, ldplayer_window=None), ('ldplayer', {311, 312, 313}, None))

        ld4_map = {321: 'dnplayer.exe', 322: 'LdBoxHeadless.exe', 323: 'LdBoxSVC.exe'}
        self.assertEqual(resolve_capture_target(ld4_map, None, ldplayer_window=ld_win), ('ldplayer', {321, 322, 323}, ld_win))

        # 2. Multi-instance launcher / news / service-only without active instance must NOT misdetect
        launcher_only = {305: 'dnmultiplayerex.exe', 306: 'ldnews.exe', 303: 'Ld9BoxSVC.exe'}
        self.assertEqual(resolve_capture_target(launcher_only, None, ldplayer_window=None), ('none', set(), None))
        self.assertEqual(
            resolve_capture_target({303: 'Ld9BoxSVC.exe'}, None, has_ldplayer_traffic=True),
            ('ldplayer', {303}, None),
        )

        # 3. Priority strictly PC > MuMu > LDPlayer > none
        all_map = {101: 'Arknights.exe', 202: 'MuMuNxDevice.exe', 301: 'dnplayer.exe', 302: 'Ld9BoxHeadless.exe'}
        self.assertEqual(resolve_capture_target(all_map, mumu_win, ldplayer_window=ld_win), ('pc', {101}, None))
        mumu_and_ld = {202: 'MuMuNxDevice.exe', 301: 'dnplayer.exe', 302: 'Ld9BoxHeadless.exe'}
        self.assertEqual(resolve_capture_target(mumu_and_ld, mumu_win, ldplayer_window=ld_win), ('mumu', {202}, mumu_win))

        # 4. _select_best_ldplayer_window excludes hubs & non-dnplayer processes, prefers Arknights title
        self.assertEqual(
            _select_best_ldplayer_window([
                ('dnmultiplayerex.exe', '雷电多开器 - 明日方舟', 0, 0, 1600, 900),
                ('ldnews.exe', '明日方舟攻略', 0, 0, 1280, 720),
                ('dnplayer.exe', '雷电多开器', 0, 0, 1400, 800),
                ('dnplayer.exe', '雷电游戏中心', 0, 0, 1400, 800),
                ('dnplayer.exe', '雷电圈', 0, 0, 1400, 800),
                ('dnplayer.exe', 'LDMultiPlayer', 0, 0, 1400, 800),
                ('dnplayer.exe', 'LDStore', 0, 0, 1400, 800),
                ('dnplayer.exe', '雷电模拟器', 120, 60, 1280, 720),
            ]),
            ld_win,
        )
        self.assertEqual(
            _select_best_ldplayer_window([
                ('dnplayer.exe', '雷电模拟器-1', 0, 0, 1600, 900),
                ('dnplayer.exe', 'LDPlayer - Arknights', 100, 50, 1280, 720),
            ]),
            {'title': 'LDPlayer - Arknights', 'x': 100, 'y': 50, 'width': 1280, 'height': 720},
        )
        self.assertIsNone(_select_best_ldplayer_window([
            ('dnmultiplayer.exe', '雷电多开器', 0, 0, 1280, 720),
            ('dnplayer.exe', '雷电游戏中心', 0, 0, 1280, 720),
            ('dnplayer.exe', 'Mini', 0, 0, 200, 150),
        ]))

        # 5. Control port 5554 (LDPlayer Console) & 5555 (ADB) filtered; game ports preserved
        self.assertTrue(_is_mumu_control_port(5554))
        self.assertTrue(_is_mumu_control_port(5555))
        self.assertTrue(_is_mumu_control_port(5556))

        def row(state: int, lip: str, lport: int, rip: str, rport: int, pid: int) -> bytes:
            return (
                struct.pack('<I4s', state, socket.inet_aton(lip))
                + struct.pack('!H2x', lport)
                + socket.inet_aton(rip)
                + struct.pack('!H2x', rport)
                + struct.pack('<I', pid)
            )

        rows = [
            row(5, '192.168.1.10', 50100, '192.168.1.10', 5554, 302), # LDPlayer console 5554
            row(5, '192.168.1.10', 50101, '192.168.1.10', 5555, 302), # LDPlayer ADB 5555
            row(5, '10.0.2.15', 43211, '203.0.113.8', 6101, 302),    # Stronghold 6101
        ]
        buf = struct.pack('<I', len(rows)) + b''.join(rows)
        self.assertEqual(
            _parse_tcp_table(buf, {302}, exclude_mumu_control=True),
            {(('10.0.2.15', 43211), ('203.0.113.8', 6101))},
        )

        # 6. segments emits ldplayer source callback with mumuWindow key
        stopped = Event()
        sources = []
        with patch('electron.prts_battle_core.windows_capture.list_process_map', return_value={301: 'dnplayer.exe'}), \
             patch('electron.prts_battle_core.windows_capture.find_ldplayer_arknights_window', return_value=ld_win), \
             patch('electron.prts_battle_core.windows_capture.game_connections', return_value={OLD}) as mock_conns, \
             patch('electron.prts_battle_core.windows_capture.monotonic', return_value=0.0), \
             patch('electron.prts_battle_core.windows_capture.open_receiver'), \
             patch('electron.prts_battle_core.windows_capture.select', return_value=([], [], [])), \
             redirect_stderr(io.StringIO()):
            stream = segments(stopped, lambda _: None, on_source=sources.append)
            try:
                self.assertIsNone(next(stream))
            finally:
                stream.close()
        self.assertEqual(sources, [{'client': 'ldplayer', 'mumuWindow': ld_win}])
        mock_conns.assert_called_with({301}, exclude_mumu_control=True)

    def test_set_shops_treats_negative_position_as_bench_not_deployed(self):
        stats = MatchStats()
        stats.set_shops([{
            'seat': 1,
            'round': 6,
            'shop_level': 4,
            'skill_id': '',
            'pieces': {1: 101, 2: 102, 3: 103},
            'positions': {1: 4, 2: -1},
            'equips': {},
            'traps': {},
            'shop': [],
        }])
        snap = stats.snapshot()
        lineup = snap['lineups'][1]
        self.assertEqual(lineup['piece_count'], 3)
        self.assertEqual(lineup['deployed_count'], 1)
        self.assertEqual([u['inst_id'] for u in lineup['deployed']], [1])
        self.assertEqual(sorted(u['inst_id'] for u in lineup['bench']), [2, 3])
        self.assertEqual(lineup['deployed'][0]['equip_ids'], [])
        self.assertEqual(lineup['bench'][0]['equip_ids'], [])

    def test_preparation_wire_extracts_piece_equips_and_emits_sanitized_bond_hex_diagnostics(self):
        from electron.prts_battle_core.wire import Message, decode_message

        def prep_frame_body(*, attached_on_gravel=(), bonds=()):
            body = bytearray()
            body += struct.pack('!BhB', 1, 25, 4)  # seat=1, hp=25, round=4
            body += struct.pack('!7B', 3, 0, 0, 0, 0, 0, 0)  # level=3 + 6 bytes
            body += struct.pack('!HB', 0, 1)  # goods=0, seq=1
            # 5 pieces: 4 deployed (砾=88, 承曦格雷伊=180, 云迹=154, 摆渡人=168) + 1 bench (180)
            pieces_data = [
                (1001, attached_on_gravel, 88),
                (1002, (), 180),
                (1003, (), 154),
                (1004, (), 168),
                (1005, (), 180),
            ]
            body += struct.pack('!H', len(pieces_data))
            for inst, eqs, cid in pieces_data:
                body += struct.pack('!i', inst) + wire_ints(eqs) + struct.pack('!HBBB', cid, 0, 0, 0)
            # equips: 1x 精准狙击镜 (inst=8001, ident=327)
            body += struct.pack('!HiH', 1, 8001, 327)
            body += struct.pack('!H', 0)  # traps
            # positions: 1001..1004 deployed (pos>=0), 1005 bench (pos=-1)
            body += struct.pack('!H', 5)
            for idx, inst in enumerate((1001, 1002, 1003, 1004)):
                body += struct.pack('!iiBB', inst, idx, 0, 0)
            body += struct.pack('!iiBB', 1005, -1, 0, 0)
            # bonds (7B each)
            body += struct.pack('!H', len(bonds))
            for b in bonds:
                body += b
            body += struct.pack('!HBH', 0, 0, 0)  # sp_prepare_after + enemies
            body += struct.pack('!HBH', 0, 0, 0)  # after_enemies
            body += struct.pack('!H', 0) + wire_text('') + bytes(13)
            return bytes(body)

        sample_bonds = (
            bytes.fromhex('00000000001100'),
            bytes.fromhex('01000000000c02'),
        )
        # 1) Unattached equip (attached_on_gravel=()) -> deployed/bench equip_ids are all []
        ev_loose = decode_message(Message(306, prep_frame_body(attached_on_gravel=(), bonds=sample_bonds), 'down'))
        shop_loose = ev_loose['shops'][0]
        self.assertEqual(shop_loose['piece_equips'], {})
        self.assertEqual(shop_loose['raw_bonds'], ['00000000001100', '01000000000c02'])

        # 2) Attached equip (8001 on 砾 1001) -> piece_equips[1001] == [8001]
        ev_equipped = decode_message(Message(306, prep_frame_body(attached_on_gravel=(8001,), bonds=sample_bonds), 'down'))
        shop_eq = ev_equipped['shops'][0]
        self.assertEqual(shop_eq['piece_equips'], {1001: [8001]})

        stats = MatchStats()
        stats.set_shops([shop_eq])
        snap = stats.snapshot()
        lineup = snap['lineups'][1]
        self.assertNotIn('raw_bonds', lineup)
        gravel = next(u for u in lineup['deployed'] if u['inst_id'] == 1001)
        greyy = next(u for u in lineup['deployed'] if u['inst_id'] == 1002)
        bench_u = lineup['bench'][0]
        self.assertEqual(gravel['equip_ids'], [8001])
        self.assertEqual(greyy['equip_ids'], [])
        self.assertEqual(bench_u['equip_ids'], [])

        # 3) collect_reports diagnostics emits PRTS_REPORT_BONDS without player names/IPs
        raw_f306 = frame(306, prep_frame_body(attached_on_gravel=(8001,), bonds=sample_bonds))
        raw_f300 = roster_frame(1, {1: 'SecretDoctorName'}, scene_round=4)
        stderr_buf = io.StringIO()
        stdout_buf = io.StringIO()
        with redirect_stderr(stderr_buf), redirect_stdout(stdout_buf):
            collect_reports([(Segment(0.0, *OLD[::-1], raw_f300 + raw_f306, 1, True, True, False, False), 'down')], Event(), lambda _: None)
        diag_text = stderr_buf.getvalue()
        self.assertIn('PRTS_REPORT_BONDS 1:00000000001100,01000000000c02', diag_text)
        self.assertNotIn('SecretDoctorName', diag_text)
        self.assertNotIn('192.0.2', diag_text)

    def test_decode_raw_bonds_extracts_server_stacks_and_active_state(self):
        from electron.prts_battle_core.stats import decode_raw_bonds

        seat1_raw = [
            '0100fc00001403',  # 不屈 active, 252 stacks, 3 ops
            '01009f00001102',  # 奇迹 active, 159 stacks, 2 ops
            '01008a00000d02',  # 灵巧 active, 138 stacks, 2 ops
            '01000000001806',  # 绝技 active, 0 stacks, 6 ops
            '00000000000b01',  # 精准 inactive, 0 stacks, 1 op
            '00000000000100',  # 炎 inactive, 0 stacks, 0 ops (omitted)
        ]
        decoded = decode_raw_bonds(seat1_raw)
        by_id = {row['bond_id']: row for row in decoded}
        self.assertEqual(by_id['indomShip'], {'bond_id': 'indomShip', 'stacks': 252, 'count': 3, 'active': True})
        self.assertEqual(by_id['miraShip'], {'bond_id': 'miraShip', 'stacks': 159, 'count': 2, 'active': True})
        self.assertEqual(by_id['skillfulShip'], {'bond_id': 'skillfulShip', 'stacks': 138, 'count': 2, 'active': True})
        self.assertEqual(by_id['suntShip'], {'bond_id': 'suntShip', 'stacks': 0, 'count': 6, 'active': True})
        self.assertEqual(by_id['preciShip'], {'bond_id': 'preciShip', 'stacks': 0, 'count': 1, 'active': False})
        self.assertNotIn('yanShip', by_id)

        seat3_raw = ['01008a00000806', '01000e00001a02', '01000a00001102', '01000000001804']
        by_id3 = {row['bond_id']: row for row in decode_raw_bonds(seat3_raw)}
        self.assertEqual(by_id3['ursusShip'], {'bond_id': 'ursusShip', 'stacks': 138, 'count': 6, 'active': True})
        self.assertEqual(by_id3['arcaneShip'], {'bond_id': 'arcaneShip', 'stacks': 14, 'count': 2, 'active': True})
        self.assertEqual(by_id3['miraShip'], {'bond_id': 'miraShip', 'stacks': 10, 'count': 2, 'active': True})
        self.assertEqual(by_id3['suntShip'], {'bond_id': 'suntShip', 'stacks': 0, 'count': 4, 'active': True})


if __name__ == '__main__':
    unittest.main()
