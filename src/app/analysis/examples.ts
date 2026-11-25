import { createFolder, createItem, itemPicPath, uploadPic, type Folder } from "./items"
import { newId } from "./model"
import { keepVideo } from "./videoStore"
import { pendingFiles } from "./Suite"

/* The three examples on the welcome page. Opening one copies it into an Examples folder in your Library,
   marks and all, so you can take it apart, change it and render it like your own. */

export const EXAMPLES = [
  { title: "One jumps. Nine wait.", sub: "Shot · build-up against a block", kind: "shot" as const, thumb: "/examples/ex1-card.jpg", key: "ex1", pic: "/examples/ex1.jpg" },
  { title: "Ten behind the ball.", sub: "Shot · focus on the break", kind: "shot" as const, thumb: "/examples/ex4-card.jpg", key: "ex4", pic: "/examples/ex4.jpg" },
  { title: "Man for man.", sub: "Video · freeze and build · 0:09", kind: "video" as const, thumb: "/examples/man-for-man.jpg", key: "vid", pic: "/examples/man-for-man-clip.mp4" },
]

let cache: Promise<any> | null = null
const data = () => (cache ??= fetch("/examples/examples.json").then(r => { if (!r.ok) throw new Error("examples"); return r.json() }).catch(e => { cache = null; throw e }))

/** Copies example k into your Examples folder and gives back the new item's id */
export async function openExample(userId: string, k: number, folders: Folder[]): Promise<string> {
  const ex = EXAMPLES[k], all = await data(), d = all[ex.key]
  const folder = folders.find(f => f.name === "Examples" && !f.parent_id) ?? await createFolder(userId, "Examples", null)
  const id = newId()
  const blob = await (await fetch(ex.pic)).blob()
  if (ex.kind === "shot") {
    // the picture is stored as it is, so every mark stays exactly on its player
    const path = itemPicPath(userId, id)
    await uploadPic(path, blob)
    await createItem(userId, folder.id, "shot", { ...d.data, path, w: d.w, h: d.h }, { id, title: d.title, cover: path, sort: k })
  } else {
    const file = new File([blob], "man-for-man-clip.mp4", { type: "video/mp4" })
    const key = `v-${file.size}-${file.name}`.replace(/[^A-Za-z0-9._-]/g, "_")
    const video = { name: file.name, key, size: file.size, dur: 9, w: d.clip.w, h: d.clip.h, inT: 0, outT: 9, moments: [d.moment] }
    await createItem(userId, folder.id, "video", { v: 2, video, teams: d.teams }, { id, title: d.title, sort: k })
    pendingFiles.set(id, file)
    keepVideo(file, key)
  }
  ;(window as any).posthog?.capture("analysis_example_opened", { example: ex.key })
  return id
}
