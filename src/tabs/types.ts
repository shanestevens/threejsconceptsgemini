import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export interface View {
  element: HTMLElement
  scene: THREE.Scene
  camera: THREE.Camera
  controls?: OrbitControls
  update?: (deltaTime: number, elapsedTime: number) => void
  render?: (renderer: THREE.WebGLRenderer) => void
  cleanup: () => void
}

export type TabInitFn = () => View[]
