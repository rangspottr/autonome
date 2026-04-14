import { useState } from "react";
import styles from "./Table.module.css";
import Skeleton from "./Skeleton.jsx";
import EmptyState from "./EmptyState.jsx";

export default function Table({ columns, data, loading, emptyIcon, emptyTitle, emptyDescription, emptyAction, emptyAgent, emptyStatusIndicator }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  function handleSort(col) {
    if (!col.sortable) return;
    if (sortCol === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col.key);
      setSortDir("asc");
    }
  }

  const sorted = sortCol
    ? [...data].sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        const cmp = av == null ? 1 : bv == null ? -1 : typeof av === "string" ? av.localeCompare(bv) : av - bv;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  styles.th,
                  col.sortable ? styles.thSortable : "",
                  col.align === "right" ? styles.thRight : col.align === "center" ? styles.thCenter : "",
                  sortCol === col.key ? styles.sortActive : "",
                ].join(" ")}
                onClick={() => handleSort(col)}
                aria-sort={col.sortable ? (sortCol === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}
              >
                {col.label}
                {col.sortable && <span className={styles.sortIcon} aria-hidden="true">{sortCol === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={styles.tr}>
                {columns.map((col) => (
                  <td key={col.key} className={styles.td}>
                    <Skeleton variant="text" height={14} width={col.align === "right" ? "60%" : "80%"} style={col.align === "right" ? { marginLeft: "auto" } : {}} />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.td}>
                <EmptyState icon={emptyIcon} title={emptyTitle || "No data"} description={emptyDescription} action={emptyAction} agent={emptyAgent} statusIndicator={emptyStatusIndicator} />
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={row.id || i} className={styles.tr}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      styles.td,
                      col.align === "right" ? styles.tdRight : col.align === "center" ? styles.tdCenter : "",
                    ].join(" ")}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
