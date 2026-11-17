import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Save, Send } from 'lucide-react';
import { financeService } from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import { Breadcrumbs, PageState, errorMessage, inputCls, btnPrimary, btnSecondary } from '../project-flow/flowUi';
import { ClientGstModal } from './ClientGstModal';
import { calculateInvoice, amountInWords, inr, todayLocal, addDays, INVOICE_TYPES, GST_RATES } from './gstMath';

const blankLine = () => ({ key: Math.random().toString(36).slice(2), serviceId: '', description: '', details: '', sacCode: '', quantity: 1, unitPrice: '', discountAmount: '', gstRate: 18 });

export function InvoiceBuilderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hasPermission, isOwner } = usePermission();
  const canIssue = isOwner || hasPermission('invoices.issue');

  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('INV');
  const [clientId, setClientId] = useState(params.get('clientId') || '');
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [projects, setProjects] = useState([]);
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  const [placeCode, setPlaceCode] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [editingClient, setEditingClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await financeService.getLookups();
        setLookups(res.data);
        if (id) {
          const inv = (await financeService.getInvoice(id)).data;
          if (inv.invoice.status !== 'draft') {
            navigate(`/finance/invoices/${id}`, { replace: true });
            return;
          }
          const i = inv.invoice;
          setType(i.invoice_type || 'INV');
          setClientId(String(i.client_id));
          setProjectId(i.project_id ? String(i.project_id) : '');
          setInvoiceDate(String(i.invoice_date).slice(0, 10));
          setDueDate(String(i.due_date).slice(0, 10));
          setDueTouched(true);
          setPlaceCode(i.place_state_code || '');
          setPaymentTerms(i.payment_terms || '');
          setNotes(i.notes || '');
          setLines(inv.items.map((it) => ({
            key: String(it.id), serviceId: it.service_master_id ? String(it.service_master_id) : '', description: it.item_description,
            details: it.details || '', sacCode: it.sac_code || '', quantity: Number(it.quantity), unitPrice: Number(it.unit_price),
            discountAmount: Number(it.discount_amount) || '', gstRate: Number(it.tax_rate)
          })));
        }
      } catch (err) {
        setError(errorMessage(err, 'Could not load the invoice form'));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate]);

  const client = useMemo(() => lookups?.clients.find((c) => String(c.id) === String(clientId)) || null, [lookups, clientId]);
  const settings = lookups?.settings;
  const termsDays = client?.payment_terms_days ?? settings?.default_payment_terms_days ?? 7;

  // Client change: default place of supply to the client's state and load their projects.
  useEffect(() => {
    if (!clientId || !lookups) return;
    if (!id || placeCode === '') setPlaceCode(client?.state_code || settings?.state_code || '');
    financeService.getClientProjects(clientId).then((r) => setProjects(r.data.projects)).catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, lookups]);

  useEffect(() => {
    if (!dueTouched && invoiceDate) setDueDate(addDays(invoiceDate, termsDays));
  }, [invoiceDate, termsDays, dueTouched]);

  const calc = useMemo(
    () => calculateInvoice({ invoiceType: type, placeStateCode: placeCode || settings?.state_code, agencyStateCode: settings?.state_code, items: lines }),
    [type, placeCode, settings, lines]
  );

  const updateLine = (i, patch) => setLines((p) => p.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickService = (i, sid) => {
    const s = lookups.services.find((x) => String(x.id) === sid);
    updateLine(i, s
      ? { serviceId: sid, description: s.name, sacCode: s.sac_code || '', gstRate: s.gst_rate, unitPrice: s.default_rate ?? lines[i].unitPrice, details: s.billing_details || lines[i].details }
      : { serviceId: '' });
  };

  const submit = async (issue) => {
    setSaveError('');
    if (!clientId) return setSaveError('Choose a client');
    if (lines.some((l) => !l.description.trim())) return setSaveError('Every line needs a service name');
    if (type === 'INC' && !client?.gstin) return setSaveError('INC invoices need the client\'s GSTIN — add it with “Edit GST details”.');
    if (issue && !window.confirm(`Save and issue this ${type} invoice to ${client?.name || 'the client'}? It gets the next ${type} number and can no longer be edited — only cancelled with a credit note.`)) return;
    const payload = {
      invoiceType: type,
      clientId: Number(clientId),
      projectId: projectId ? Number(projectId) : null,
      invoiceDate,
      dueDate,
      placeStateCode: placeCode || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      issue,
      items: lines.map((l) => ({
        serviceId: l.serviceId ? Number(l.serviceId) : null,
        description: l.description,
        details: l.details || null,
        sacCode: l.sacCode || null,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice || 0),
        discountAmount: Number(l.discountAmount || 0),
        gstRate: type === 'IND' ? 0 : Number(l.gstRate)
      }))
    };
    setSaving(true);
    try {
      const res = id ? await financeService.updateInvoice(id, payload) : await financeService.createInvoice(payload);
      navigate(`/finance/invoices/${res.data.invoice.id}`);
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save the invoice'));
    } finally {
      setSaving(false);
    }
  };

  const placeName = lookups?.states.find((s) => s.code === (placeCode || settings?.state_code))?.name;

  return (
    <div className="space-y-6 max-w-6xl">
      <Breadcrumbs items={[{ label: 'GST Invoices', to: '/finance/invoices' }, { label: id ? 'Edit draft' : 'New invoice' }]} />
      <h1 className="text-2xl font-black text-slate-900">{id ? 'Edit draft invoice' : 'New GST invoice'}</h1>
      <PageState loading={loading} error={error}>
        {lookups && (
          <>
            {!settings?.gstin && type !== 'IND' && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm font-semibold text-amber-800">
                The agency GSTIN is not set yet, so tax invoices will print without it. Add it in Finance Settings.
              </div>
            )}

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">1 · Invoice type & dates</h2>
              <div className="grid md:grid-cols-3 gap-2">
                {Object.entries(INVOICE_TYPES).map(([k, t]) => (
                  <button key={k} type="button" onClick={() => { setType(k); setSaveError(''); }}
                    className={`text-left rounded-xl border-2 p-3 ${type === k ? 'border-red-500 bg-red-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="font-bold text-sm text-slate-900">{k} · {t.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.hint}</div>
                  </button>
                ))}
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <label className="block"><span className="text-xs font-bold text-slate-600">Invoice date</span>
                  <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
                <label className="block"><span className="text-xs font-bold text-slate-600">Due date</span>
                  <input type="date" className={inputCls} value={dueDate} min={invoiceDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
                  <span className="text-[11px] text-slate-400">{dueTouched ? 'Set manually' : `${termsDays} days from invoice date`}</span></label>
                <label className="block md:col-span-2"><span className="text-xs font-bold text-slate-600">Payment terms (printed)</span>
                  <input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder={`Due within ${termsDays} days`} /></label>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">2 · Client & place of supply</h2>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="block"><span className="text-xs font-bold text-slate-600">Client *</span>
                  <select className={inputCls} value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId(''); setPlaceCode(''); }}>
                    <option value="">— Select client —</option>
                    {lookups.clients.map((c) => <option key={c.id} value={c.id}>{c.company_name || c.name}{c.gstin ? ` · ${c.gstin}` : ''}</option>)}
                  </select></label>
                <label className="block"><span className="text-xs font-bold text-slate-600">Place of supply</span>
                  <select className={inputCls} value={placeCode || settings.state_code} onChange={(e) => setPlaceCode(e.target.value)}>
                    {lookups.states.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                  </select>
                  <span className="text-[11px] text-slate-400">{type === 'IND' ? 'No tax on non-GST invoices' : calc.intra ? `Same state as agency → CGST + SGST` : `Other state → IGST`}</span></label>
                <label className="block"><span className="text-xs font-bold text-slate-600">Project (optional)</span>
                  <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
                    <option value="">— Not linked —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></label>
              </div>
              {client && (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span><b>GSTIN:</b> {client.gstin || 'Unregistered'}</span>
                  <span><b>State:</b> {client.state ? `${client.state} (${client.state_code})` : 'Not set'}</span>
                  <span><b>Terms:</b> {client.payment_terms_days != null ? `${client.payment_terms_days} days` : 'Agency default'}</span>
                  <button type="button" className="inline-flex items-center gap-1 font-bold text-red-600 hover:underline" onClick={() => setEditingClient(client)}>
                    <Pencil className="w-3 h-3" /> Edit GST details
                  </button>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">3 · Services</h2>
              {lines.map((l, i) => (
                <div key={l.key} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="grid md:grid-cols-[200px_1fr_110px] gap-2">
                    <select aria-label={`Line ${i + 1} service`} className={inputCls} value={l.serviceId} onChange={(e) => pickService(i, e.target.value)}>
                      <option value="">— Custom line —</option>
                      {lookups.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input aria-label={`Line ${i + 1} name`} className={inputCls} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Service name, e.g. Digital Marketing" />
                    <input aria-label={`Line ${i + 1} SAC`} className={inputCls} value={l.sacCode} onChange={(e) => updateLine(i, { sacCode: e.target.value })} placeholder="SAC" />
                  </div>
                  <textarea aria-label={`Line ${i + 1} details`} rows={2} className={inputCls} value={l.details} onChange={(e) => updateLine(i, { details: e.target.value })} placeholder="Sub-details, one per line (e.g. 12 social media posts)" />
                  <div className="grid grid-cols-2 md:grid-cols-[90px_140px_140px_100px_1fr_40px] gap-2 items-center">
                    <input aria-label={`Line ${i + 1} quantity`} type="number" min="0" step="any" className={inputCls} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} placeholder="Qty" />
                    <input aria-label={`Line ${i + 1} rate`} type="number" min="0" step="any" className={inputCls} value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} placeholder="Rate ₹" />
                    <input aria-label={`Line ${i + 1} discount`} type="number" min="0" step="any" className={inputCls} value={l.discountAmount} onChange={(e) => updateLine(i, { discountAmount: e.target.value })} placeholder="Discount ₹" />
                    <select aria-label={`Line ${i + 1} GST rate`} className={inputCls} value={type === 'IND' ? 0 : l.gstRate} disabled={type === 'IND'} onChange={(e) => updateLine(i, { gstRate: Number(e.target.value) })}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                    <div className="text-right text-sm"><span className="text-slate-400 text-xs mr-2">Taxable {inr(calc.lines[i]?.taxable)}</span><b>{inr(calc.lines[i]?.lineTotal)}</b></div>
                    <button type="button" onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p))} disabled={lines.length === 1}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 justify-self-end" aria-label={`Remove line ${i + 1}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className={btnSecondary} onClick={() => setLines((p) => [...p, blankLine()])}><Plus className="w-4 h-4" /> Add line</button>
            </section>

            <section className="grid md:grid-cols-[1fr_340px] gap-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                <label className="block"><span className="text-xs font-bold text-slate-600">Notes (printed)</span>
                  <textarea rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
                <p className="text-xs text-slate-500 italic">{amountInWords(calc.total)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-sm space-y-1.5" aria-label="Invoice totals">
                <div className="flex justify-between"><span>Taxable value</span><span>{inr(calc.taxable)}</span></div>
                {type !== 'IND' && calc.intra && (<>
                  <div className="flex justify-between"><span>CGST</span><span>{inr(calc.cgst)}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>{inr(calc.sgst)}</span></div>
                </>)}
                {type !== 'IND' && !calc.intra && <div className="flex justify-between"><span>IGST</span><span>{inr(calc.igst)}</span></div>}
                {calc.roundOff !== 0 && <div className="flex justify-between text-slate-500"><span>Round off</span><span>{calc.roundOff > 0 ? '+' : ''}{calc.roundOff.toFixed(2)}</span></div>}
                <div className="flex justify-between border-t-2 border-slate-900 pt-2 mt-2 text-lg font-black"><span>Total</span><span>{inr(calc.total)}</span></div>
                <p className="text-[11px] text-slate-400">Place of supply: {placeName}</p>
              </div>
            </section>

            {saveError && <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{saveError}</div>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className={btnSecondary} onClick={() => navigate(id ? `/finance/invoices/${id}` : '/finance/invoices')}>Cancel</button>
              <button className={btnSecondary} disabled={saving} onClick={() => submit(false)}><Save className="w-4 h-4" /> Save draft</button>
              {canIssue && <button className={btnPrimary} disabled={saving} onClick={() => submit(true)}><Send className="w-4 h-4" /> Save & issue</button>}
            </div>
          </>
        )}
      </PageState>

      {editingClient && (
        <ClientGstModal
          client={editingClient}
          states={lookups.states}
          onClose={() => setEditingClient(null)}
          onSaved={(updated) => {
            setEditingClient(null);
            setLookups((lk) => ({ ...lk, clients: lk.clients.map((c) => (c.id === updated.id ? updated : c)) }));
            setPlaceCode(updated.state_code || settings.state_code);
          }}
        />
      )}
    </div>
  );
}
