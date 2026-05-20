interface Props {
  name: string;
  onRemove?: () => void;
  active?: boolean;
  onClick?: () => void;
}

export function PersonChip({ name, onRemove, active, onClick }: Props) {
  return (
    <span
      onClick={onClick}
      style={{
        padding: "5px 10px",
        background: active ? "#4a9eff" : "#2a2a2a",
        color: active ? "white" : "inherit",
        borderRadius: 16,
        border: "1px solid " + (active ? "#4a9eff" : "#3a3a3a"),
        fontSize: 13,
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
