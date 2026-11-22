"use client";

import { useEffect, useState } from "react";
import { fetchMetrics, getRepository } from "@/data";
import type { components } from "@/types/api";
import { computeFunnel, type FunnelRow } from "@/domain/funnel";
import styles from "./page.module.css";

type Kpi = components["schemas"]["Kpi"];

/**
 * 퍼널과 작업 지표(DV-01, FR-40, FR-49). 데모 플로우 13단계마다 도달 수와 이탈 수, 강사님 KPI를 표로 보인다.
 * 사용자 화면에서 이 주소로 가는 길은 없다(FR-40 ③). 막지 않는다(routes DV-01).
 * 서버가 있으면 서버가 받은 모든 이벤트로 세고(A-34, F8), 없으면(1차) 이 브라우저의 이벤트로 센다(D-08).
 */
export default function FunnelPage() {
  const [rows, setRows] = useState<FunnelRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const [fromServer, setFromServer] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const server = await fetchMetrics().catch(() => null);
      if (!alive) return;
      if (server) {
        setRows(server.funnel.map((r) => ({ ...r, role: r.role ?? undefined })));
        setTotal(server.events_total);
        setKpis(server.kpis);
        setFromServer(true);
        return;
      }
      const events = await getRepository().listEvents();
      if (!alive) return;
      setRows(computeFunnel(events));
      setTotal(events.length);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>퍼널</h1>
      <p className={styles.note}>
        데모 플로우 13단계마다 그 단계의 이벤트가 남은 책의 수(도달)와, 직전 단계에는 왔지만 이 단계에는 오지 않은 책의 수(이탈)예요.{" "}
        {fromServer ? `서버가 받은 이벤트 ${total}개로 셌어요.` : `이 브라우저에 남은 이벤트 ${total}개로 셌어요.`}
      </p>
      {rows && (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="funnel">
            <thead>
              <tr>
                <th scope="col">단계</th>
                <th scope="col">하는 일</th>
                <th scope="col">이벤트</th>
                <th scope="col" className={styles.num}>
                  도달
                </th>
                <th scope="col" className={styles.num}>
                  이탈
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.step} data-testid="funnel-row">
                  <td>{r.step}</td>
                  <td>{r.label}</td>
                  <td>
                    <code>{r.event}</code>
                    {r.role && <span className={styles.role}> ({r.role})</span>}
                  </td>
                  <td className={styles.num} data-testid="reached">
                    {r.reached}
                  </td>
                  <td className={styles.num} data-testid="dropped">
                    {r.dropped}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kpis && (
        <>
          <h2 className={styles.subtitle}>작업 지표</h2>
          <p className={styles.note}>강사님 KPI(FR-49, db 탭 5번). 서버 시각으로 셌고, 셀 건이 없으면 &apos;—&apos;예요.</p>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="kpis">
              <thead>
                <tr>
                  <th scope="col">지표</th>
                  <th scope="col" className={styles.num}>
                    값
                  </th>
                  <th scope="col" className={styles.num}>
                    건수
                  </th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((k) => (
                  <tr key={k.key} data-testid="kpi-row" data-key={k.key}>
                    <td>{k.label}</td>
                    <td className={styles.num}>{k.value === null ? "—" : `${k.value}${k.unit}`}</td>
                    <td className={styles.num}>{k.count}</td>
                    <td>{k.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
