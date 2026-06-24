import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import api from '../../../shared/api/client';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', page, action, entityType],
    queryFn: () => api.get('/admin/audit-logs', {
      params: { page, limit: 30, action: action || undefined, entityType: entityType || undefined },
    }).then(r => r.data),
  });

  const logs = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pages = Math.ceil(total / 30);

  const entityTypes = [...new Set(logs.map(l => l.entity_type).filter(Boolean))];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-white">Audit Logs</h1>
        <p className="text-gray-400 text-sm mt-1">{total} total events</p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
            placeholder="Filter by action…" className="input pl-9 py-2 text-sm" />
        </div>
        <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }}
          className="input py-2 text-sm w-auto">
          <option value="">All types</option>
          {entityTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No audit logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Action</th>
                  <th className="text-left px-5 py-3 font-medium">Actor</th>
                  <th className="text-left px-5 py-3 font-medium">Entity</th>
                  <th className="text-left px-5 py-3 font-medium">Time</th>
                  <th className="text-right px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-white/[0.01]">
                      <td className="px-5 py-3">
                        <span className="badge badge-blue text-xs font-mono">{log.action}</span>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-white text-xs">{log.actor_name || 'System'}</p>
                        {log.actor_email && <p className="text-gray-500 text-[11px]">{log.actor_email}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-xs text-gray-400">
                          {log.entity_type}{log.entity_id ? ` (${log.entity_id.slice(0, 8)}…)` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {(log.before_data || log.after_data) && (
                          <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-blue-400">
                            <Eye size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr>
                        <td colSpan={5} className="px-5 py-3 bg-white/[0.02]">
                          <div className="grid grid-cols-2 gap-4">
                            {log.before_data && (
                              <div>
                                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Before</p>
                                <pre className="text-xs text-gray-400 bg-black/30 rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(log.before_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.after_data && (
                              <div>
                                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">After</p>
                                <pre className="text-xs text-gray-400 bg-black/30 rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(log.after_data, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                          {log.ip_address && (
                            <p className="text-[11px] text-gray-600 mt-2">IP: {log.ip_address}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="btn-ghost p-2 rounded-lg disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-sm text-gray-400">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            className="btn-ghost p-2 rounded-lg disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
