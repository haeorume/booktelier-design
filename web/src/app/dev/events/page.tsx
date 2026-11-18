"use client";

import { useEffect, useState } from "react";
import { getRepository } from "@/data";
import { computeFunnel, type FunnelRow } from "@/domain/funnel";
import styles from "./page.module.css";

/**
 * 퍼널(DV-01, FR-40). 데모 플로우 13단계마다 도달 수와 이탈 수를 표로 보인다.
 * 사용자 화면에서 이 주소로 가는 길은 없다(FR-40 ③). 배포 주소에도 둔다(정할 것 3 잠정).
 * 1차는 이벤트가 이 브라우저에만 있어, 이 브라우저에서 만든 책만 센다(D-08).
 */
export default function FunnelPage() {
  const [rows, setRows] = useState<FunnelRow[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    getRepository()
      .listEvents()
      .then((events) => {
        if (!alive) return;
        setRows(computeFunnel(events));
        setTotal(events.length);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>퍼널</h1>
      <p className={styles.note}>
        데모 플로우 13단계마다 그 단계의 이벤트가 남은 책의 수(도달)와, 직전 단계에는 왔지만 이 단계에는 오지 않은 책의 수(이탈)예요. 이 브라우저에 남은 이벤트{" "}
        {total}개로 셌어요.
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
    </main>
  );
}
