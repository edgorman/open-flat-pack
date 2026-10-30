import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  type BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Material,
  type Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { useApp } from '../context/AppContext'
import type { Catalogue, Layout } from '../lib/api'
import { carried } from '../lib/move'
import { buildBlueprint, type Palette } from '../lib/blueprint'

const FOV = 30
/** How long a part must be pressed before it can be dragged, in ms. */
const HOLD_MS = 350

/** Scene colours per theme, matching the page tokens in index.css. */
const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { paper: '#ffffff', ink: '#15171c', accent: '#2753c9' },
  dark: { paper: '#1b1e23', ink: '#e9ebef', accent: '#8fb0ff' },
}

/** Where the camera starts: a little right of the drawing and a little above it. */
const START = new Vector3(0.45, 0.3, 1).normalize()
const FRONT = new Vector3(0, 0, 1)

/**
 * The 3D preview of a layout, drawn from the catalogue: lit like a product shot on a floor with a
 * 10 cm grid and a scale bar. It starts at a three-quarter angle and orbits on drag. Rendering
 * happens only when the view changes.
 */
/**
 * Hides each dimension label that would cover one already shown, since overlapping labels can't be
 * read; orbiting or zooming in brings them back. The scale bar's labels and a tapped part's name
 * always show, and the overall dimensions, drawn last, are placed first.
 */
function declutter(root: HTMLElement) {
  const shown = [...root.querySelectorAll('.blueprint-scale, .blueprint-tag')].map((el) => el.getBoundingClientRect())
  for (const el of [...root.querySelectorAll<HTMLElement>('.blueprint-label')].reverse()) {
    el.style.visibility = ''
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (shown.some((s) => r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom)) el.style.visibility = 'hidden'
    else shown.push(r)
  }
}

/**
 * With `onDrop`, pressing and holding a part picks it up, with everything it holds, to drag across
 * the wall; letting go calls `onDrop` with its index in the layout and where its bottom-left corner
 * was dropped, in mm. `marks` tints parts by index. The camera stays put when the layout changes.
 */
export function Preview({
  layout,
  catalogue,
  marks,
  onDrop,
}: {
  layout: Layout
  catalogue: Catalogue
  marks?: Record<number, string>
  onDrop?: (index: number, x: number, y: number) => void
}) {
  const { theme } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const [showMeasures, setShowMeasures] = useState(true)
  const [showFronts, setShowFronts] = useState(true)
  // Whether any part hangs on a front slot, so the Doors toggle has something to hide.
  const frontSlots = new Set(catalogue.parts.flatMap((p) => p.offers.filter((s) => s.kind === 'front').map((s) => s.name)))
  const hasFronts = layout.parts.some(({ article }) =>
    catalogue.parts.some((p) => p.article === article && p.restsOn.some((name) => frontSlots.has(name))),
  )
  // The same toggles, read when the scene is rebuilt without the toggles rebuilding it.
  const measuresOn = useRef(true)
  const frontsOn = useRef(true)
  // Set by the scene once it is built, so the toolbar can move the camera and hide the dimensions
  // and the fronts.
  const view = useRef<{ look: (from: Vector3) => void; measures: (on: boolean) => void; fronts: (on: boolean) => void } | null>(
    null,
  )
  // Where the camera was when the scene was last torn down, so a rebuild keeps the view.
  const saved = useRef<{ position: Vector3; target: Vector3 } | null>(null)
  const dropped = useRef(onDrop)
  useEffect(() => {
    dropped.current = onDrop
  })

  useEffect(() => {
    const container = ref.current!
    const palette = PALETTES[theme]
    const { object, fronts, measures, floor, bounds } = buildBlueprint(layout, catalogue, palette, marks)

    const scene = new Scene()
    scene.background = new Color(palette.paper)
    const centre = bounds.getCenter(new Vector3())
    const { radius } = bounds.getBoundingSphere(new Sphere())

    // A soft sky with a key light from the upper left, casting the shadow onto the floor.
    const sun = new DirectionalLight('#ffffff', theme === 'dark' ? 1.6 : 2.4)
    sun.position.copy(centre).add(new Vector3(-0.4, 1, 0.7).multiplyScalar(radius * 3))
    sun.target.position.copy(centre)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.radius = 8
    sun.shadow.bias = -0.0005
    Object.assign(sun.shadow.camera, { left: -radius * 1.5, right: radius * 1.5, top: radius * 1.5, bottom: -radius * 1.5, near: 1, far: radius * 8 })
    scene.add(object, measures, floor, new HemisphereLight('#ffffff', theme === 'dark' ? '#3a3f47' : '#e6e8ec', 2.6), sun, sun.target)

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = VSMShadowMap
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'blueprint-labels'
    container.append(renderer.domElement, labels.domElement)

    const camera = new PerspectiveCamera(FOV, 1, 10, 100_000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(centre)
    // Never below the floor.
    controls.maxPolarAngle = Math.PI / 2 - 0.02

    const render = () => {
      renderer.render(scene, camera)
      labels.render(scene, camera)
      declutter(labels.domElement)
    }
    // Far enough back along `from` to fit the whole drawing, with a margin, in the narrower field.
    const look = (from: Vector3) => {
      const tan = Math.tan((FOV * Math.PI) / 360) * Math.min(1, camera.aspect)
      camera.position.copy(centre).addScaledVector(from, (radius / tan) * 1.1)
      controls.target.copy(centre)
      controls.update()
      render()
    }
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      labels.setSize(w, h)
      camera.aspect = w / h || 1
      camera.updateProjectionMatrix()
      render()
    }

    // Tapping a part names it in a tag where it was tapped; tapping elsewhere clears the tag. A drag
    // that orbits the view is not a tap.
    const tag = new CSS2DObject(Object.assign(document.createElement('span'), { className: 'blueprint-tag' }))
    tag.visible = false
    scene.add(tag)
    const raycaster = new Raycaster()
    const aim = (x: number, y: number) => {
      const r = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
    }
    const partAt = (x: number, y: number) => {
      aim(x, y)
      const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent))
      const hit = raycaster.intersectObject(object).find((i) => shown(i.object))
      let part: Object3D | null = hit?.object ?? null
      while (part && !part.userData.name) part = part.parent
      return hit && part ? { part, point: hit.point } : null
    }
    // Where the pointer meets the wall plane, which every part's front stands on.
    const wall = new Plane(new Vector3(0, 0, 1), 0)
    const onWall = (x: number, y: number) => {
      aim(x, y)
      return raycaster.ray.intersectPlane(wall, new Vector3())
    }

    // Holding a part still for a moment picks it up, and the orbit stops while it is dragged.
    const down = new Vector2()
    let hold = 0
    let drag: { index: number; start: Vector3; moving: { o: Object3D; at: Vector3 }[]; by: Vector3 } | null = null
    const onDown = (e: PointerEvent) => {
      down.set(e.clientX, e.clientY)
      window.clearTimeout(hold)
      if (!dropped.current) return
      hold = window.setTimeout(() => {
        const hit = partAt(down.x, down.y)
        const start = onWall(down.x, down.y)
        if (!hit || !start) return
        const index = hit.part.userData.part as number
        const held = carried(layout, catalogue, index)
        const moving: { o: Object3D; at: Vector3 }[] = []
        object.traverse((o) => {
          if (o.userData.name && held.has(o.userData.part as number)) moving.push({ o, at: o.position.clone() })
        })
        controls.enabled = false
        tag.visible = false
        drag = { index, start, moving, by: new Vector3() }
        container.classList.add('dragging')
        navigator.vibrate?.(15)
        render()
      }, HOLD_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) {
        if (down.distanceTo(new Vector2(e.clientX, e.clientY)) > 5) window.clearTimeout(hold)
        return
      }
      const at = onWall(e.clientX, e.clientY)
      if (!at) return
      drag.by.set(at.x - drag.start.x, at.y - drag.start.y, 0)
      for (const { o, at: from } of drag.moving) o.position.copy(from).add(drag.by)
      render()
    }
    const onUp = (e: PointerEvent) => {
      window.clearTimeout(hold)
      if (drag) {
        const { index, moving, by } = drag
        drag = null
        controls.enabled = true
        container.classList.remove('dragging')
        // Back where it was until the new layout, if any, redraws the scene.
        for (const { o, at } of moving) o.position.copy(at)
        render()
        const from = layout.parts[index]
        dropped.current?.(index, from.x + by.x, from.y + by.y)
        return
      }
      if (down.distanceTo(new Vector2(e.clientX, e.clientY)) > 5) return
      const hit = partAt(e.clientX, e.clientY)
      tag.visible = !!hit
      if (hit) {
        tag.element.textContent = hit.part.userData.name
        tag.position.copy(hit.point)
      }
      render()
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerup', onUp)

    measures.visible = measuresOn.current
    fronts.visible = frontsOn.current
    view.current = {
      look,
      measures: (on) => {
        measures.visible = on
        render()
      },
      fronts: (on) => {
        fronts.visible = on
        tag.visible = false
        render()
      },
    }
    resize()
    if (saved.current) {
      camera.position.copy(saved.current.position)
      controls.target.copy(saved.current.target)
      controls.update()
      render()
    } else look(START)

    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    return () => {
      window.clearTimeout(hold)
      saved.current = { position: camera.position.clone(), target: controls.target.clone() }
      view.current = null
      observer.disconnect()
      controls.dispose()
      scene.traverse((o) => {
        if ('geometry' in o) (o.geometry as BufferGeometry).dispose()
        if ('material' in o) (o.material as Material).dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      labels.domElement.remove()
    }
  }, [layout, catalogue, theme, marks])

  return (
    <div className="blueprint">
      <div ref={ref} className="blueprint-canvas" role="img" aria-label="3D preview of the design" />
      <div className="blueprint-tools">
        <button
          type="button"
          className="chip"
          aria-pressed={showMeasures}
          onClick={() => {
            measuresOn.current = !showMeasures
            setShowMeasures(!showMeasures)
            view.current?.measures(!showMeasures)
          }}
        >
          Dimensions
        </button>
        {hasFronts && (
          <button
            type="button"
            className="chip"
            aria-pressed={showFronts}
            onClick={() => {
              frontsOn.current = !showFronts
              setShowFronts(!showFronts)
              view.current?.fronts(!showFronts)
            }}
          >
            Doors
          </button>
        )}
        <button type="button" className="chip" onClick={() => view.current?.look(FRONT)}>
          Front
        </button>
        <button type="button" className="chip" onClick={() => view.current?.look(START)}>
          Reset
        </button>
      </div>
    </div>
  )
}
