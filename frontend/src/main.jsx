import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { HeartHandshake } from "lucide-react";
import CommandMap from "./components/map/CommandMap";
import DonationModal from "./components/DonationModal";
import { useDistrictAlerts } from "./lib/useDistrictAlerts";
import "./styles/index.css";

function App() {
  const [donateOpen, setDonateOpen] = useState(false);
  const { statusByDistrict, meta, offline, loaded } = useDistrictAlerts();

  return (
    <div className="cm-screen">
      <CommandMap
        statusByDistrict={statusByDistrict} alertMeta={meta} alertsOffline={offline} alertsLoaded={loaded}
        headerActions={
          <button type="button" className="cm-donate" onClick={() => setDonateOpen(true)} aria-label="Emergency donation">
            <HeartHandshake size={22} /> <span>Donate</span>
          </button>
        }
      />
      <DonationModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
