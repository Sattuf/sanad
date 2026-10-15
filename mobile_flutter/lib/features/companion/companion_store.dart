import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../content/content_repository.dart';
import '../../content/models.dart';

/// يُحقن في main بعد التحميل (ولا يُستدعى قبله).
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('prefsProvider'));
final contentProvider = Provider<ContentRepository>((ref) => throw UnimplementedError('contentProvider'));

/// «اليوم» قابل للحقن في الاختبارات.
final todayProvider = Provider<String>((ref) => localDay());

/*
  تقدّم برامج الالتزام — على الجهاز فقط، بنفس مفتاح وصيغة الويب (sanad.companion.v1 في stores/companion.ts).
  لا «سلسلة» تنكسر ولا لوم: الأيام الفائتة تبقى مفتوحة، ونعدّ «أيام الالتزام».
*/
const _key = 'sanad.companion.v1';

class CompanionState {
  const CompanionState({this.activeProgramId, this.startedOn, this.done = const {}, this.activeDays = const {}, this.finished = const []});

  factory CompanionState.fromJson(Map<String, dynamic> j) => CompanionState(
        activeProgramId: j['activeProgramId'] as String?,
        startedOn: j['startedOn'] as String?,
        done: ((j['done'] as Map?) ?? const {}).keys.cast<String>().toSet(),
        activeDays: ((j['activeDays'] as Map?) ?? const {}).keys.cast<String>().toSet(),
        finished: ((j['finished'] as List?) ?? const []).cast<String>(),
      );

  final String? activeProgramId;
  final String? startedOn;
  final Set<String> done;
  final Set<String> activeDays;
  final List<String> finished;

  Map<String, dynamic> toJson() => {
        'activeProgramId': activeProgramId,
        'startedOn': startedOn,
        'done': {for (final k in done) k: true},
        'activeDays': {for (final k in activeDays) k: true},
        'finished': finished,
      };

  CompanionState copyWith({String? Function()? activeProgramId, String? Function()? startedOn, Set<String>? done, Set<String>? activeDays, List<String>? finished}) =>
      CompanionState(
        activeProgramId: activeProgramId != null ? activeProgramId() : this.activeProgramId,
        startedOn: startedOn != null ? startedOn() : this.startedOn,
        done: done ?? this.done,
        activeDays: activeDays ?? this.activeDays,
        finished: finished ?? this.finished,
      );
}

class CompanionNotifier extends Notifier<CompanionState> {
  SharedPreferences get _prefs => ref.read(prefsProvider);

  @override
  CompanionState build() {
    final raw = _prefs.getString(_key);
    if (raw == null) return const CompanionState();
    try {
      return CompanionState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const CompanionState();
    }
  }

  void _save(CompanionState s) {
    state = s;
    _prefs.setString(_key, jsonEncode(s.toJson()));
  }

  void start(String programId) => _save(state.copyWith(activeProgramId: () => programId, startedOn: () => ref.read(todayProvider)));

  void toggle(int day, String taskId) {
    final id = state.activeProgramId;
    if (id == null) return;
    final key = '$id:$day:$taskId';
    final done = {...state.done};
    final checked = done.add(key);
    if (!checked) done.remove(key);
    _save(state.copyWith(done: done, activeDays: checked ? {...state.activeDays, ref.read(todayProvider)} : state.activeDays));
  }

  void finish() {
    final id = state.activeProgramId;
    if (id == null) return;
    _save(state.copyWith(finished: {...state.finished, id}.toList(), activeProgramId: () => null, startedOn: () => null));
  }
}

final companionProvider = NotifierProvider<CompanionNotifier, CompanionState>(CompanionNotifier.new);

({int total, int completed, double ratio}) dayProgress(String programId, ProgramDay day, Set<String> done) {
  final total = day.tasks.length;
  final completed = day.tasks.where((t) => done.contains('$programId:${day.day}:${t.id}')).length;
  return (total: total, completed: completed, ratio: total == 0 ? 0 : completed / total);
}

({double ratio, int daysComplete}) programProgress(Program p, Set<String> done) {
  var total = 0, completed = 0, daysComplete = 0;
  for (final d in p.plan) {
    final r = dayProgress(p.id, d, done);
    total += r.total;
    completed += r.completed;
    if (r.total > 0 && r.completed == r.total) daysComplete++;
  }
  return (ratio: total == 0 ? 0 : completed / total, daysComplete: daysComplete);
}
