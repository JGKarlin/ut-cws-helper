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
    if (values.some(t => t === '勤務表') && values.some(t => t === '就労申請')) return 'work-menu-unavailable';
    if (values.some(t => t.includes('就労メインページ') || t.includes('本人用メニュー') || t.includes('メインページ'))) return 'menu';
    if (values.some(t => t === '就労管理')) return 'work';
    return 'main';
  }

  function matchesApplicationLink(phase, label, href) {
    const text = String(label || '').replace(/\s+/g, '');
    const url = String(href || '');
    if (text.includes('取消')) return false;
    const spec = phase === 'clockin'
      ? { label: '自己申告記録（出勤）', route: 'srw_app_gi02' }
      : phase === 'clockout'
        ? { label: '自己申告記録（退勤）', route: 'srw_app_gi03' }
        : { label: '勤務外時間数', route: 'srw_app_gi07' };
    return text.includes(spec.label) && url.includes(spec.route);
  }

  return { chooseWorkdayNavigationAction, matchesApplicationLink };
});
