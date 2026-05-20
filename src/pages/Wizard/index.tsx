import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";
import { Step4Assign } from "./Step4Assign";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Step4Assign onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
