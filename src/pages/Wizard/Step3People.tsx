import { useState } from "react";
import { UserPlus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={people.length === 0} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
