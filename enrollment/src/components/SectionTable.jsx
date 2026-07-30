import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Pagination from "./ui/Pagination";

function getCapacityStateStyle(count, capacity) {
  const currentCount = Number(count || 0);
  const cap = Number(capacity || 0);
  if (currentCount >= cap) return "bg-red-100 text-red-700 font-bold";
  if (currentCount >= cap * 0.8) return "bg-yellow-100 text-yellow-700 font-bold";
  return "bg-green-100 text-green-700 font-bold";
}

function SectionTable({ sections, students, onOpenStudentList, className = "" }) {
  const [detailSection, setDetailSection] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const sectionList = useMemo(() => (Array.isArray(sections) ? sections : []), [sections]);
  const studentList = useMemo(() => (Array.isArray(students) ? students : []), [students]);

  const totalPages = Math.max(1, Math.ceil(sectionList.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedSections = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sectionList.slice(start, start + pageSize);
  }, [sectionList, safePage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sections]);

  const getStudentRowsForSection = (section) => {
    const year = String(section.year ?? "").trim();
    const sectionName = String(section.section ?? "").trim().toUpperCase();
    const semester = String(section.semester ?? "").trim() || "N/A";
    if (!year || !sectionName) return [];

    return studentList.filter((student) => {
      const sYear = String(student.year ?? "").trim();
      const sSection = String(student.section ?? "").trim().toUpperCase();
      const sSemester = String(student.semester ?? "").trim() || "N/A";
      return sYear === year && sSection === sectionName && sSemester === semester;
    });
  };

  const handlePageSizeChange = (nextSize) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const openDetail = (section) => setDetailSection(section);
  const closeDetail = () => setDetailSection(null);

  const detailEntries = detailSection
    ? Object.entries(detailSection).filter(([key]) => !["_id", "__v"].includes(key))
    : [];

  const columnCount = 8;

  return (
    <div className={`flex h-full min-h-[340px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white font-sans shadow-sm ${className}`}>
      <div className="h-[420px] min-h-[420px] overflow-auto custom-scrollbar">
        <table className="min-w-full whitespace-nowrap border-collapse text-left text-sm md:text-base">
          <thead className="sticky top-0 z-10 border-b border-[#BFD9BC] bg-[#E4F6E2] text-[#173F30]">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Year</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Section</th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Semester</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Regular</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Irregular</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Total</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Status</th>
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Students</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedSections.length > 0 ? (
              paginatedSections.map((sec) => {
                const blockCapacity = Number(sec.blockCapacity ?? sec.regularCapacity ?? 45);
                const irregularCapacity = Number(sec.irregularCapacity ?? 5);
                const blockCount = Number(sec.blockCount ?? sec.regular ?? 0);
                const irregularCount = Number(sec.irregularCount ?? sec.irregular ?? 0);
                const total = blockCount + irregularCount;
                const studentRows = getStudentRowsForSection(sec);

                return (
                  <tr key={sec._id || `${sec.year}-${sec.section}-${sec.semester}`} className="hover:bg-emerald-50/60 transition-colors">
                    <td className="px-5 py-4 text-gray-800">{sec.year || "—"}</td>
                    <td className="px-5 py-4 font-medium text-gray-900">{sec.section || "—"}</td>
                    <td className="px-5 py-4 text-gray-600">{sec.semester || "—"}</td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenStudentList?.(sec, "block")}
                        className={`${getCapacityStateStyle(blockCount, blockCapacity)} underline underline-offset-2 hover:opacity-80`}
                        aria-label={`View enrolled students for section ${sec.section}`}
                      >
                        {`${blockCount}/${blockCapacity}`}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenStudentList?.(sec, "irregular")}
                        className={`${getCapacityStateStyle(irregularCount, irregularCapacity)} underline underline-offset-2 hover:opacity-80`}
                        aria-label={`View irregular students for section ${sec.section}`}
                      >
                        {`${irregularCount}/${irregularCapacity}`}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-gray-900 font-semibold text-center">{total}</td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs tracking-wide bg-gray-100 text-gray-700 font-bold">
                        {sec.status || "Unknown"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => openDetail(sec)}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#2E522A] focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label={`View details for section ${sec.section}`}
                      >
                        <i className="fa-solid fa-magnifying-glass" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-regular fa-folder-open text-3xl opacity-50" />
                    <p>No sections found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={safePage}
        totalItems={sectionList.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 20, 50]}
      />

      {detailSection &&
        createPortal(
          <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={closeDetail}
              aria-label="Close section details"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Section details"
              className="animate-fade relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl shadow-slate-950/25"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Section Details</p>
                  <h3 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                    Year {detailSection.year} - Section {detailSection.section}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{detailSection.semester} Semester</p>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close section details"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              <div className="overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">
                        {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                      </dt>
                      <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">
                        {value === null || value === undefined || value === "" ? "—" : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default SectionTable;
