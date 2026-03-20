import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { View, TabInitFn } from './types'
import RAPIER from '@dimforge/rapier3d-compat'

function createStandardView(id: string): View & { disposables: { dispose: () => void }[], world: RAPIER.World } {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing DOM element ${id}`)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#101014')
  const gridHelper = new THREE.GridHelper(10, 10, '#333333', '#222222')
  scene.add(gridHelper)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(5, 5, 8)
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true
  
  const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 })

  return {
    element, scene, camera, controls, disposables: [gridHelper], world,
    cleanup: function() { 
      this.controls?.dispose()
      this.disposables.forEach(d => d.dispose()) 
      this.world.free()
    }
  }
}

export const initPhysicsTab: TabInitFn = async () => {
  await RAPIER.init()
  const views: View[] = []

  // 1. Rigid Bodies & Colliders (Falling boxes)
  const vRigid = createStandardView('view-phys-rigid')
  vRigid.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  vRigid.camera.position.set(8, 8, 12)
  
  // Floor
  const floorBodyDesc = RAPIER.RigidBodyDesc.fixed()
  const floorBody = vRigid.world.createRigidBody(floorBodyDesc)
  const floorColliderDesc = RAPIER.ColliderDesc.cuboid(5.0, 0.1, 5.0)
  vRigid.world.createCollider(floorColliderDesc, floorBody)
  // Floor Mesh
  const fGeo = new THREE.BoxGeometry(10, 0.2, 10)
  const fMat = new THREE.MeshStandardMaterial({ color: '#555555' })
  const fMesh = new THREE.Mesh(fGeo, fMat)
  fMesh.position.y = -0.1
  vRigid.scene.add(fMesh)
  vRigid.disposables.push(fGeo, fMat)

  // Cubes
  const cGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
  const cMat1 = new THREE.MeshStandardMaterial({ color: '#ff0044', roughness: 0.2, metalness: 0.1 })
  const cMat2 = new THREE.MeshStandardMaterial({ color: '#00ccff', roughness: 0.2, metalness: 0.1 })
  vRigid.disposables.push(cGeo, cMat1, cMat2)
  const rigidBodies: { mesh: THREE.Mesh, body: RAPIER.RigidBody }[] = []

  for(let i=0; i<80; i++) {
    const mesh = new THREE.Mesh(cGeo, i%2===0 ? cMat1 : cMat2)
    mesh.castShadow = true
    mesh.receiveShadow = true
    vRigid.scene.add(mesh)
    
    // Stack them high
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation((Math.random()-0.5), 2 + i*0.8, (Math.random()-0.5))
    const body = vRigid.world.createRigidBody(bodyDesc)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25)
    // Add some bounce
    colliderDesc.setRestitution(0.4)
    vRigid.world.createCollider(colliderDesc, body)
    
    rigidBodies.push({ mesh, body })
  }

  vRigid.update = () => {
    vRigid.world.step()
    for(const { mesh, body } of rigidBodies) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }
  views.push(vRigid)


  // 2. Kinematic Bodies (Sweeper)
  const vKin = createStandardView('view-phys-kinematic')
  vKin.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  vKin.camera.position.set(0, 8, 8)
  
  // Floor
  const kfBody = vKin.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  vKin.world.createCollider(RAPIER.ColliderDesc.cuboid(5.0, 0.1, 5.0), kfBody)
  const kfMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#333333' }))
  kfMesh.position.y = -0.1
  vKin.scene.add(kfMesh)
  vKin.disposables.push(kfMesh.geometry, kfMesh.material as THREE.Material)

  // Sweeper Arm (Kinematic)
  const armBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.5, 0)
  const armBody = vKin.world.createRigidBody(armBodyDesc)
  const armColliderDesc = RAPIER.ColliderDesc.cuboid(2.0, 0.2, 0.2)
  vKin.world.createCollider(armColliderDesc, armBody)
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#ffaa00' }))
  vKin.scene.add(armMesh)
  vKin.disposables.push(armMesh.geometry, armMesh.material as THREE.Material)

  // Dynamic Balls
  const bGeo = new THREE.SphereGeometry(0.3, 16, 16)
  const bMat = new THREE.MeshStandardMaterial({ color: '#00ffaa' })
  vKin.disposables.push(bGeo, bMat)
  const kinBodies: { mesh: THREE.Mesh, body: RAPIER.RigidBody }[] = []
  for(let i=0; i<40; i++) {
    const mesh = new THREE.Mesh(bGeo, bMat)
    vKin.scene.add(mesh)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation((Math.random()-0.5)*4, 3 + i*0.5, (Math.random()-0.5)*4)
    const body = vKin.world.createRigidBody(bodyDesc)
    const colDesc = RAPIER.ColliderDesc.ball(0.3)
    colDesc.setRestitution(0.7) // super bouncy
    vKin.world.createCollider(colDesc, body)
    kinBodies.push({ mesh, body })
  }

  vKin.update = (_dt, et) => {
    // Manually push kinematic arm in circle
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), et * 2.0)
    armBody.setNextKinematicRotation(q)
    
    vKin.world.step()
    
    // sync arm
    const at = armBody.translation()
    const ar = armBody.rotation()
    armMesh.position.set(at.x, at.y, at.z)
    armMesh.quaternion.set(ar.x, ar.y, ar.z, ar.w)
    
    // sync balls
    for(const { mesh, body } of kinBodies) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
      
      // wrap around if they fall off
      if (t.y < -5) {
        body.setTranslation({ x: (Math.random()-0.5)*4, y: 5 + Math.random()*2, z: (Math.random()-0.5)*4 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
  }
  views.push(vKin)


  // 3. Joints (Wrecking chain & Tower)
  const vJoint = createStandardView('view-phys-joint')
  vJoint.scene.add(new THREE.AmbientLight(0xffffff, 0.5), new THREE.DirectionalLight(0xffffff, 1).translateY(5))
  vJoint.camera.position.set(6, 6, 12)
  vJoint.controls.target.set(0, 3, 0)

  // Ceiling anchor
  const ceilBody = vJoint.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 6, 0))
  vJoint.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.1, 0.5), ceilBody)
  const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), new THREE.MeshStandardMaterial({ color: '#888888' }))
  ceilMesh.position.y = 6
  vJoint.scene.add(ceilMesh)
  vJoint.disposables.push(ceilMesh.geometry, ceilMesh.material as THREE.Material)

  const chainGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6)
  const chainMat = new THREE.MeshStandardMaterial({ color: '#cccccc' })
  vJoint.disposables.push(chainGeo, chainMat)
  
  let parentBody = ceilBody
  const jointBodies: { mesh: THREE.Mesh, body: RAPIER.RigidBody }[] = []
  
  // 5 links + 1 wrecking ball
  for(let i=0; i<6; i++) {
    const isLast = i === 5
    const geo = isLast ? new THREE.SphereGeometry(0.6, 32, 32) : chainGeo
    const mat = isLast ? new THREE.MeshStandardMaterial({ color: '#ff2222', roughness: 0.1, metalness: 0.5 }) : chainMat
    if(isLast) vJoint.disposables.push(geo, mat)
    
    const mesh = new THREE.Mesh(geo, mat)
    vJoint.scene.add(mesh)
    
    // Perfectly straight alignment to satisfy initial joint constraints! 
    // y = 6.0 - 0.35 (half-height + anchor offset) = 5.65. Next is 5.3, etc.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5.3 - i*0.7, 0) 
    const body = vJoint.world.createRigidBody(bodyDesc)
    
    // Disable sleeping so the swing doesn't inexplicably stop
    bodyDesc.setCanSleep(false)
    
    const colDesc = isLast ? RAPIER.ColliderDesc.ball(0.6) : RAPIER.ColliderDesc.cylinder(0.3, 0.1)
    colDesc.setMass(isLast ? 10.0 : 0.5) // Heavy wrecking ball
    vJoint.world.createCollider(colDesc, body)
    
    if (isLast) {
      // Start the swing perfectly with a massive angular/linear push
      body.applyImpulse({ x: 0, y: 0, z: -80 }, true)
    }

    // Connect to parent using a Spherical Joint
    const jointData = RAPIER.JointData.spherical(
      new RAPIER.Vector3(0, -0.35, 0), // anchor on parent (bottom of it)
      new RAPIER.Vector3(0, 0.35, 0)   // anchor on child (top of it)
    )
    vJoint.world.createImpulseJoint(jointData, parentBody, body, true)
    
    jointBodies.push({ mesh, body })
    parentBody = body
  }

  // Obstacle tower
  const tGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
  const tMat = new THREE.MeshStandardMaterial({ color: '#22ff22' })
  vJoint.disposables.push(tGeo, tMat)
  const towerBodies: { mesh: THREE.Mesh, body: RAPIER.RigidBody }[] = []
  
  // Create a wall of blocks
  for(let y=0; y<6; y++) {
    for(let x=-2; x<=2; x++) {
      const mesh = new THREE.Mesh(tGeo, tMat)
      vJoint.scene.add(mesh)
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x*0.5, 0.25 + y*0.5, 2.0)
      const body = vJoint.world.createRigidBody(bodyDesc)
      vJoint.world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25), body)
      towerBodies.push({ mesh, body })
    }
  }

  // floor for tower
  const jtFloorBody = vJoint.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  vJoint.world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.1, 5), jtFloorBody)
  const jtFMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial({ color: '#444444' }))
  jtFMesh.position.y = -0.1
  vJoint.scene.add(jtFMesh)
  vJoint.disposables.push(jtFMesh.geometry, jtFMesh.material as THREE.Material)

  vJoint.update = () => {
    vJoint.world.step()
    for(const { mesh, body } of [...jointBodies, ...towerBodies]) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
      
      // Auto-reset tower fragments if they fall
      if (t.y < -5 && towerBodies.some(b => b.body === body)) {
        body.setTranslation({ x: (Math.random()-0.5)*3, y: 5 + Math.random()*5, z: 2.0 }, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
  }
  views.push(vJoint)

  return views
}
