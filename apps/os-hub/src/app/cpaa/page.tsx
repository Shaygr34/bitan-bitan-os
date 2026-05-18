"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { CPAA_COLOUR_META } from "@/lib/cpaa/state-machine";
import type { CpaaColourState } from "@/lib/cpaa/state-machine";
import { SAMPLE_ROWS, DEMO } from "./cockpit-sample";
import type { CockpitRow } from "./cockpit-types";
import styles from "./page.module.css";

const ALL = "הכל";

const COLOUR_ORDER: CpaaColourState[] = [
  "GRAY",
  "ORANGE",
  "YELLOW",
  "PURPLE",
  "BLUE",
  "GREEN",
];

const SOURCE_LABEL: Record<string, string> = {
  os: "OS",
  "os-manual": "OS — ידני",
  "summit-derived": "נגזר מ-Summit",
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "he"));
}

function formatAmount(n: number | null): string {
  if (n === null) return "—";
  return `${n.toLocaleString("he-IL")} ₪`;
}

export default function CpaaCockpitPage() {
  const rows = SAMPLE_ROWS;

  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a),
    [rows],
  );
  const managers = useMemo(() => uniqueSorted(rows.map((r) => r.accountManager)), [rows]);
  const clientTypes = useMemo(() => uniqueSorted(rows.map((r) => r.clientType)), [rows]);
  const intervals = useMemo(() => uniqueSorted(rows.map((r) => r.vatInterval)), [rows]);

  const [year, setYear] = useState<number>(years[0]);
  const [manager, setManager] = useState<string>(ALL);
  const [clientType, setClientType] = useState<string>(ALL);
  const [interval, setInterval] = useState<string>(ALL);
  const [colour, setColour] = useState<string>(ALL);
  const [sendState, setSendState] = useState<string>(ALL);

  const filtered = useMemo<CockpitRow[]>(
    () =>
      rows.filter(
        (r) =>
          r.year === year &&
          (manager === ALL || r.accountManager === manager) &&
          (clientType === ALL || r.clientType === clientType) &&
          (interval === ALL || r.vatInterval === interval) &&
          (colour === ALL || r.colour === colour) &&
          (sendState === ALL || r.sendState === sendState),
      ),
    [rows, year, manager, clientType, interval, colour, sendState],
  );

  return (
    <div className={`animate-page ${styles.page}`}>
      <PageHeader
        title='מסך CPA — מע"מ'
        description="קוקפיט החזרים חודשי — תצוגה ראשונה (פרוסת מע״מ)"
      />

      {DEMO && (
        <div className={styles.demoBanner}>
          <span className={styles.demoDot} />
          תצוגה מקדמית — נתוני דמו בלבד. הסכומים אינם אמיתיים; נתונים אמיתיים יגיעו
          מ-Summit / מייבואים מאומתים בלבד.
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.field}>
          <span className={styles.label}>שנת תצוגה</span>
          <select
            className={styles.select}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>מנהל תיק</span>
          <select
            className={styles.select}
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            <option value={ALL}>{ALL}</option>
            {managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>סוג לקוח</span>
          <select
            className={styles.select}
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
          >
            <option value={ALL}>{ALL}</option>
            {clientTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>תדירות מע&quot;מ</span>
          <select
            className={styles.select}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            <option value={ALL}>{ALL}</option>
            {intervals.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>סטטוס טיפול</span>
          <select
            className={styles.select}
            value={colour}
            onChange={(e) => setColour(e.target.value)}
          >
            <option value={ALL}>{ALL}</option>
            {COLOUR_ORDER.map((c) => (
              <option key={c} value={c}>
                {CPAA_COLOUR_META[c].he}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>שליחת סכומים</span>
          <select
            className={styles.select}
            value={sendState}
            onChange={(e) => setSendState(e.target.value)}
          >
            <option value={ALL}>{ALL}</option>
            <option value="טרם נשלח">טרם נשלח</option>
            <option value="נשלח">נשלח</option>
          </select>
        </div>

        <span className={styles.count}>{filtered.length} דיווחים</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>לקוח</th>
              <th>מנהל תיק</th>
              <th>סוג</th>
              <th>תדירות מע&quot;מ</th>
              <th>תקופה</th>
              <th>הערה ב׳ (לתשלום)</th>
              <th>סטטוס טיפול</th>
              <th>שליחת סכומים</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={8}>
                  אין דיווחים התואמים לסינון
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={styles.clientCell}>
                      {r.clientName}
                      {!r.summitLinked && (
                        <span className={styles.notInSummit}>לא בסאמיט</span>
                      )}
                    </span>
                  </td>
                  <td>{r.accountManager}</td>
                  <td>{r.clientType}</td>
                  <td>{r.vatInterval}</td>
                  <td>{r.periodLabel}</td>
                  <td>
                    <span
                      className={
                        r.noteB === null ? styles.amountEmpty : styles.amount
                      }
                    >
                      {formatAmount(r.noteB)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${styles[`c${r.colour}`]}`}
                      title={CPAA_COLOUR_META[r.colour].meaning}
                    >
                      {CPAA_COLOUR_META[r.colour].he}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        r.sendState === "נשלח"
                          ? styles.sendSent
                          : styles.sendPending
                      }
                    >
                      {r.sendState}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        {COLOUR_ORDER.map((c) => (
          <span key={c} className={styles.legendItem}>
            <span className={`${styles.badge} ${styles[`c${c}`]}`}>
              {CPAA_COLOUR_META[c].he}
            </span>
            {CPAA_COLOUR_META[c].meaning}
            <span className={styles.legendSource}>
              ({SOURCE_LABEL[CPAA_COLOUR_META[c].source]})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
