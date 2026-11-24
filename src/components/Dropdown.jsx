import React, { useEffect, useId, useRef, useState } from "react";

// A styled replacement for <select>. Native option menus are drawn by the OS
// and cannot match the workspace design, so this renders the same panel as the
// court picker: a field with a divided chevron and a rounded option list.
//
// options: [{ value, label, disabled? }] or plain strings.
// onChange receives the chosen value (not an event).
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  ariaLabel,
  className = "",
  name,
}) {
  const items = options.map((option) =>
    typeof option === "object" ? { ...option, value: String(option.value) } : { value: String(option), label: String(option) },
  );
  const current = String(value ?? "");
  const selected = items.find((item) => item.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const listId = `${id}-options`;

  const enabledIndex = (from, step) => {
    for (let i = from, n = 0; n < items.length; i += step, n++) {
      const index = (i + items.length) % items.length;
      if (!items[index].disabled) return index;
    }
    return -1;
  };

  const show = () => {
    if (disabled) return;
    const index = items.findIndex((item) => item.value === current);
    setActive(index >= 0 && !items[index].disabled ? index : enabledIndex(0, 1));
    setOpen(true);
  };

  const choose = (index) => {
    const item = items[index];
    if (!item || item.disabled) return;
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    if (item.value !== current) onChange(item.value);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // Keep the highlighted option in view while moving with the keyboard.
  useEffect(() => {
    if (!open || active < 0) return;
    // Scroll only inside the menu. scrollIntoView would also scroll the page,
    // which un-pins a sticky filter bar and leaves the menu floating.
    const menu = list.current, item = menu?.children[active];
    if (menu && item) {
      if (item.offsetTop < menu.scrollTop) menu.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > menu.scrollTop + menu.clientHeight)
        menu.scrollTop = item.offsetTop + item.offsetHeight - menu.clientHeight;
    }
  }, [open, active]);

  const onKeyDown = (event) => {
    if (disabled) return;
    const { key } = event;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (key === "Tab") { setOpen(false); return; }
    if (key === "ArrowDown") { event.preventDefault(); setActive((i) => enabledIndex(i + 1, 1)); return; }
    if (key === "ArrowUp") { event.preventDefault(); setActive((i) => enabledIndex(i - 1, -1)); return; }
    if (key === "Home") { event.preventDefault(); setActive(enabledIndex(0, 1)); return; }
    if (key === "End") { event.preventDefault(); setActive(enabledIndex(items.length - 1, -1)); return; }
    if (key === "Enter" || key === " ") { event.preventDefault(); choose(active); return; }
    // Type-ahead: jump to the next option starting with the typed letters.
    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase(), at: now };
      const match = items.findIndex((item) => !item.disabled && item.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };

  return (
    <div ref={root} className={`lc-dropdown ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}>
      <button
        ref={trigger}
        type="button"
        className="lc-dropdown-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        name={name}
        value={current}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className={`lc-dropdown-value ${selected && !selected.disabled ? "" : "is-placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="lc-dropdown-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div ref={list} className="lc-dropdown-menu" id={listId} role="listbox" aria-label={ariaLabel}>
          {items.map((item, index) => (
            <div
              key={`${item.value}-${index}`}
              id={`${id}-${index}`}
              role="option"
              aria-selected={item.value === current}
              aria-disabled={item.disabled || undefined}
              className={[
                "lc-dropdown-option",
                item.value === current ? "is-selected" : "",
                index === active ? "is-active" : "",
                item.disabled ? "is-disabled" : "",
              ].join(" ").trim()}
              onPointerEnter={() => !item.disabled && setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              // These dropdowns sit inside <label>s; without preventDefault the
              // label would forward this click to the trigger and reopen the menu.
              onClick={(event) => { event.preventDefault(); choose(index); }}
            >
              {item.label}
            </div>
          ))}
          {!items.length && <p className="lc-dropdown-empty">No options available.</p>}
        </div>
      )}
    </div>
  );
}
