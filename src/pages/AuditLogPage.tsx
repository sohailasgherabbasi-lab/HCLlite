import React, { useState, useEffect } from 'react';
import { api } from '../api/client.ts';
import { ScrollText, Search, ShieldAlert, RefreshCw, X, ChevronRight } from 'lucide-react';
import { AuditLogEntry } from '../types/index.ts';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLog({
        action: actionFilter || undefined,
        entity: entityFilter || undefined,
        search: search || undefined,
      });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, entityFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Immutable System Audit Trail</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Administrative record of create, update, approve, and finalize operations with before/after state diffs
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by actor name, entity ID, or details..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-neutral-800 dark:text-neutral-200"
        >
          <option value="">All Actions</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="APPROVE">APPROVE</option>
          <option value="REJECT">REJECT</option>
          <option value="FINALIZE">FINALIZE</option>
          <option value="DELETE">DELETE</option>
        </select>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-neutral-800 dark:text-neutral-200"
        >
          <option value="">All Entities</option>
          <option value="EMPLOYEE">EMPLOYEE</option>
          <option value="ATTENDANCE">ATTENDANCE</option>
          <option value="LEAVE">LEAVE</option>
          <option value="PAYROLL">PAYROLL</option>
          <option value="ORGANIZATION">ORGANIZATION</option>
          <option value="USER">USER</option>
        </select>

        <span className="text-xs text-neutral-400 ml-auto font-mono">
          {logs.length} Events Logged
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Summary</th>
              <th className="px-4 py-3 font-medium text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-neutral-400">
                  No audit logs matching query.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-3 font-mono text-neutral-400 tabular-nums">
                    {new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                    {log.actorName}
                    <span className="text-[10px] text-neutral-400 block">{log.actorRole}</span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-[11px] text-indigo-600 dark:text-indigo-400">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-500 text-[11px]">
                    {log.entity}
                  </td>
                  <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300 max-w-sm truncate">
                    {log.details}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold cursor-pointer"
                    >
                      JSON Diff
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* JSON Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-indigo-500" />
                <span>Audit Entry: {selectedLog.action} {selectedLog.entity}</span>
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs font-mono space-y-1 bg-neutral-50 dark:bg-neutral-800 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <div><strong>Log ID:</strong> {selectedLog.id}</div>
              <div><strong>Actor:</strong> {selectedLog.actorName} ({selectedLog.actorRole})</div>
              <div><strong>IP:</strong> {selectedLog.ip || '127.0.0.1'}</div>
              <div><strong>Timestamp:</strong> {selectedLog.createdAt}</div>
              <div><strong>Details:</strong> {selectedLog.details}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="font-sans font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  Before State
                </span>
                <pre className="p-3 bg-neutral-950 text-neutral-300 rounded-xl overflow-x-auto text-[11px] max-h-60 border border-neutral-800">
                  {selectedLog.beforeState ? JSON.stringify(selectedLog.beforeState, null, 2) : 'null'}
                </pre>
              </div>

              <div>
                <span className="font-sans font-semibold text-neutral-700 dark:text-neutral-300 block mb-1">
                  After State
                </span>
                <pre className="p-3 bg-neutral-950 text-emerald-400 rounded-xl overflow-x-auto text-[11px] max-h-60 border border-neutral-800">
                  {selectedLog.afterState ? JSON.stringify(selectedLog.afterState, null, 2) : 'null'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
