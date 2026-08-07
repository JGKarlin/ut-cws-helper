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
      if (Number.isInteger(day) && day >= 1 && day <= 31) factsByDay.set(day, fact);
    });

    return (Array.isArray(workdays) ? workdays : []).filter(workday => {
      const day = dayFromWorkday(workday);
      const fact = day === null ? null : factsByDay.get(day);
      if (!fact) return true;
      if (isFullDayPaidLeave(fact.rowText)) return false;
      return !fact.hasArrival || !fact.hasDeparture;
    });
  }

  return { isFullDayPaidLeave, findMissingWorkdays };
});
