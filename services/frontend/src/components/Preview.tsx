import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  type BufferGeometry,
  Color,
  DirectionalLight,
  type Material,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { useApp } from '../context/AppContext'
import type { Catalogue, Layout } from '../lib/api'
import { buildBlueprint } from '../lib/blueprint'

const FOV = 35

/** Paper and ink: black on white, inverted in dark mode. */
const COLOURS = {
  light: { paper: '#ffffff', ink: '#111111' },
  dark: { paper: '#111111', ink: '#f2f2f2' },
}

/**
 * The 3D blueprint of a layout, drawn from the catalogue. It starts straight on from the front
 * and orbits on drag. Rendering happens only when the view changes.
 */
export function Preview({ layout, catalogue }: { layout: Layout; catalogue: Catalogue }) {
  const { theme } = useApp()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current!
    const { paper, ink } = COLOURS[theme]
    const { object, bounds } = buildBlueprint(layout, catalogue, ink)

    const scene = new Scene()
    scene.background = new Color(paper)
    const sun = new DirectionalLight('#ffffff', 1.2)
    sun.position.set(-1, 2, 3)
    scene.add(object, new AmbientLight('#ffffff', 2.2), sun)

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'blueprint-labels'
    labels.domElement.style.color = ink
    labels.domElement.style.setProperty('--paper', paper)
    container.append(renderer.domElement, labels.domElement)

    const camera = new PerspectiveCamera(FOV, 1, 10, 100_000)
    const controls = new OrbitControls(camera, renderer.domElement)
    const centre = bounds.getCenter(new Vector3())
    controls.target.copy(centre)
    // Never below the floor.
    controls.maxPolarAngle = Math.PI / 2

    const render = () => {
      renderer.render(scene, camera)
      labels.render(scene, camera)
    }
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      labels.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }

    // Straight on from the front, far enough back to fit the whole drawing with a margin.
    const size = bounds.getSize(new Vector3())
    const tan = Math.tan((FOV * Math.PI) / 360)
    const aspect = container.clientWidth / container.clientHeight || 1
    const distance = Math.max(size.y / 2 / tan, size.x / 2 / (tan * aspect)) * 1.15
    camera.position.set(centre.x, centre.y, bounds.max.z + distance)
    controls.update()

    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    return () => {
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

  return <div ref={ref} className="blueprint" role="img" aria-label="3D preview of the design" />
}
