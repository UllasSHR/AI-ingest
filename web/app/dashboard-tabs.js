"use client";

import { useState } from "react";
import BriefList from "./brief-list";
import OpportunityList from "./opportunity-list";

export default function DashboardTabs({ brief, opportunities }) {
  const [active, setActive] = useState("brief");
  const briefCount = brief.items.length;
  const opportunityCount = opportunities.items.length;

  const tabs = [
    { id: "brief", label: "Brief", meta: `${briefCount} items` },
    { id: "opportunities", label: "Opportunities", meta: `${opportunityCount} leads` },
  ];

  return (
    <section>
      <div
        role="tablist"
        aria-label="Morning page sections"
        className="mb-8 grid grid-cols-2 rounded-xl border border-line bg-card p-1"
      >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${tab.id}-panel`}
              onClick={() => setActive(tab.id)}
              className={`rounded-lg px-3 py-3 text-left transition-colors ${
                selected
                  ? "bg-ink text-bg"
                  : "text-faint hover:bg-card-hover hover:text-muted"
              }`}
            >
              <span className="block text-sm font-medium">{tab.label}</span>
              <span
                className={`mt-0.5 block text-[10px] uppercase tracking-[0.18em] ${
                  selected ? "text-bg/60" : "text-faint"
                }`}
              >
                {tab.meta}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="brief-panel"
        role="tabpanel"
        aria-labelledby="brief"
        hidden={active !== "brief"}
      >
        {active === "brief" && <BriefList items={brief.items} date={brief.date} />}
      </div>

      <div
        id="opportunities-panel"
        role="tabpanel"
        aria-labelledby="opportunities"
        hidden={active !== "opportunities"}
      >
        {active === "opportunities" && (
          <OpportunityList items={opportunities.items} date={opportunities.date} />
        )}
      </div>
    </section>
  );
}
