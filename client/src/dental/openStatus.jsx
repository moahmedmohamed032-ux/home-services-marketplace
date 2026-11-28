// Working / closed / on-leave marker for clinics and hospitals. Set by an admin only; nothing is inferred, and "not stated" shows nothing.
export const OPEN_STATUS_AR = { working: 'شغّالة', closed: 'مغلقة', leave: 'في إجازة' };
const CLS = { working: 'text-bg-success', closed: 'text-bg-danger', leave: 'text-bg-warning' };

export function OpenStatusBadge({ status, at }) {
  if (!OPEN_STATUS_AR[status]) return null;
  const day = at ? new Date(at).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium' }) : '';
  return <span className={`badge ${CLS[status]} me-1`} title={day ? `آخر تحديث من الإدارة: ${day}` : 'حالة محدّثة من الإدارة'}>{OPEN_STATUS_AR[status]}{day ? ` · ${day}` : ''}</span>;
}

export function OpenStatusSelect({ value, onChange }) {
  return (
    <select className="form-select form-select-sm d-inline-block w-auto" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="حالة العمل">
      <option value="">الحالة: غير محدد</option>
      {Object.entries(OPEN_STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
