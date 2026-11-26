import { useEffect, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router"
import { toolOpened } from "../lib/telemetry"
import { supabase } from "../lib/supabase"
import { stripHandleSuffix } from "../lib/account"
import { CreatorSeal } from "../brand/Signature"
import { DEFAULT_BRAND, logoToDataUrl, readBrand, type Brand } from "../brand/brand"
import { Suite, type Who } from "../analysis/Suite"
import { Home } from "../analysis/Home"
import { unit } from "../analysis/model"

/* Live Game Analysis ("/analysis"). With nothing open: New analysis; "?view=library" is Your Library, "?folder=" opens a folder;
   "?item=ID" opens a shot or a video in the edit suite. "?open=ID" (Brain Dump links) opens the item too; an id that is gone shows "not found" with a way back. */

export default function AnalysisPage() {
  useEffect(() => { toolOpened("analysis") }, [])
  const navigate = useNavigate()
  const loc = useLocation()
  const qs = new URLSearchParams(loc.search)
  const item = qs.get("item") ?? qs.get("open"), folder = qs.get("folder"), view = folder ? "folder" : qs.get("view") === "library" ? "library" : qs.get("view") === "bin" ? "bin" : "new"
  const [user, setUser] = useState<Who | null>(null)
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [handle, setHandle] = useState("")
  const [logo, setLogo] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user
      if (!u) { navigate("/", { replace: true }); return }
      setUser({ id: u.id, email: u.email ?? "" })
      supabase.from("profiles").select("handle, brand").eq("id", u.id).maybeSingle().then(({ data }) => {
        const h: string = (data as any)?.handle || ""
        setHandle(h && stripHandleSuffix(h, u.id, u.email) === h ? h : "")
        setBrand(readBrand((data as any)?.brand))
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let off = false
    setLogo(null)
    if (brand.logo) logoToDataUrl(brand.logo).then(d => { if (!off) setLogo(d) })
    return () => { off = true }
  }, [brand.logo])

  /** Your seal, bottom right of a picture this size */
  const sealFor = (w: number, h: number): ReactNode => {
    const u = unit(w)
    return (
      <g data-seal="1" transform={`translate(${w - 8 * u},${h - 8 * u}) scale(${1.25 * u})`} style={{ pointerEvents: "none" }}>
        <CreatorSeal brand={brand} handle={handle} logo={logo} pill="rgba(0,0,0,0.62)" />
      </g>
    )
  }

  if (!user) return <div style={{ height: "100vh", background: "#17181b" }} />
  if (item) return <Suite key={item} user={user} itemId={item} sealFor={sealFor} />
  return <Home user={user} view={view} folderParam={folder} sealFor={sealFor} />
}
