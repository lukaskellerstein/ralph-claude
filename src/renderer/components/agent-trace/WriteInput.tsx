import { FilePlus } from "lucide-react";

interface WriteInputProps {
  input: Record<string, unknown>;
}

export function WriteInput({ input }: WriteInputProps) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const content = String(input.content ?? "");
  const displayPath = filePath.split("/").slice(-3).join("/");

  return (
    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--surface)",
          borderBottom: content ? "1px solid var(--border)" : undefined,
        }}
      >
        <FilePlus size={11} color="var(--primary)" />
        <span style={{ color: "var(--foreground-muted)" }} title={filePath}>
          {displayPath}
        </span>
      </div>
      {content && (
        <pre
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--foreground-dim)",
            background: "var(--background)",
            padding: "8px 12px",
            margin: 0,
            maxHeight: 300,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
