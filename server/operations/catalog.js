import { conditions } from '../../src/domain/operations.js';
export { conditions } from '../../src/domain/operations.js';
export function incidentNotice(row, state) {
  const condition = conditions[row.code];
  return {
    event: 'operational_alert',
    heading: state === 'resolved' ? 'Operational incident recovered' : condition.title,
    body: state === 'resolved' ? 'The monitored condition has recovered. Review the admin operations dashboard for history.' : condition.body,
    reference: row._id,
    language:process.env.OPERATIONS_ALERT_LANGUAGE==='hi'?'hi':'en',
    fields: [...(row.source ? [['App instance', row.source]] : []), ['Severity',condition.severity],['Incident', condition.title], ['Status', state], ['Affected records', String(row.count || 1)], ['Updated at', new Date().toISOString()]]
  };
}
export const alertView = row => Object.fromEntries(['_id', 'code', 'severity', 'status', 'count', 'episode', 'revision', 'firstSeen', 'lastSeen', 'resolvedAt', 'acknowledgedAt', 'acknowledgedBy', 'source'].filter(key => row?.[key] !== undefined).map(key => [key, row[key]]));
