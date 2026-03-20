import './style.css'
import * as THREE from 'three'

import type { View } from './tabs/types'
import { initBasicTab } from './tabs/basic'
import { initIntermediateTab } from './tabs/intermediate'
import { initAdvancedTab } from './tabs/advanced'
import { initPhysicsTab } from './tabs/physics'
import { initExpertTab } from './tabs/expert'

const canvas = document.querySelector('#bg-canvas') as HTMLCanvasElement

// Initialize global renderer
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

let activeViews: View[] = []

function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer) {
  const canvas = renderer.domElement
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const needResize = canvas.width !== width || canvas.height !== height
  if (needResize) {
    renderer.setSize(width, height, false)
  }
  return needResize
}

// --- Tab Switching Logic ---
const tabsBtn = document.querySelectorAll('.tab-btn')
const contents = document.querySelectorAll('.tab-content')

async function switchTab(target: string) {
  tabsBtn.forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-target="${target}"]`)?.classList.add('active')
  
  contents.forEach(c => c.classList.remove('active'))
  
  // Cleanup previously active views
  activeViews.forEach(v => v.cleanup())
  activeViews = []
  
  // Scroll to top
  window.scrollTo(0, 0)
  
  // Load new tab content
  let newViews: View[] = []
  if (target === 'basic') newViews = initBasicTab() as View[]
  if (target === 'intermediate') newViews = initIntermediateTab() as View[]
  if (target === 'advanced') newViews = initAdvancedTab() as View[]
  if (target === 'expert') newViews = initExpertTab() as View[]
  if (target === 'physics') {
    newViews = await initPhysicsTab()
  }

  // Check if we are still the active tab before committing
  if (document.querySelector(`[data-target="${target}"]`)?.classList.contains('active')) {
    activeViews = newViews
    document.getElementById(target)?.classList.add('active')
  } else {
    // If user clicked away while loading, cleanup
    newViews.forEach(v => v.cleanup())
  }
}

tabsBtn.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = (e.currentTarget as HTMLElement).dataset.target
    if (target) switchTab(target)
  })
})

// --- Render Loop ---
const clock = new THREE.Clock()
let previousTime = 0

function render() {
  resizeRendererToDisplaySize(renderer)

  const elapsedTime = clock.getElapsedTime()
  const deltaTime = elapsedTime - previousTime
  previousTime = elapsedTime

  // Clear entire canvas without scissor
  renderer.setScissorTest(false)
  renderer.clear()
  
  // Enable scissor test to draw only in designated areas
  renderer.setScissorTest(true)

  activeViews.forEach(view => {
    const element = view.element
    if (!element) return

    const rect = element.getBoundingClientRect()
    
    // Check if the element is visible on the screen
    const isVisible = (
      rect.bottom > 0 &&
      rect.top < renderer.domElement.clientHeight &&
      rect.right > 0 &&
      rect.left < renderer.domElement.clientWidth &&
      element.offsetParent !== null
    )

    if (!isVisible) return

    // Update animations and controls
    view.update?.(deltaTime, elapsedTime)
    view.controls?.update()

    // Map screen coordinates to WebGL coordinates (bottom-left origin)
    const width = rect.right - rect.left
    const height = rect.bottom - rect.top
    const left = rect.left
    const bottom = renderer.domElement.clientHeight - rect.bottom

    renderer.setViewport(left, bottom, width, height)
    renderer.setScissor(left, bottom, width, height)

    // Update camera aspect automatically if it's a typical perspective camera
    if ((view.camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = view.camera as THREE.PerspectiveCamera
      cam.aspect = width / height
      cam.updateProjectionMatrix()
    }

    // Render it
    if (view.render) {
      view.render(renderer) // e.g. for EffectComposer
    } else {
      renderer.render(view.scene, view.camera)
    }
  })

  requestAnimationFrame(render)
}

// Initial start
switchTab('basic')
requestAnimationFrame(render)
