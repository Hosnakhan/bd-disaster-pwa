import { LocateFixed, Navigation, Phone, X } from "lucide-react";
import { STATUS } from "../../lib/districtStatus";
import { directionsUrl, formatDistance, timeAgo } from "../../lib/mapGeo";

const FACILITY = { water: ["💧", "Water"], food: ["🍚", "Food"], medical: ["⛑️", "Medical"], toilet: ["🚻", "Toilets"], power: ["🔌", "Power"] };
const CAMP_LABEL = { open: "Open", full: "Full", closed: "Closed" };
const SEV_LABEL = { danger: "Danger", warning: "Warning", caution: "Caution" };
const SEV_COLOR = { danger: "#ef4444", warning: "#f97316", caution: "#eab308" };

export function TentIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M2.5 20 12 4l9.5 16Z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M9.2 20 12 14.5l2.8 5.5Z" fill="#fff" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function WarnIcon({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M12 4 3 20h18L12 4Z" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M12 10v4.2" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.4" fill="#fff" />
    </svg>
  );
}

const Badge = ({ s, children }) => <span className="cm-badge" data-s={s}>{children}</span>;

function CapacityBar({ occupancy, capacity }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((occupancy / capacity) * 100)) : 0;
  const color = pct >= 100 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "#22c55e";
  return <div className="cm-bar" role="img" aria-label={`${pct}% full`}><i style={{ "--w": `${pct}%`, "--bc": color }} /></div>;
}

/** Collapsed-sheet summary: selection title, or live counts by status. */
export function PeekSummary({ selected, counts }) {
  if (selected) {
    return (
      <div className="cm-peek">
        <div className="cm-peek-sel">
          <b>{selected.title}</b>
          <Badge s={selected.badgeKey}>{selected.badge}</Badge>
        </div>
      </div>
    );
  }
  return (
    <div className="cm-peek" aria-label="District alert counts">
      {["danger", "warning", "caution", "safe"].map((k) => (
        <div className="cm-count" key={k} style={{ "--c": STATUS[k].color }}>
          <b>{counts[k] || 0}</b><span>{STATUS[k].label}</span>
        </div>
      ))}
    </div>
  );
}

function Distance({ km }) {
  return km == null ? null : <p className="cm-distline">{formatDistance(km)} from you · straight line</p>;
}

function DetailCard({ selected, onClear }) {
  const { kind, data } = selected;
  return (
    <section className="cm-detail" aria-live="polite">
      <div className="cm-detail-top">
        {kind === "district" && <Badge s={data.status}>{data.label}</Badge>}
        {kind === "hotspot" && <Badge s={data.severity}>{SEV_LABEL[data.severity]}</Badge>}
        {kind === "camp" && <Badge s={data.status}>{CAMP_LABEL[data.status]}</Badge>}
        <button type="button" className="cm-close" onClick={onClear} aria-label="Close details"><X size={20} /></button>
      </div>
      <h2>{data.name}</h2>

      {kind === "district" && (
        <>
          <p>{data.message}</p>
          <p className="cm-meta">
            {data.issuer ? `${data.issuer} · ` : ""}{data.updatedAt ? `Updated ${timeAgo(data.updatedAt)}` : "Update time unknown"}
            {data.validUntil ? ` · Valid until ${new Date(data.validUntil).toLocaleString()}` : ""}
          </p>
          {data.status === "unknown" && <p className="cm-meta">Grey does not mean safe. Follow local authorities.</p>}
          {data.sourceUrl && <p className="cm-meta"><a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">Official source</a></p>}
        </>
      )}

      {kind === "hotspot" && (
        <>
          <p className="cm-meta">{[data.district, data.upazila].filter(Boolean).join(" · ")} · {data.type}</p>
          <Distance km={data.distanceKm} />
          <div className="cm-actions">
            <a className="cm-action" href={directionsUrl(data.lat, data.lon)} target="_blank" rel="noopener noreferrer"><Navigation size={20} /> Directions</a>
          </div>
          {data.message && <p>{data.message}</p>}
          <p className="cm-meta">{data.updatedAt ? `Updated ${timeAgo(data.updatedAt)}` : "Update time unknown"}</p>
        </>
      )}

      {kind === "camp" && (
        <>
          <p className="cm-meta">{[data.district, data.upazila].filter(Boolean).join(" · ")}</p>
          <Distance km={data.distanceKm} />
          <div className="cm-actions">
            {data.phone && <a className="cm-action secondary" href={`tel:${data.phone}`}><Phone size={20} /> Call</a>}
            <a className="cm-action" href={directionsUrl(data.lat, data.lon)} target="_blank" rel="noopener noreferrer"><Navigation size={20} /> Directions</a>
          </div>
          <p style={{ fontWeight: 800, marginTop: 14 }}>
            {data.capacity > 0
              ? `${data.occupancy} of ${data.capacity} people · ${Math.max(0, data.capacity - data.occupancy)} places free`
              : "Capacity not reported"}
          </p>
          {data.capacity > 0 && <CapacityBar occupancy={data.occupancy} capacity={data.capacity} />}
          {data.facilities.length > 0 && (
            <div className="cm-fac">{data.facilities.map((f) => <span key={f}>{FACILITY[f][0]} {FACILITY[f][1]}</span>)}</div>
          )}
          <p className="cm-meta" style={{ marginTop: 10 }}>{data.updatedAt ? `Updated ${timeAgo(data.updatedAt)}` : "Update time unknown"}</p>
        </>
      )}
    </section>
  );
}

const Legend = () => (
  <p className="cm-legend" aria-label="Legend">
    {["danger", "warning", "caution", "safe"].map((k) => <span key={k} style={{ "--c": STATUS[k].color }}><i />{STATUS[k].label}</span>)}
    <span style={{ "--c": STATUS.unknown.color }}><i />No verified status (not safe)</span>
  </p>
);

export default function PanelContent({ tab, onTab, selected, onClear, districtAlerts, hotspots, camps, located, locating, onLocate, onPick }) {
  const tabs = [["alerts", "Alerts", districtAlerts.length], ["hazards", "Hazards", hotspots.length], ["camps", "Camps", camps.length]];
  const selId = selected?.id;
  return (
    <div className="cm-pad">
      {selected && <DetailCard selected={selected} onClear={onClear} />}

      <div className="cm-tabs" role="tablist" aria-label="Map lists">
        {tabs.map(([key, label, n]) => (
          <button key={key} type="button" role="tab" className="cm-tab" id={`cm-tab-${key}`} aria-selected={tab === key} aria-controls="cm-tabpanel" onClick={() => onTab(key)}>
            {label}<small>{n}</small>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="cm-tabpanel" aria-labelledby={`cm-tab-${tab}`}>
        {tab === "alerts" && (
          <>
            <Legend />
            {districtAlerts.length === 0 ? (
              <p className="cm-empty">No district alerts are currently reported. Districts without an official entry show as grey, which does not mean safe.</p>
            ) : (
              <ul className="cm-list">
                {districtAlerts.map((d) => (
                  <li key={d.name}>
                    <button type="button" className="cm-row" aria-current={selId === d.name} onClick={() => onPick("district", d.name)}>
                      <span className="cm-row-icon" style={{ "--ic": STATUS[d.status].color }}><WarnIcon /></span>
                      <span className="cm-row-main">
                        <span className="cm-row-title">{d.name}</span>
                        <span className="cm-row-sub">{STATUS[d.status].label} · {timeAgo(d.updatedAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "hazards" && (hotspots.length === 0 ? <p className="cm-empty">No hazard hotspots reported.</p> : (
          <ul className="cm-list">
            {hotspots.map((h) => (
              <li key={h.id}>
                <button type="button" className="cm-row" aria-current={selId === h.id} onClick={() => onPick("hotspot", h.id)}>
                  <span className="cm-row-icon" style={{ "--ic": SEV_COLOR[h.severity] }}><WarnIcon /></span>
                  <span className="cm-row-main">
                    <span className="cm-row-title">{h.name}</span>
                    <span className="cm-row-sub">{SEV_LABEL[h.severity]} · {h.district || "Location"}</span>
                  </span>
                  {h.distanceKm != null && <span className="cm-dist">{formatDistance(h.distanceKm)}</span>}
                </button>
              </li>
            ))}
          </ul>
        ))}

        {tab === "camps" && (
          <>
            {!located && camps.length > 0 && (
              <button type="button" className="cm-linkbtn" onClick={onLocate} disabled={locating}>
                <LocateFixed size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                {locating ? "Finding your location…" : "Show distance from my location"}
              </button>
            )}
            {camps.length === 0 ? <p className="cm-empty">No relief camps reported yet.</p> : (
              <ul className="cm-list">
                {camps.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="cm-row" aria-current={selId === c.id} onClick={() => onPick("camp", c.id)}>
                      <span className="cm-row-icon" style={{ "--ic": c.status === "closed" ? "#64748b" : "#16a34a" }}><TentIcon /></span>
                      <span className="cm-row-main">
                        <span className="cm-row-title">{c.name}</span>
                        <span className="cm-row-sub">{CAMP_LABEL[c.status]}{c.capacity > 0 ? ` · ${c.occupancy}/${c.capacity}` : ""} · {c.district || "Location"}</span>
                        {c.capacity > 0 && <CapacityBar occupancy={c.occupancy} capacity={c.capacity} />}
                      </span>
                      {c.distanceKm != null && <span className="cm-dist">{formatDistance(c.distanceKm)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
