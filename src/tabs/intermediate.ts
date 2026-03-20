import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
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

function createCheckerTexture() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')!
  for(let i=0; i<8; i++) {
    for(let j=0; j<8; j++) {
      ctx.fillStyle = (i+j)%2 === 0 ? '#44ccff' : '#002244'
      ctx.fillRect(i*64, j*64, 64, 64)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export const initIntermediateTab: TabInitFn = () => {
  const views: View[] = []

  // 1. Textures
  const vTex = createStandardView('view-int-texture')
  vTex.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1.5).translateY(2))
  const texGeo = new THREE.BoxGeometry(2, 2, 2)
  const texMap = createCheckerTexture()
  const texMat = new THREE.MeshStandardMaterial({ map: texMap, roughness: 0.5 })
  const texBox = new THREE.Mesh(texGeo, texMat)
  vTex.scene.add(texBox)
  vTex.disposables.push(texGeo, texMat, texMap)
  vTex.update = (dt) => { texBox.rotation.y += dt * 0.2; texBox.rotation.x += dt * 0.2 }
  views.push(vTex)

  // 2. PBR
  const vPbr = createStandardView('view-int-pbr')
  vPbr.scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const pLight = new THREE.DirectionalLight(0xffffff, 2); pLight.position.set(5, 3, 5); vPbr.scene.add(pLight)
  
  const textureLoader = new THREE.TextureLoader()
  const pGeo = new THREE.SphereGeometry(1.2, 64, 64)
  const pMat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    map: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg'),
    normalMap: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg'),
    roughnessMap: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg'),
    metalness: 0.1
  })

  const pSphere = new THREE.Mesh(pGeo, pMat)
  vPbr.scene.add(pSphere)
  vPbr.disposables.push(pGeo, pMat)
  vPbr.update = (dt) => { pSphere.rotation.y += dt * 0.1 }
  views.push(vPbr)

  // 3. Env Map (Realtime CubeCamera Reflection)
  const vEnv = createStandardView('view-int-env')
  
  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget)
  vEnv.scene.add(cubeCamera)

  const envSphGeo = new THREE.SphereGeometry(1.0, 64, 64)
  const envSphMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0, envMap: cubeRenderTarget.texture })
  const envSph = new THREE.Mesh(envSphGeo, envSphMat)
  vEnv.scene.add(envSph)

  const orbitNodes = new THREE.Group()
  const orbGeo = new THREE.TorusGeometry(0.3, 0.1, 16, 32)
  for(let i=0; i<8; i++) {
    const orbMat = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color().setHSL(i/8, 1, 0.5), 
      emissive: new THREE.Color().setHSL(i/8, 1, 0.5), 
      emissiveIntensity: 2 
    })
    const mesh = new THREE.Mesh(orbGeo, orbMat)
    mesh.position.set(Math.sin(i/8 * Math.PI*2)*2.5, Math.sin(i*2)*1, Math.cos(i/8 * Math.PI*2)*2.5)
    mesh.rotation.x = Math.random() * Math.PI
    mesh.rotation.y = Math.random() * Math.PI
    orbitNodes.add(mesh)
    vEnv.disposables.push(orbMat)
  }
  vEnv.scene.add(orbitNodes)
  vEnv.disposables.push(cubeRenderTarget, envSphGeo, envSphMat, orbGeo)

  vEnv.update = (dt) => {
    orbitNodes.rotation.y += dt * 0.5
    orbitNodes.rotation.z += dt * 0.2
    orbitNodes.children.forEach(c => c.rotation.x += dt)
  }
  vEnv.render = (renderer) => {
    // Hide sphere before snapping cubemap!
    envSph.visible = false
    cubeCamera.update(renderer, vEnv.scene)
    envSph.visible = true
    renderer.render(vEnv.scene, vEnv.camera)
  }
  views.push(vEnv)

  // 4. GLTF
  const vGltf = createStandardView('view-int-gltf')
  vGltf.scene.add(new THREE.AmbientLight(0xffffff, 1), new THREE.DirectionalLight(0xffffff, 2).translateY(5))
  const loader = new GLTFLoader()
  let gModel: THREE.Object3D | null = null
  loader.load('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF/Duck.gltf', (gltf) => {
    gModel = gltf.scene
    const box = new THREE.Box3().setFromObject(gModel)
    const center = box.getCenter(new THREE.Vector3())
    gModel.position.sub(center) // Center it
    vGltf.scene.add(gModel)
  })
  vGltf.update = (dt) => { if (gModel) gModel.rotation.y += dt * 0.5 }
  views.push(vGltf)

  // 5. Raycasting
  const vRay = createStandardView('view-int-raycast')
  vRay.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  const rGroup = new THREE.Group()
  const rGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
  const rMatDef = new THREE.MeshStandardMaterial({ color: '#ffffff' })
  const rMatHov = new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#550000' })
  vRay.disposables.push(rGeo, rMatDef, rMatHov)
  
  const rObjs: THREE.Mesh[] = []
  for(let i=0; i<40; i++) {
    const m = new THREE.Mesh(rGeo, rMatDef)
    m.position.set((Math.random()-0.5)*6, (Math.random()-0.5)*6, (Math.random()-0.5)*6)
    m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI)
    rGroup.add(m)
    rObjs.push(m)
  }
  vRay.scene.add(rGroup)
  
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2(-1000, -1000)
  let hovered: THREE.Mesh | null = null
  
  const onMove = (e: MouseEvent) => {
    const rect = vRay.element.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }
  window.addEventListener('mousemove', onMove)
  
  const oldCleanup = vRay.cleanup.bind(vRay)
  vRay.cleanup = () => { 
    window.removeEventListener('mousemove', onMove)
    oldCleanup() 
  }
  
  vRay.update = (dt) => {
    rGroup.rotation.y += dt * 0.1
    raycaster.setFromCamera(mouse, vRay.camera)
    const hits = raycaster.intersectObjects(rObjs)
    if(hits.length > 0) {
      const obj = hits[0].object as THREE.Mesh
      if(hovered !== obj) {
        if(hovered) hovered.material = rMatDef
        hovered = obj
        hovered.material = rMatHov
      }
    } else {
      if(hovered) { hovered.material = rMatDef; hovered = null }
    }
  }
  views.push(vRay)

  return views
}
