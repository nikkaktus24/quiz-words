import { useEffect, useId, useRef, useState } from "react";

type Action = { label: string; danger?: boolean; onSelect: () => void };

/** Native popovers live above the card grid and provide outside-click / Escape dismissal. */
export function SetActions({ name, actions }: { name: string; actions: Action[] }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  function place() {
    const button = trigger.current;
    const popup = panel.current;
    if (!button || !popup) return;
    const anchor = button.getBoundingClientRect();
    const width = 180;
    const height = popup.offsetHeight || actions.length * 40 + 14;
    const margin = 8;
    const below = anchor.bottom + margin;
    const top = below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, anchor.top - height - margin);
    setPosition({
      left: Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin)),
      top,
    });
  }

  useEffect(() => {
    if (!open) return;
    function dismiss() {
      if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
    }
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return <>
    <button ref={trigger} className="set-actions-trigger" type="button" popoverTarget={id}
      aria-label={`Options for ${name}`} onClick={place}>•••</button>
    <div ref={panel} id={id} popover="auto" className="set-actions-popover"
      aria-label={`Actions for ${name}`} style={position}
      onToggle={(event) => {
        const isOpen = (event.nativeEvent as ToggleEvent).newState === "open";
        setOpen(isOpen);
        if (isOpen) {
          place();
          panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        }
      }}>
      {actions.map((action) => <button key={action.label} type="button" className={action.danger ? "danger" : "ghost"}
        onClick={() => { panel.current?.hidePopover(); action.onSelect(); }}>{action.label}</button>)}
    </div>
  </>;
}
