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


def roster_frame(self_seat, players):
    body = b''.join(wire_text(value) for value in ('mode_multi_hard', 'synthetic', '', ''))
    body += struct.pack('!iBHH', 42, self_seat, 0, len(players))
    for seat, label in players.items():
        body += struct.pack('!HbHH', 0, seat, 0, 0) + wire_text(label) + bytes(22)
    body += struct.pack('!bBBq', 0, 1, 0, 0) + bytes(24)
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


if __name__ == '__main__':
    unittest.main()
