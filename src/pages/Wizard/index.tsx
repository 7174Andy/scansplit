import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <div>Step 3 (next task)</div>}
      {step === 4 && <div>Step 4 (next task)</div>}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
