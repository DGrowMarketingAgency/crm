import { isValidElement, useLayoutEffect, useRef, useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';

const PAD = 6;
const MARK = 16;

const renderIcon = (icon) => {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  // If icon is a React Component (e.g. from Lucide)
  if (typeof icon === 'function' || (typeof icon === 'object' && (icon.$$typeof || icon.render))) {
    const IconComp = icon;
    return <IconComp size={16} strokeWidth={1.8} />;
  }
  return <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} />;
};

export default function BranchedMenu({
  items = [],
  defaultActive = '',
  activeValue = null,
  onSelect,
  onToggle,
  color = '#f5f5f5',
  accentColor = '#e3272e',
  lineColor = 'rgba(255, 255, 255, 0.18)',
  width = 250,
  rowHeight = 36,
  indent = 38,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 13.5,
  drawDuration = 400,
  foldDuration = 300,
  className = ''
}) {
  // Accordion mode: Only one category open at a time
  const [openIndex, setOpenIndex] = useState(() => {
    const target = activeValue || defaultActive;
    if (target) {
      const idx = items.findIndex((it) => it.children?.some((kid) => kid.value === target));
      if (idx >= 0) return idx;
    }
    return 0; // Default open first category
  });

  const [active, setActive] = useState(() => {
    if (activeValue) return activeValue;
    if (defaultActive) return defaultActive;
    return items[0]?.children?.[0]?.value ?? '';
  });

  // When activeValue changes (navigation), open only that category
  useEffect(() => {
    if (activeValue) {
      setActive(activeValue);
      const idx = items.findIndex((it) => it.children?.some((kid) => kid.value === activeValue));
      if (idx >= 0) {
        setOpenIndex(idx);
      }
    }
  }, [activeValue, items]);

  const navRef = useRef(null);
  const heads = useRef([]);
  const markerRef = useRef(null);
  const latest = useRef({});
  latest.current = { onSelect, onToggle };

  const activeSection = items.findIndex((it) => it.children?.some((kid) => kid.value === active));
  const markerShown = activeSection >= 0 && openIndex === activeSection;

  useLayoutEffect(() => {
    const place = (glide) => {
      const m = markerRef.current;
      const el = heads.current[activeSection];
      if (!m) return;
      const on = markerShown && el;
      if (!glide) m.style.transition = 'none';
      if (on) m.style.top = `${el.offsetTop + (el.offsetHeight - MARK) / 2}px`;
      m.toggleAttribute('data-on', Boolean(on));
      if (!glide) {
        void m.offsetHeight;
        m.style.transition = '';
      }
    };
    place(true);
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const select = (value, item) => {
    setActive(value);
    latest.current.onSelect?.(value, item);
  };

  // Accordion toggle: If clicked category is open, close it (or keep open); if another category clicked, close others and open it!
  const toggle = (i) => {
    const nextIdx = openIndex === i ? null : i;
    setOpenIndex(nextIdx);
    latest.current.onToggle?.(i, nextIdx !== null);
  };

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (k) => PAD + k * rowHeight + rowHeight / 2;
  const branch = (k) => `M ${trunk} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const reach = (k) => `M ${trunk} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const length = (k) => rowY(k) - r + (Math.PI * r) / 2 + (endX - trunk - r);

  return (
    <nav
      ref={navRef}
      className={`relative flex w-full max-w-[min(var(--bm-w),100%)] flex-col pl-3.5 leading-[1.2] [color:var(--bm-ink)] [font-family:inherit] [font-size:var(--bm-font)] before:absolute before:top-2 before:bottom-0 before:left-0 before:w-0.5 before:rounded-[1px] before:[background:linear-gradient(to_bottom,var(--bm-line)_0%,var(--bm-line)_75%,transparent_100%)] before:content-['']${className ? ` ${className}` : ''}`}
      style={{
        '--bm-w': `${width}px`,
        '--bm-ink': color,
        '--bm-accent': accentColor,
        '--bm-line': lineColor,
        '--bm-font': `${fontSize}px`,
        '--bm-row': `${rowHeight}px`,
        '--bm-indent': `${indent}px`,
        '--bm-line-w': lineWidth,
        '--bm-draw': `${drawDuration}ms`,
        '--bm-muted': `color-mix(in srgb, ${color} 65%, transparent)`,
        '--bm-fold': `${foldDuration}ms`
      }}
    >
      <span
        ref={markerRef}
        className="absolute -top-px left-0 z-[1] h-4 w-0.5 rounded-[1px] opacity-0 [background:var(--bm-accent)] [transition:top_220ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease] data-[on]:opacity-100 motion-reduce:[transition:opacity_150ms_ease]"
        aria-hidden="true"
      />
      {items.map((item, i) => {
        const kids = item.children;
        const isOpen = openIndex === i;
        const leafValue = item.value ?? item.label;
        const leafActive = !kids && leafValue === active;
        const bodyH = kids ? PAD * 2 + kids.length * rowHeight : 0;
        return (
          <div
            key={item.value ?? item.label}
            className="group/section flex flex-col mb-1"
            data-open={isOpen ? '' : undefined}
          >
            <button
              ref={(el) => {
                heads.current[i] = el;
              }}
              type="button"
              className={`w-full flex items-center justify-between cursor-pointer border-0 py-2.5 px-2.5 text-left font-bold tracking-wider uppercase text-[11px] rounded-xl transition-all duration-200 outline-none select-none ${
                leafActive
                  ? '!bg-[#e3272e] !text-white font-bold shadow-lg shadow-red-600/50'
                  : isOpen
                  ? 'bg-transparent text-white'
                  : 'bg-transparent text-rose-200/60 hover:text-white hover:bg-white/5'
              }`}
              style={leafActive ? { backgroundColor: '#e3272e', color: '#ffffff' } : undefined}
              aria-expanded={kids ? isOpen : undefined}
              aria-current={leafActive ? 'true' : undefined}
              data-active={leafActive ? '' : undefined}
              onClick={() => (kids ? toggle(i) : select(leafValue, item))}
            >
              <span className="truncate">{item.label}</span>
              {kids && (
                <span
                  className={`text-xs transition-transform duration-200 font-mono text-rose-300/80 ${
                    isOpen ? 'rotate-90 text-white' : ''
                  }`}
                >
                  ›
                </span>
              )}
            </button>
            {kids ? (
              <div
                className="grid transition-all duration-300 ease-in-out"
                style={{
                  gridTemplateRows: isOpen ? '1fr' : '0fr'
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="relative box-border py-1" style={{ height: bodyH }}>
                    <svg
                      className={`pointer-events-none absolute top-0 left-0 overflow-visible transition-opacity duration-200 ${
                        isOpen ? 'opacity-100' : 'opacity-0'
                      }`}
                      width={indent}
                      height={bodyH}
                      aria-hidden="true"
                    >
                      <path
                        className="fill-none [stroke:var(--bm-line)] [stroke-width:var(--bm-line-w)] [stroke-linecap:round] [stroke-linejoin:round]"
                        d={`M ${trunk} 0 V ${rowY(kids.length - 1) - r}`}
                      />
                      {kids.map((kid, k) => (
                        <path
                          key={kid.value}
                          className="fill-none [stroke:var(--bm-line)] [stroke-width:var(--bm-line-w)] [stroke-linecap:round] [stroke-linejoin:round]"
                          d={branch(k)}
                        />
                      ))}
                      {kids.map((kid, k) => (
                        <path
                          key={kid.value}
                          className="fill-none [stroke:var(--bm-accent)] [stroke-width:var(--bm-line-w)] [stroke-linecap:round] [stroke-linejoin:round] [transition:stroke-dashoffset_var(--bm-draw)_cubic-bezier(0.23,1,0.32,1)]"
                          d={reach(k)}
                          style={{
                            strokeDasharray: length(k),
                            strokeDashoffset: kid.value === active ? 0 : length(k)
                          }}
                        />
                      ))}
                    </svg>
                    {kids.map((kid) => {
                      const isKidActive = kid.value === active;
                      return (
                        <button
                          key={kid.value}
                          type="button"
                          className={`m-0 box-border flex w-full cursor-pointer items-center gap-2.5 border-0 py-0 pr-3 text-left outline-none [height:var(--bm-row)] [padding-left:var(--bm-indent)] rounded-xl [font-family:inherit] transition-all duration-150 ${
                            isKidActive
                              ? '!bg-[#e3272e] !text-white font-bold shadow-lg shadow-red-600/50'
                              : 'bg-transparent text-rose-100/75 hover:text-white hover:bg-white/10'
                          }`}
                          style={
                            isKidActive
                              ? {
                                  backgroundColor: '#e3272e',
                                  color: '#ffffff',
                                  boxShadow: '0 4px 16px rgba(227, 39, 46, 0.45)'
                                }
                              : undefined
                          }
                          aria-current={isKidActive ? 'true' : undefined}
                          data-active={isKidActive ? '' : undefined}
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => select(kid.value, kid)}
                        >
                          {kid.icon ? (
                            <span
                              className={`inline-flex flex-none transition-colors ${
                                isKidActive ? '!text-white' : 'text-rose-200/70'
                              }`}
                              aria-hidden="true"
                            >
                              {renderIcon(kid.icon)}
                            </span>
                          ) : null}
                          <span
                            className={`truncate text-[13px] ${
                              isKidActive ? '!text-white font-bold' : 'font-medium'
                            }`}
                          >
                            {kid.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
