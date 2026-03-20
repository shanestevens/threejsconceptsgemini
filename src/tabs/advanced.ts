import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { View, TabInitFn } from './types'

function createStandardView(id: string): View & { disposables: { dispose: () => void }[] } {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing DOM element ${id}`)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#101014')
  const gridHelper = new THREE.GridHelper(10, 10, '#333333', '#222222')
  scene.add(gridHelper)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(3, 3, 5)
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true
  return {
    element, scene, camera, controls, disposables: [gridHelper],
    cleanup: function() { this.controls?.dispose(); this.disposables.forEach(d => d.dispose()) }
  }
}

export const initAdvancedTab: TabInitFn = () => {
  const views: View[] = []

  // 1. InstancedMesh
  const vInst = createStandardView('view-adv-instance')
  vInst.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  
  const count = 10000
  const iGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
  const iMat = new THREE.MeshStandardMaterial({ color: '#00ffcc' })
  const iMesh = new THREE.InstancedMesh(iGeo, iMat, count)
  vInst.disposables.push(iGeo, iMat)
  
  const dummy = new THREE.Object3D()
  for(let i=0; i<count; i++) {
    dummy.position.set((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*10)
    dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
    dummy.updateMatrix()
    iMesh.setMatrixAt(i, dummy.matrix)
  }
  iMesh.instanceMatrix.needsUpdate = true
  vInst.scene.add(iMesh)
  vInst.update = (dt) => { iMesh.rotation.y += dt * 0.1; iMesh.rotation.x += dt * 0.05 }
  views.push(vInst)

  // 2. Particles (Points)
  const vPart = createStandardView('view-adv-particles')
  const pCount = 50000
  const pGeo = new THREE.BufferGeometry()
  const pArr = new Float32Array(pCount * 3)
  for(let i=0; i<pCount*3; i++) { pArr[i] = (Math.random()-0.5)*20 }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3))
  const pMat = new THREE.PointsMaterial({ size: 0.02, color: '#ffffff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
  const pPoints = new THREE.Points(pGeo, pMat)
  vPart.scene.add(pPoints)
  vPart.disposables.push(pGeo, pMat)
  vPart.update = (dt) => { pPoints.rotation.y += dt * 0.05; pPoints.rotation.x += dt * 0.02 }
  views.push(vPart)

  // 3. Custom Shaders
  const vShader = createStandardView('view-adv-shader')
  const sGeo = new THREE.SphereGeometry(1.5, 64, 64)
  const sMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv; vPos = position;
        vec3 pos = position;
        pos.x += sin(pos.y * 5.0 + uTime * 3.0) * 0.2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vec3 color = vec3(0.5 + 0.5*sin(uTime + vUv.x*10.0), vUv.y, 0.5 + 0.5*cos(uTime + vPos.z));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    wireframe: true
  })
  const sMesh = new THREE.Mesh(sGeo, sMat)
  vShader.scene.add(sMesh)
  vShader.disposables.push(sGeo, sMat)
  vShader.update = (dt, et) => { sMat.uniforms.uTime.value = et; sMesh.rotation.y += dt * 0.2 }
  views.push(vShader)

  // 4. Render Targets
  const vTarget = createStandardView('view-adv-target')
  vTarget.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  
  // The secondary scene we want to render
  const secondaryCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  secondaryCamera.position.set(0, 0, 3)
  const secObj = new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.2, 50, 16), new THREE.MeshStandardMaterial({ color: '#ff00aa' }))
  
  const secondaryScene = new THREE.Scene()
  secondaryScene.background = new THREE.Color('#220022')
  secondaryScene.add(secObj, new THREE.AmbientLight(0xffffff, 1))

  const renderTarget = new THREE.WebGLRenderTarget(512, 512)
  vTarget.disposables.push(secObj.geometry, secObj.material as THREE.Material, renderTarget)

  // The TV screen displaying the renderTarget
  const tvGeo = new THREE.BoxGeometry(2, 2, 0.1)
  const tvMat = new THREE.MeshBasicMaterial({ map: renderTarget.texture })
  const tvMesh = new THREE.Mesh(tvGeo, tvMat)
  vTarget.scene.add(tvMesh)
  vTarget.disposables.push(tvGeo, tvMat)

  vTarget.update = (dt) => {
    secObj.rotation.y += dt; secObj.rotation.x += dt
    tvMesh.rotation.y = Math.sin(Date.now()*0.001) * 0.2 // gently look around
  }
  vTarget.render = (renderer) => {
    // 1. Save standard state
    const currentRenderTarget = renderer.getRenderTarget()
    const autoClear = renderer.autoClear

    // 2. Render secondary scene to the RenderTarget
    renderer.setRenderTarget(renderTarget)
    renderer.setClearColor('#000000', 1)
    renderer.clear()
    renderer.render(secondaryScene, secondaryCamera)

    // 3. Restore state & render the main scene to the screen (viewport/scissor are already set by main loop)
    renderer.setRenderTarget(currentRenderTarget)
    renderer.autoClear = autoClear
    renderer.render(vTarget.scene, vTarget.camera)
  }
  views.push(vTarget)

  // 5. Post-Processing (Bloom)
  const vBloom = createStandardView('view-adv-bloom')
  vBloom.scene.add(new THREE.AmbientLight(0xffffff, 0.2))
  vBloom.scene.add(new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  
  const bGroup = new THREE.Group()
  const bGeo = new THREE.IcosahedronGeometry(0.5, 0)
  const bMat1 = new THREE.MeshStandardMaterial({ color: '#0022ff', emissive: '#0022ff', emissiveIntensity: 2 })
  const bMat2 = new THREE.MeshStandardMaterial({ color: '#ff0055', emissive: '#ff0055', emissiveIntensity: 2 })
  vBloom.disposables.push(bGeo, bMat1, bMat2)
  
  for(let i=0; i<20; i++) {
    const mat = i % 3 === 0 ? bMat2 : bMat1
    const mesh = new THREE.Mesh(bGeo, mat)
    mesh.position.set((Math.random()-0.5)*5, (Math.random()-0.5)*5, (Math.random()-0.5)*5)
    bGroup.add(mesh)
  }
  vBloom.scene.add(bGroup)

  vBloom.update = (dt) => { bGroup.rotation.y += dt * 0.2; bGroup.rotation.x += dt * 0.2 }

  // We set up Composer inside the render method to ensure it matches the exact scissor size dynamically
  let composer: EffectComposer | null = null
  let bloomPass: UnrealBloomPass | null = null
  let renderPass: RenderPass | null = null
  let lastW = 0, lastH = 0

  vBloom.render = (renderer) => {
    // Determine the actual pixel dimensions of the viewport
    const rect = vBloom.element.getBoundingClientRect()
    const w = rect.width * renderer.getPixelRatio()
    const h = rect.height * renderer.getPixelRatio()

    if (!composer) {
      // Initialize composer without a render target so it doesn't default to window size
      const target = new THREE.WebGLRenderTarget(w, h)
      composer = new EffectComposer(renderer, target)
      composer.renderToScreen = false

      renderPass = new RenderPass(vBloom.scene, vBloom.camera)
      bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 2.5, 0.2, 0.1)
      composer.addPass(renderPass)
      composer.addPass(bloomPass)
    }

    if (w !== lastW || h !== lastH) {
      composer.setSize(rect.width, rect.height)
      lastW = w; lastH = h;
    }

    // 1. Render Bloom to composer's writeBuffer
    // Temporarily disable scissor for the composer's internal full-texture passes
    const oldScissorTest = renderer.getScissorTest()
    renderer.setScissorTest(false)
    composer.render()
    renderer.setScissorTest(oldScissorTest)

    // 2. We now have the composited result in composer.readBuffer.texture
    // We copy it to the screen viewport.
    
    // We can use a simple manual orthographic blit
    if (!(vBloom as any)._blitScene) {
      const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const blitScene = new THREE.Scene()
      const mat = new THREE.MeshBasicMaterial({ map: composer.readBuffer.texture, depthTest: false, depthWrite: false })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
      blitScene.add(quad)
      ;(vBloom as any)._blitScene = blitScene
      ;(vBloom as any)._orthoCam = orthoCam
      ;(vBloom as any)._blitMat = mat
    }

    const blitMat = (vBloom as any)._blitMat as THREE.MeshBasicMaterial
    blitMat.map = composer.readBuffer.texture
    
    // Use the already setup viewport and scissor to draw the quad
    renderer.render((vBloom as any)._blitScene, (vBloom as any)._orthoCam)
  }

  const origCleanup = vBloom.cleanup.bind(vBloom)
  vBloom.cleanup = () => {
    origCleanup()
    if (composer) {
      composer.dispose(); renderPass?.dispose(); bloomPass?.dispose()
      const bm = (vBloom as any)._blitMat; if (bm) bm.dispose()
    }
  }

  views.push(vBloom)

  return views
}
