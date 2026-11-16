import { useMemo } from "react"
import { ReportView } from "./Draw"
import { makeTemplate, type TemplateId } from "./templates"
import { DEFAULT_BRAND } from "../brand/brand"

/* A template drawn small, by the real report engine: what the landing page shows for each starting point.
   It lives in its own file so the landing page loads it only when that section comes near. */
export default function TemplateThumb({ id }: { id: TemplateId }) {
  const report = useMemo(() => makeTemplate(id, "yourname"), [id])
  return <ReportView report={report} brand={DEFAULT_BRAND} handle="yourname" logo={null} media={{}} issue={1} />
}
