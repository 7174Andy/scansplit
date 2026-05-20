import { useState } from "react";
import { useWizardStore } from "../../store/wizardStore";
import { PersonChip } from "../../components/PersonChip";

export function Step3People({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { people, addPerson, removePerson } = useWizardStore();
  const [name, setName] = useState("");

  function commit() {
    const n = name.trim();
    if (!n) return;
    addPerson(n);
    setName("");
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 3 of 5 — Add people</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="Name"
          style={{ padding: 6 }}
        />
        <button onClick={commit}>+ Add</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {people.map((p) => (
          <PersonChip key={p.id} name={p.name} onRemove={() => removePerson(p.id)} />
        ))}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button disabled={people.length === 0} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
