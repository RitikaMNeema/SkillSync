import { Funnel, FunnelChart as ReFunnelChart, LabelList, ResponsiveContainer, Tooltip } from "recharts";
import type { FunnelMetric } from "../../types/analytics";

export function FunnelChart({ data }: { data: FunnelMetric }) {
  const items = [
    { value: data.viewed, name: "Viewed", fill: "#0a66c2" },
    { value: data.saved, name: "Saved", fill: "#6aa3e1" },
    { value: data.submitted, name: "Submitted", fill: "#b3d3f3" }
  ];

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ReFunnelChart>
          <Tooltip />
          <Funnel dataKey="value" data={items} isAnimationActive>
            <LabelList position="right" fill="#333" stroke="none" dataKey="name" />
          </Funnel>
        </ReFunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
