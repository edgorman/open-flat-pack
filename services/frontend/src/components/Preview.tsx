import { useEffect, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  type BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Material,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { useApp } from '../context/AppContext'
import type { Catalogue, Layout } from '../lib/api'
import { buildBlueprint, type Palette } from '../lib/blueprint'

const FOV = 30

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
 * read; orbiting or zooming in brings them back. The scale bar's labels always show, and the
 * overall dimensions, drawn last, are placed first.
 */
function declutter(root: HTMLElement) {
  const shown = [...root.querySelectorAll('.blueprint-scale')].map((el) => el.getBoundingClientRect())
  for (const el of [...root.querySelectorAll<HTMLElement>('.blueprint-label')].reverse()) {
    el.style.visibility = ''
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (shown.some((s) => r.left < s.right && s.left < r.right && r.top < s.bottom && s.top < r.bottom)) el.style.visibility = 'hidden'
    else shown.push(r)
  }
}

export function Preview({ layout, catalogue }: { layout: Layout; catalogue: Catalogue }) {
  const { theme } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const [showMeasures, setShowMeasures] = useState(true)
  // The same toggle, read when the scene is rebuilt without the toggle rebuilding it.
  const measuresOn = useRef(true)
  // Set by the scene once it is built, so the toolbar can move the camera and hide the dimensions.
  const view = useRef<{ look: (from: Vector3) => void; measures: (on: boolean) => void } | null>(null)

  useEffect(() => {
    const container = ref.current!
    const palette = PALETTES[theme]
    const { object, measures, floor, bounds } = buildBlueprint(layout, catalogue, palette)

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

    measures.visible = measuresOn.current
    view.current = {
      look,
      measures: (on) => {
        measures.visible = on
        render()
      },
    }
    resize()
    look(START)

    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    return () => {
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
  }, [layout, catalogue, theme])

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
