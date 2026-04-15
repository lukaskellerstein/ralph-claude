import { FileText } from "lucide-react";

interface ReadInputProps {
  input: Record<string, unknown>;
}

export function ReadInput({ input }: ReadInputProps) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const displayPath = filePath.split("/").slice(-3).join("/");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        fontSize: "12px",
      }}
    >
      <FileText size={12} color="var(--status-info)" />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--foreground-muted)",
        }}
        title={filePath}
      >
        {displayPath}
      </span>
    </div>
  );
}
