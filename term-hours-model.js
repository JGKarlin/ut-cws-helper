(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HRTermHours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeRowText(rowText) {
    return String(rowText == null ? '' : rowText)
      .normalize('NFKC')
      .replace(/\s+/g, '');
  }

  function isFullDayPaidLeave(rowText) {
    const text = normalizeRowText(rowText);
    if (!text.includes('全日')) return false;
    return text.includes('年休(日)') || text.includes('年次有給休暇');
  }

  function dayFromWorkday(workday) {
    const match = String(workday == null ? '' : workday).match(/(?:^|-)(\d{1,2})$/);
    return match ? Number(match[1]) : null;
  }

  function findMissingWorkdays(workdays, rowFacts) {
    const factsByDay = new Map();
    (Array.isArray(rowFacts) ? rowFacts : []).forEach(fact => {
      if (!fact || fact.day == null) return;
      const day = Number(fact.day);
      if (!Number.isInteger(day) || day < 1 || day > 31) return;
      const facts = factsByDay.get(day) || [];
      facts.push(fact);
      factsByDay.set(day, facts);
    });

    return (Array.isArray(workdays) ? workdays : []).filter(workday => {
      const day = dayFromWorkday(workday);
      const facts = day === null ? [] : (factsByDay.get(day) || []);
      if (!facts.length) return true;
      if (facts.some(fact => isFullDayPaidLeave(fact.rowText))) return false;
      if (facts.some(fact => fact.hasArrival && fact.hasDeparture)) return false;
      return true;
    });
  }

  function findScheduledWorkdays(monthKey, rowFacts, cutoffDate) {
    if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return [];
    const [year, month] = String(monthKey).split('-').map(Number);
    if (month < 1 || month > 12) return [];
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDate || ''))
      ? String(cutoffDate)
      : null;
    const dates = new Set();

    (Array.isArray(rowFacts) ? rowFacts : []).forEach(fact => {
      if (!fact || fact.day == null) return;
      const day = Number(fact.day);
      if (!Number.isInteger(day) || day < 1 || day > 31) return;
      const classes = String(fact.dayClass || '').split(/\s+/).filter(Boolean);
      if (!classes.includes('mg_normal')) return;
      const calendarDate = new Date(year, month - 1, day);
      if (calendarDate.getFullYear() !== year || calendarDate.getMonth() !== month - 1 || calendarDate.getDate() !== day) return;
      const date = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (!cutoff || date <= cutoff) dates.add(date);
    });

    return Array.from(dates).sort();
  }

  return { isFullDayPaidLeave, findMissingWorkdays, findScheduledWorkdays };
});
