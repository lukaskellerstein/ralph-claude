import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Shared minimal modal shell used by every checkpoint modal. */
export function CheckpointModal({ title, onClose, children, footer, wide }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          minWidth: wide ? 720 : 420,
          maxWidth: wide ? "90vw" : 560,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600,
          }}
        >
          {title}
        </header>
        <div style={{ padding: "16px 18px", overflow: "auto", flex: 1 }}>{children}</div>
        {footer && (
          <footer
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
