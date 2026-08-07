(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HRNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function chooseWorkdayNavigationAction(labels, isCalendarPage) {
    if (isCalendarPage) return 'ready';
    const values = Array.isArray(labels) ? labels : [];
    if (values.some(t => t.includes('本人用実績入力'))) return 'input';
    if (values.some(t => t.includes('本人用実績') && !t.includes('本人用実績入力'))) return 'performance';
    if (values.some(t => t.includes('就労メインページ') || t.includes('本人用メニュー') || t.includes('メインページ'))) return 'menu';
    if (values.some(t => t === '就労管理')) return 'work';
    return 'main';
  }
  return { chooseWorkdayNavigationAction };
});
