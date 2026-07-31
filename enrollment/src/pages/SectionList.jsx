import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import SectionTable from "../components/SectionTable";
import LoadingState from "../components/ui/LoadingState";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SearchInput from "../components/ui/SearchInput";
import api from "../lib/axios";

const STATUS_OPTIONS = ["All", "Available", "Full", "Overloaded"];
const YEAR_OPTIONS = ["All Year", "1", "2", "3", "4"];

function SectionList() {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All Year");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [capacityValue, setCapacityValue] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const displayedSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = [...sections];

    if (normalizedQuery) {
      const combinedMatch = normalizedQuery.match(/^(\d+)\s*([a-z]+)$/i);
      const reverseCombinedMatch = normalizedQuery.match(/^([a-z]+)\s*(\d+)$/i);

      if (combinedMatch) {
        const [, year, section] = combinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else if (reverseCombinedMatch) {
        const [, section, year] = reverseCombinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else {
        result = result.filter((item) =>
          [item.year, item.section, item.semester, item.status]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        );
      }
    }

    if (selectedStatus !== "All") {
      result = result.filter((item) => item.status === selectedStatus);
    }

    if (selectedYear !== "All Year") {
      result = result.filter((item) => String(item.year) === selectedYear);
    }

    return result.sort((left, right) => {
      const yearDifference = Number(left.year) - Number(right.year);
      if (yearDifference !== 0) return yearDifference;

      const semesterOrder = { "1st": 1, "2nd": 2 };
      const semesterDifference =
        (semesterOrder[String(left.semester ?? "").trim()] ?? 99) -
        (semesterOrder[String(right.semester ?? "").trim()] ?? 99);
      if (semesterDifference !== 0) return semesterDifference;

      return String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [sections, query, selectedStatus, selectedYear]);

  useEffect(() => {
    document.title = "Sections - IITI Enrollment System";

    const refreshSections = async () => {
      try {
        setLoading(true);
        await api.post("/sections/sync");
        const response = await api.get("/sections", { params: { t: Date.now() } });
        const rawSections = Array.isArray(response.data) ? response.data : [];

        const uniqueSections = new Map();
        rawSections.forEach((section) => {
          const key = `${String(section.year ?? "")}::${String(section.section ?? "")}::${String(
            section.semester ?? ""
          )}`;
          const existing = uniqueSections.get(key);
          if (!existing || Number(section.blockCount ?? section.regular ?? 0) > Number(existing.blockCount ?? existing.regular ?? 0)) {
            uniqueSections.set(key, section);
          }
        });

        const normalized = Array.from(uniqueSections.values())
          .map((section) => ({
            ...section,
            blockCount: Number(section.blockCount ?? section.regular ?? 0),
            irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
            blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? 45),
            irregularCapacity: Number(section.irregularCapacity ?? 5),
            totalCapacity: Number(section.totalCapacity ?? 50),
            total: Number(section.blockCount ?? section.regular ?? 0) + Number(section.irregularCount ?? section.irregular ?? 0),
          }))
          .filter((section) => section.blockCount > 0 || section.irregularCount > 0);

        setSections(normalized);
      } catch (error) {
        console.error("Failed to load sections", error);
        toast.error("Failed to load section data");
        setSections([]);
      } finally {
        setLoading(false);
      }
    };

    refreshSections();
  }, []);

  const handleSetCapacity = () => {
    const parsed = Number(capacityValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Please enter a valid numerical value");
      return;
    }

    const capacities = {
      totalCapacity: parsed,
      blockCapacity: parsed * 0.9,
      irregularCapacity: parsed * 0.1,
    };

    setPreviewData(capacities);
    setShowConfirmation(true);
    setShowCapacityModal(false);
  };

  const handleConfirmCapacityUpdate = async () => {
    if (!previewData || isUpdating) return;

    try {
      setIsUpdating(true);
      await api.patch("/sections/capacity/all", { totalCapacity: previewData.totalCapacity });
      toast.success("All section capacities updated successfully");
      setShowConfirmation(false);
      setPreviewData(null);
      setCapacityValue("");
      const response = await api.get("/sections", { params: { t: Date.now() } });
      const rawSections = Array.isArray(response.data) ? response.data : [];
      const uniqueSections = new Map();
      rawSections.forEach((section) => {
        const key = `${String(section.year ?? "")}::${String(section.section ?? "")}::${String(section.semester ?? "")}`;
        const existing = uniqueSections.get(key);
        if (!existing || Number(section.blockCount ?? section.regular ?? 0) > Number(existing.blockCount ?? existing.regular ?? 0)) {
          uniqueSections.set(key, section);
        }
      });
      const normalized = Array.from(uniqueSections.values()).map((section) => ({
        ...section,
        blockCount: Number(section.blockCount ?? section.regular ?? 0),
        irregularCount: Number(section.irregularCount ?? section.irregular ?? 0),
        blockCapacity: Number(section.blockCapacity ?? section.regularCapacity ?? 45),
        irregularCapacity: Number(section.irregularCapacity ?? 5),
        totalCapacity: Number(section.totalCapacity ?? 50),
        total: Number(section.blockCount ?? section.regular ?? 0) + Number(section.irregularCount ?? section.irregular ?? 0),
      })).filter((section) => section.blockCount > 0 || section.irregularCount > 0);
      setSections(normalized);
    } catch (error) {
      console.error("Failed to update capacities", error);
      toast.error(error?.response?.data?.message || "Failed to update section capacities");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Capacity"
        title="Section Management"
        description="Monitor section enrollment, available capacity, and overloaded classes."
        actions={
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">
            {displayedSections.length} section{displayedSections.length === 1 ? "" : "s"}
          </div>
        }
      />

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowCapacityModal(true)}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <i className="fa-solid fa-gear mr-2" />
                Set Capacity
              </button>
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery("")}
                placeholder="Search year, section, semester, or status..."
                className="w-full sm:w-80"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Status</span>
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                    selectedStatus === status
                      ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Year</span>
            {YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                  selectedYear === year
                    ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="min-h-[420px] overflow-hidden">
        {loading ? (
          <LoadingState label="Loading section data..." />
        ) : (
          <SectionTable sections={displayedSections} />
        )}
      </Panel>

      {showCapacityModal &&
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setShowCapacityModal(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/30 bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Capacity</p>
              <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">Set Total Section Capacity</h3>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">New Total Capacity</label>
              <input
                type="number"
                min="0"
                value={capacityValue}
                onChange={(e) => setCapacityValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSetCapacity(); }}
                placeholder="Enter numerical value..."
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowCapacityModal(false); setCapacityValue(""); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetCapacity}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <i className="fa-solid fa-arrow-right text-xs" />
                Confirm
              </button>
            </div>
          </div>
        </div>
      }

      {showConfirmation && previewData &&
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => { setShowConfirmation(false); setPreviewData(null); }}
          />
          <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Confirmation</p>
                <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Confirm Changes</h3>
                <p className="mt-1 text-sm text-slate-500">Review the updated capacities before applying changes to all sections.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowConfirmation(false); setPreviewData(null); }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close confirmation"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Total Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.totalCapacity}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Block Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.blockCapacity}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">Irregular Capacity</dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{previewData.irregularCapacity}</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setShowConfirmation(false); setPreviewData(null); setCapacityValue(""); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCapacityUpdate}
                disabled={isUpdating}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-check" />
                    Confirm Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  );
}

export default SectionList;
