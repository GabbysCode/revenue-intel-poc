"use client";

import React, { useState } from "react";
import { Header } from "@/components/layout/Header";
import { VersionTimeline, type Version } from "@/components/time-travel/VersionTimeline";
import { DiffViewer } from "@/components/time-travel/DiffViewer";

export default function TimeTravelPage() {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [v1, setV1] = useState<number>(0);
  const [v2, setV2] = useState<number>(0);
  const [versions, setVersions] = useState<Version[]>([]);

  return (
    <>
      <Header
        title="Time Travel"
        subtitle="Explore historical data versions powered by Delta Lake"
      />
      <div className="p-6 space-y-6">
        <VersionTimeline
          selectedVersion={selectedVersion}
          onSelect={setSelectedVersion}
          onVersionsLoaded={setVersions}
        />

        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
        >
          <h3 className="text-sm font-medium text-[#9ca3af] mb-4">Compare versions</h3>
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-xs text-[#888888] mb-1">Version 1</label>
              <select
                value={v1}
                onChange={(e) => setV1(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-[#0f0f0f] border text-[#e5e5e5] text-sm min-w-[120px]"
                style={{ borderColor: "#2a2a2a" }}
              >
                <option value={0}>Select...</option>
                {versions.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    Version {v.version_id}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[#888888] mt-6">vs</span>
            <div>
              <label className="block text-xs text-[#888888] mb-1">Version 2</label>
              <select
                value={v2}
                onChange={(e) => setV2(Number(e.target.value))}
                className="px-3 py-2 rounded-lg bg-[#0f0f0f] border text-[#e5e5e5] text-sm min-w-[120px]"
                style={{ borderColor: "#2a2a2a" }}
              >
                <option value={0}>Select...</option>
                {versions.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    Version {v.version_id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DiffViewer v1={v1} v2={v2} />
      </div>
    </>
  );
}
