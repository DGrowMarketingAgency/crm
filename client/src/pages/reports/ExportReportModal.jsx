import React, { useState } from 'react';
import { reportsService } from '../../services/api';
import {
  Download,
  X,
  FileSpreadsheet,
  FileText,
  Calendar,
  AlertCircle,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export function ExportReportModal({ isOpen, onClose, initialReportType = 'projects', dateRange = {} }) {
  const [reportType, setReportType] = useState(initialReportType);
  const [format, setFormat] = useState('xlsx'); // 'xlsx' | 'csv'
  const [period, setPeriod] = useState(dateRange.period || 'last_30_days');
  const [startDate, setStartDate] = useState(dateRange.startDate || '');
  const [endDate, setEndDate] = useState(dateRange.endDate || '');

  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleExport = async (e) => {
    e.preventDefault();
    setIsExporting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        reportType,
        format,
        period: period !== 'custom' ? period : undefined,
        startDate: period === 'custom' ? startDate : undefined,
        endDate: period === 'custom' ? endDate : undefined
      };

      const res = await reportsService.exportReport(payload);

      // Trigger browser download from blob
      const blob = new Blob([res.data], {
        type:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `agency_${reportType}_report_${new Date().toISOString().slice(0, 10)}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('Report generated and downloaded successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Export error:', err);
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Failed to generate export. You may lack permission for this report.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Export Report Data</h3>
              <p className="text-xs text-slate-500">
                Generate secure CSV or Excel spreadsheet files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleExport} className="space-y-4">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Select Report Dataset
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
            >
              <option value="projects">Projects Performance & Progress</option>
              <option value="tasks">Task Execution & Assignees</option>
              <option value="overdue_tasks">Overdue Tasks Report</option>
              <option value="teams">Team Workloads & Sprints</option>
              <option value="project_hours">Project Hours Breakdown</option>
              <option value="employee_hours">Employee Work Hours</option>
              <option value="clients">Client Project Overview</option>
            </select>
          </div>

          {/* Export Format */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              File Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('xlsx')}
                className={`p-3 rounded-xl border flex items-center gap-2.5 transition text-xs font-bold ${
                  format === 'xlsx'
                    ? 'border-brand-700 bg-brand-50 text-brand-900 shadow-xs ring-1 ring-brand-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className={`w-5 h-5 ${format === 'xlsx' ? 'text-brand-700' : 'text-slate-600'}`} />
                <div className="text-left">
                  <span>Excel (.xlsx)</span>
                  <p className="text-[10px] font-normal text-slate-400">Formatted spreadsheet</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3 rounded-xl border flex items-center gap-2.5 transition text-xs font-bold ${
                  format === 'csv'
                    ? 'border-brand-700 bg-brand-50 text-brand-900 shadow-xs ring-1 ring-brand-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className={`w-5 h-5 ${format === 'csv' ? 'text-brand-700' : 'text-slate-600'}`} />
                <div className="text-left">
                  <span>CSV (.csv)</span>
                  <p className="text-[10px] font-normal text-slate-400">Raw tabular data</p>
                </div>
              </button>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Reporting Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
            >
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="previous_month">Previous Month</option>
              <option value="custom">Custom Date Range</option>
            </select>

            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-700"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
            Exported data is protected with spreadsheet formula injection mitigation.
            Export activity is logged for audit compliance.
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-xs transition disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Export...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download {format.toUpperCase()}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
