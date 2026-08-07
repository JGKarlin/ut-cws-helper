(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HRStatusModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

  function monthIndex(month) {
    const match = MONTH_PATTERN.exec(String(month || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const number = Number(match[2]);
    if (number < 1 || number > 12) return null;
    return year * 12 + number - 1;
  }

  function monthFromIndex(index) {
    const year = Math.floor(index / 12);
    const month = index % 12 + 1;
    return year + '-' + String(month).padStart(2, '0');
  }

  function monthMinus(month, amount) {
    const index = monthIndex(month);
    return index === null ? null : monthFromIndex(index - amount);
  }

  function monthEntries(months) {
    if (Array.isArray(months)) {
      return months.filter(entry => entry && entry.month).map(entry => [entry.month, entry]);
    }
    if (!months || typeof months !== 'object') return [];
    return Object.keys(months)
      .filter(month => months[month] && (months[month].month || month))
      .map(month => [month, Object.assign({ month }, months[month])]);
  }

  function stateFromLiveEntry(entry, autoSubmitEnabled) {
    const value = entry || {};
    const approval = String(value.approval || '').toLowerCase();
    if (approval === 'approved' || approval === 'final' || approval === 'complete') return 'approved';
    if (approval === 'returned' || approval === 'rejected') return 'returned';
    if (value.submitted === true && (approval === 'pending' || approval === 'none' || !approval)) {
      return 'submitted-pending';
    }
    if (approval === 'pending') return 'submitted-pending';
    if (value.submittable === true) return autoSubmitEnabled === false ? 'ready' : 'ready-auto';
    return 'not-eligible';
  }

  function stateFromEntry(entry, autoSubmitEnabled) {
    return stateFromLiveEntry(entry, autoSubmitEnabled);
  }

  function hasAuthoritativeLiveStatus(entry) {
    const value = entry || {};
    if (value.stale === true || value.staleFallback === true || value.fresh === false || value.source === 'stale') return false;
    if (value.fresh === true || value.source === 'live') return true;
    const approval = String(value.approval || '').toLowerCase();
    return value.submitted === true || (approval !== '' && approval !== 'none');
  }

  function isSubmittedOrFinalState(state) {
    return state === 'submitted-pending' || state === 'approved' || state === 'returned';
  }

  function markMonthsStale(months) {
    if (Array.isArray(months)) {
      return months.filter(entry => entry && entry.month).map(entry => Object.assign({}, entry, {
        stale: true,
        staleFallback: true,
        fresh: false,
        source: 'stale'
      }));
    }
    if (!months || typeof months !== 'object') return {};
    return Object.keys(months).reduce((result, month) => {
      const entry = months[month];
      if (entry) {
        result[month] = Object.assign({}, entry, {
          month: entry.month || month,
          stale: true,
          staleFallback: true,
          fresh: false,
          source: 'stale'
        });
      }
      return result;
    }, {});
  }

  function formatMonthLabel(month) {
    const match = MONTH_PATTERN.exec(String(month || ''));
    return match ? match[1] + '年' + Number(match[2]) + '月' : String(month || '');
  }

  function messageForState(month, state, pending, userAction) {
    const label = formatMonthLabel(month) + '分';
    const previous = pending && pending.targetMonth === month && pending.prevMonth
      ? formatMonthLabel(pending.prevMonth) + '分' : '';
    switch (state) {
      case 'submitted-pending': return label + '：提出済み（承認待ち）';
      case 'approved': return label + '：最終承認済みです。';
      case 'returned': return label + '：差戻しです。自動処理を確認中です。';
      case 'waiting-approval': return previous
        ? label + '：' + previous + 'の承認待ち。承認後に自動申請します。'
        : label + '：前月の承認待ち。承認後に自動申請します。';
      case 'processing': return label + '：自動申請を処理中です。';
      case 'ready-auto': return label + '：自動申請の準備ができました。';
      case 'ready': return label + '：申請の準備ができました。';
      case 'user-action-required': return label + '：' + ((userAction && userAction.message) || '確認が必要です。');
      default: return label + '：申請対象外です。';
    }
  }

  function referenceMonths(input) {
    const references = [];
    if (input && input.pending) {
      if (input.pending.targetMonth) references.push(input.pending.targetMonth);
      if (input.pending.prevMonth) references.push(input.pending.prevMonth);
    }
    if (input && input.activeRun && input.activeRun.month) references.push(input.activeRun.month);
    if (input && input.userAction && input.userAction.month) references.push(input.userAction.month);
    return references;
  }

  function isBlockedByPreviousApproval(pending, entries, month, state) {
    const explicitPending = pending.targetMonth === month && pending.prevMonth && pending.prevMonth !== month;
    const readyForAutomaticSubmission = state === 'ready-auto' || state === 'ready';
    if (!explicitPending && !readyForAutomaticSubmission) return false;
    const previousMonth = explicitPending ? pending.prevMonth : monthMinus(month, 1);
    const previous = entries.get(previousMonth);
    if (!previous) return explicitPending;
    if (!explicitPending && !hasAuthoritativeLiveStatus(previous)) return false;
    const approval = String(previous && previous.approval || '').toLowerCase();
    return approval !== 'approved' && approval !== 'final' && approval !== 'complete';
  }

  function buildMonthRows(input) {
    const options = input || {};
    const autoSubmitEnabled = options.autoSubmitEnabled !== false;
    const entries = new Map(monthEntries(options.months));
    const currentIndex = monthIndex(options.currentMonth);
    const oldestIndex = currentIndex === null ? null : currentIndex - 11;
    if (oldestIndex !== null) {
      Array.from(entries.keys()).forEach(month => {
        const index = monthIndex(month);
        if (index !== null && (index < oldestIndex || index > currentIndex)) entries.delete(month);
      });
    }
    referenceMonths(options).forEach(month => {
      const index = monthIndex(month);
      if (index === null || oldestIndex === null || (index >= oldestIndex && index <= currentIndex)) {
        if (!entries.has(month)) entries.set(month, { month });
      }
    });

    const pending = options.pending || {};
    const activeRun = options.activeRun || {};
    const userAction = options.userAction || {};
    const rows = Array.from(entries.values()).map(entry => {
      const month = entry.month;
      let state = stateFromEntry(entry, autoSubmitEnabled);
      const persistedMayOverride = !hasAuthoritativeLiveStatus(entry);

      if (persistedMayOverride && userAction.month === month) {
        state = 'user-action-required';
      } else if (persistedMayOverride && activeRun.month === month && activeRun.state !== 'completed' && activeRun.state !== 'failed') {
        state = 'processing';
      } else if (isBlockedByPreviousApproval(pending, entries, month, state) && !isSubmittedOrFinalState(state)) {
        state = 'waiting-approval';
      }

      const row = Object.assign({}, entry, {
        month,
        state,
        message: messageForState(month, state, pending, userAction)
      });
      if (state === 'user-action-required') {
        row.actionMonth = month;
        row.actionMessage = userAction.message || '';
      }
      return row;
    });

    return rows.sort((left, right) => {
      const leftIndex = monthIndex(left.month);
      const rightIndex = monthIndex(right.month);
      if (leftIndex === null && rightIndex === null) return String(right.month).localeCompare(String(left.month));
      if (leftIndex === null) return 1;
      if (rightIndex === null) return -1;
      return rightIndex - leftIndex;
    });
  }

  function eventTypeForState(state) {
    switch (state) {
      case 'submitted-pending': return 'submitted';
      case 'approved': return 'approved';
      case 'returned': return 'returned';
      case 'waiting-approval': return 'waiting-approval';
      case 'processing': return 'processing';
      case 'ready-auto':
      case 'ready': return 'ready';
      case 'user-action-required': return 'action-required';
      case 'failed': return 'failed';
      default: return 'state-changed';
    }
  }

  function statusEventsFromSnapshot(previous, next, observedAt) {
    const before = new Map(monthEntries(previous));
    const after = new Map(monthEntries(next));
    const months = new Set(Array.from(before.keys()).concat(Array.from(after.keys())));
    return Array.from(months).sort().reduce((events, month) => {
      const previousState = before.has(month) ? stateFromEntry(before.get(month), true) : null;
      const nextEntry = after.get(month);
      if (!nextEntry) return events;
      const nextState = stateFromEntry(nextEntry, true);
      if (previousState !== nextState) {
        events.push({
          id: month + ':' + eventTypeForState(nextState) + ':' + nextState,
          month,
          type: eventTypeForState(nextState),
          state: nextState,
          at: observedAt
        });
      }
      return events;
    }, []);
  }

  function appendHistoryEvent(history, event, currentMonth) {
    const source = Array.isArray(history) ? history : [];
    const candidate = Object.assign({}, event || {});
    if (!candidate.month || !candidate.type || !candidate.state) return source.slice();
    candidate.id = candidate.month + ':' + candidate.type + ':' + candidate.state;
    const result = source.map(item => {
      if (!item || typeof item !== 'object') return item;
      if (item.month && item.type && item.state) {
        return Object.assign({}, item, { id: item.month + ':' + item.type + ':' + item.state });
      }
      return item;
    });
    if (!result.some(item => item && item.id === candidate.id)) result.push(candidate);

    const oldest = monthMinus(currentMonth, 11);
    if (oldest === null) return result;
    const oldestIndex = monthIndex(oldest);
    return result.filter(item => {
      const itemIndex = monthIndex(item && item.month);
      return itemIndex !== null && itemIndex >= oldestIndex && itemIndex <= monthIndex(currentMonth);
    });
  }

  function classifyBackgroundOutcome(month, progress) {
    const value = progress || {};
    if (value.retryable) return { completed: false, retryable: true, userAction: null };
    if (value.error || value.timeout) {
      return {
        completed: false,
        userAction: {
          month,
          message: value.message || (value.timeout ? '自動申請が時間内に完了しませんでした。' : '自動申請を完了できませんでした。')
        }
      };
    }
    if (value.waitingApproval || value.done) return { completed: true, userAction: null };
    return { completed: false, userAction: null };
  }

  function planBackgroundRun(existingRun, now, timeoutMs) {
    const startedAt = Number(existingRun && existingRun.startedAt || 0);
    const active = !!(existingRun && existingRun.month && startedAt > 0 && now - startedAt < timeoutMs);
    return {
      start: !active,
      ownsRun: !active,
      staleMonth: active || !existingRun || !existingRun.month ? null : existingRun.month
    };
  }

  return {
    buildMonthRows,
    statusEventsFromSnapshot,
    appendHistoryEvent,
    markMonthsStale,
    classifyBackgroundOutcome,
    planBackgroundRun
  };
});
