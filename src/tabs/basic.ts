import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { View, TabInitFn } from './types'

// Helper to quickly boilerplate a standard interactive View box
function createStandardView(id: string): View & { disposables: { dispose: () => void }[] } {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing DOM element ${id}`)
  
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#101014') // dark backdrop for each box
  
  // Add subtle grid helper
  const gridHelper = new THREE.GridHelper(10, 10, '#333333', '#222222')
  scene.add(gridHelper)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(3, 3, 5)

  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true

  return {
    element,
    scene,
    camera,
    controls,
    disposables: [gridHelper], // Track internal things to dispose
    cleanup: function() {
      this.controls?.dispose()
      this.disposables.forEach(d => d.dispose())
    }
  }
}

export const initBasicTab: TabInitFn = () => {
  const views: View[] = []

  // 1. Geometries
  const vGeom = createStandardView('view-basic-geom')
  const geomMat = new THREE.MeshNormalMaterial()
  const matDisposables = [geomMat]
  
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), geomMat)
  box.position.set(-1.5, 0.5, 0)
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), geomMat)
  sphere.position.set(0, 0.6, 0)
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.2, 16, 100), geomMat)
  torus.position.set(1.5, 0.6, 0)

  vGeom.scene.add(box, sphere, torus)
  vGeom.disposables.push(...matDisposables, box.geometry, sphere.geometry, torus.geometry)
  
  vGeom.update = (_dt, et) => {
    box.rotation.y = et * 0.5; box.rotation.x = et * 0.5;
    sphere.position.y = 0.6 + Math.sin(et * 2) * 0.2;
    torus.rotation.x = et; torus.rotation.y = et * 0.3;
  }
  views.push(vGeom)

  // 2. Materials
  const vMat = createStandardView('view-basic-mat')
  vMat.scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1)
  dirLight.position.set(2, 2, 2)
  vMat.scene.add(dirLight)
  
  // Dramatic moving point light for specular highlights
  const pointLightMat = new THREE.PointLight('#ffffff', 15, 20)
  vMat.scene.add(pointLightMat)

  const mBasic = new THREE.MeshBasicMaterial({ color: '#ff00ff', wireframe: true })
  const mLambert = new THREE.MeshLambertMaterial({ color: '#00ff00' })
  const mStandard = new THREE.MeshStandardMaterial({ color: '#0000ff', roughness: 0.2, metalness: 0.8 })
  const mPhysical = new THREE.MeshPhysicalMaterial({ color: '#ffff44', roughness: 0.1, metalness: 0.9, clearcoat: 1.0, clearcoatRoughness: 0.1 })
  
  const mGeo = new THREE.TorusKnotGeometry(0.3, 0.1, 100, 16)
  const sBasic = new THREE.Mesh(mGeo, mBasic); sBasic.position.x = -1.8;
  const sLambert = new THREE.Mesh(mGeo, mLambert); sLambert.position.x = -0.6;
  const sStandard = new THREE.Mesh(mGeo, mStandard); sStandard.position.x = 0.6;
  const sPhysical = new THREE.Mesh(mGeo, mPhysical); sPhysical.position.x = 1.8;

  vMat.scene.add(sBasic, sLambert, sStandard, sPhysical)
  vMat.disposables.push(mGeo, mBasic, mLambert, mStandard, mPhysical)
  
  vMat.update = (dt, et) => {
    sBasic.rotation.y += dt; sBasic.rotation.x += dt * 0.5;
    sLambert.rotation.y += dt; sLambert.rotation.x += dt * 0.5;
    sStandard.rotation.y += dt; sStandard.rotation.x += dt * 0.5;
    sPhysical.rotation.y += dt; sPhysical.rotation.x += dt * 0.5;
    pointLightMat.position.set(Math.sin(et * 2) * 3, 1, Math.cos(et * 2) * 3)
  }
  views.push(vMat)

  // 3. Lighting
  const vLight = createStandardView('view-basic-light')
  const lGeo = new THREE.TorusKnotGeometry(0.8, 0.2, 100, 16)
  const lMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
  const lMesh = new THREE.Mesh(lGeo, lMat); lMesh.position.y = 1
  vLight.scene.add(lMesh)

  const pointLight = new THREE.PointLight('#ff0000', 5, 5)
  const pointHelper = new THREE.PointLightHelper(pointLight, 0.2)
  
  const spotLight = new THREE.SpotLight('#00ff00', 5, 10, Math.PI/6, 0.5, 1)
  const spotHelper = new THREE.SpotLightHelper(spotLight)

  vLight.scene.add(pointLight, pointHelper, spotLight, spotHelper, spotLight.target)
  vLight.disposables.push(lGeo, lMat)
  
  vLight.update = (dt, et) => {
    lMesh.rotation.y += dt
    pointLight.position.set(Math.sin(et)*2, 1, Math.cos(et)*2)
    spotLight.position.set(0, 3, Math.sin(et)*2)
    pointHelper.update()
    spotHelper.update()
  }
  views.push(vLight)

  // 4. Shadows
  const vShadow = createStandardView('view-basic-shadow')
  const sPlaneGeo = new THREE.PlaneGeometry(10, 10)
  const sPlaneMat = new THREE.MeshStandardMaterial({ color: '#aaaaaa' })
  const sPlane = new THREE.Mesh(sPlaneGeo, sPlaneMat)
  sPlane.rotation.x = -Math.PI/2
  sPlane.receiveShadow = true
  
  const sCenterGeo = new THREE.TorusKnotGeometry(0.5, 0.15, 100, 16)
  const sCenterMat = new THREE.MeshStandardMaterial({ color: '#ff8800' })
  const sCenter = new THREE.Mesh(sCenterGeo, sCenterMat)
  sCenter.position.y = 1
  sCenter.castShadow = true
  sCenter.receiveShadow = true

  const sOrb1Geo = new THREE.BoxGeometry(0.4, 0.4, 0.4)
  const sOrb1Mat = new THREE.MeshStandardMaterial({ color: '#00ccff' })
  const sOrb1 = new THREE.Mesh(sOrb1Geo, sOrb1Mat)
  sOrb1.castShadow = true
  sOrb1.receiveShadow = true

  const sOrb2Geo = new THREE.SphereGeometry(0.3, 32, 32)
  const sOrb2Mat = new THREE.MeshStandardMaterial({ color: '#ff00cc' })
  const sOrb2 = new THREE.Mesh(sOrb2Geo, sOrb2Mat)
  sOrb2.castShadow = true
  sOrb2.receiveShadow = true

  const shadowLight = new THREE.DirectionalLight('#ffffff', 3)
  shadowLight.position.set(2, 4, 1)
  shadowLight.castShadow = true
  shadowLight.shadow.mapSize.set(1024, 1024)

  vShadow.scene.add(sPlane, sCenter, sOrb1, sOrb2, shadowLight, new THREE.AmbientLight(0xffffff, 0.3))
  vShadow.disposables.push(sPlaneGeo, sPlaneMat, sCenterGeo, sCenterMat, sOrb1Geo, sOrb1Mat, sOrb2Geo, sOrb2Mat)
  
  vShadow.update = (dt, et) => {
    sCenter.rotation.y += dt
    sCenter.rotation.x += dt * 0.5
    sOrb1.position.set(Math.sin(et)*1.5, 1, Math.cos(et)*1.5)
    sOrb1.rotation.y += dt*2
    sOrb2.position.set(Math.sin(et+Math.PI)*1.5, 1 + Math.sin(et*3)*0.5, Math.cos(et+Math.PI)*1.5)
    shadowLight.position.x = Math.sin(et*0.5) * 3
    shadowLight.position.z = Math.cos(et*0.5) * 3
  }
  views.push(vShadow)

  // 5. Hierarchy
  const vHier = createStandardView('view-basic-hierarchy')
  vHier.scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const pLight = new THREE.PointLight('#ffffff', 3, 10)
  pLight.position.set(0,0,0)
  vHier.scene.add(pLight)
  
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshBasicMaterial({ color: '#ffff00' }))
  const earthNode = new THREE.Group()
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), new THREE.MeshStandardMaterial({ color: '#0088ff' }))
  earth.position.x = 3
  
  const moonNode = new THREE.Group()
  moonNode.position.x = 3 // follows earth translation
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), new THREE.MeshStandardMaterial({ color: '#cccccc' }))
  moon.position.x = 0.8
  moonNode.add(moon)

  earthNode.add(earth)
  
  vHier.scene.add(sun, earthNode, moonNode)
  vHier.disposables.push(sun.geometry, sun.material as THREE.Material, earth.geometry, earth.material as THREE.Material, moon.geometry, moon.material as THREE.Material)
  
  vHier.update = (dt) => {
    sun.rotation.y += dt * 0.2
    earthNode.rotation.y += dt * 0.5
    moonNode.rotation.y += dt * 0.5 // revolve around origin (which matches earth rotation)
    moonNode.children[0].rotation.y += dt * 2 // orbit around earth node
    earth.rotation.y += dt * 2
  }
  views.push(vHier)

  // 6. Cameras
  const vCam = createStandardView('view-basic-camera')
  
  const fovGrp = new THREE.Group()
  for(let i=0; i<50; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshNormalMaterial())
    mesh.position.set((Math.random()-0.5)*5, (Math.random()-0.5)*5, (Math.random()-0.5)*5)
    fovGrp.add(mesh)
    vCam.disposables.push(mesh.geometry, mesh.material as THREE.Material)
  }
  vCam.scene.add(fovGrp)
  
  vCam.update = (dt) => {
    fovGrp.rotation.y += dt * 0.1
    // The user can experience camera perspective distortion by zooming in with scroll wheel
  }
  views.push(vCam)

  return views
}
