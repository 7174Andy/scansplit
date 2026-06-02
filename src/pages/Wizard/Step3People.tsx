import { useState } from "react";
import { UserPlus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWizardStore } from "../../store/wizardStore";
import { PersonChip } from "../../components/PersonChip";

export function Step3People({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const people = useWizardStore((s) => s.people);
  const paidByPersonId = useWizardStore((s) => s.transaction.paidByPersonId);
  const addPerson = useWizardStore((s) => s.addPerson);
  const removePerson = useWizardStore((s) => s.removePerson);
  const setPayer = useWizardStore((s) => s.setPayer);
  const [name, setName] = useState("");

  function commit() {
    const n = name.trim();
    if (!n) return;
    addPerson(n);
    setName("");
  }

  const canAdvance = people.length > 0 && paidByPersonId != null;

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="Name"
        />
        <Button onClick={commit}>
          <UserPlus className="size-4" /> Add
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {people.map((p) => (
          <PersonChip key={p.id} name={p.name} onRemove={() => removePerson(p.id)} />
        ))}
      </div>

      {people.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span>Paid by</span>
          <select
            aria-label="Paid by"
            value={paidByPersonId ?? ""}
            onChange={(e) => setPayer(e.target.value || null)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {paidByPersonId == null && <option value="">— Select —</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={!canAdvance} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
