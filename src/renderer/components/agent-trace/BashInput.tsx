interface BashInputProps {
  input: Record<string, unknown>;
}

export function BashInput({ input }: BashInputProps) {
  const command = String(input.command ?? input.cmd ?? "");

  return (
    <div
      style={{
        background: "hsl(0, 0%, 7%)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      <span style={{ color: "hsl(120, 60%, 60%)", marginRight: 8 }}>$</span>
      <span style={{ color: "var(--foreground)" }}>{command}</span>
    </div>
  );
}
