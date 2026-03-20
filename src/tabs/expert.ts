import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import type { View, TabInitFn } from './types'

function createStandardView(id: string): View & { disposables: { dispose: () => void }[] } {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing DOM element ${id}`)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#101014')
  
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(2, 2, 4)
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true

  return {
    element, scene, camera, controls, disposables: [],
    cleanup: function() { 
      this.controls?.dispose()
      this.disposables.forEach(d => d.dispose()) 
    }
  }
}

export const initExpertTab: TabInitFn = () => {
  const views: View[] = []

  // 1. Raymarching SDFs
  const vRay = createStandardView('view-exp-raymarch')
  const rGeo = new THREE.PlaneGeometry(2, 2) // Fullscreen quad
  
  const rMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;

      float smin(float a, float b, float k) {
        float h = max(k - abs(a - b), 0.0) / k;
        return min(a, b) - h * h * k * (1.0 / 4.0);
      }

      float map(vec3 p) {
        vec3 s1 = vec3(sin(uTime)*0.5, cos(uTime*1.2)*0.3, 0.0);
        vec3 s2 = vec3(cos(uTime*0.8)*0.4, sin(uTime)*0.4, sin(uTime*1.5)*0.2);
        vec3 s3 = vec3(0.0, -0.4, 0.0); // static bottom
        
        float d1 = length(p - s1) - 0.3;
        float d2 = length(p - s2) - 0.25;
        float d3 = length(p - s3) - 0.35;
        
        return smin(smin(d1, d2, 0.4), d3, 0.3);
      }

      vec3 calcNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
          map(p + e.xyy) - map(p - e.xyy),
          map(p + e.yxy) - map(p - e.yxy),
          map(p + e.yyx) - map(p - e.yyx)
        ));
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0; 
        
        // Ray setup
        vec3 ro = vec3(0.0, 0.0, 3.0);
        vec3 rd = normalize(vec3(uv, -1.0));
        
        float t = 0.0;
        float d = 0.0;
        for(int i=0; i<80; i++) {
          vec3 p = ro + rd * t;
          d = map(p);
          if(d < 0.001 || t > 10.0) break;
          t += d;
        }
        
        if (d < 0.001) {
          vec3 p = ro + rd * t;
          vec3 n = calcNormal(p);
          
          // Iridescent procedural MatCap
          vec3 col = 0.5 + 0.5 * cos(uTime + n.xyx + vec3(0,2,4));
          
          float diff = max(dot(n, normalize(vec3(1, 1, 1))), 0.0);
          col *= diff * 0.6 + 0.4;
          
          // Sharp specular
          float spec = pow(max(dot(reflect(rd, n), normalize(vec3(1,1,1))), 0.0), 64.0);
          gl_FragColor = vec4(col + spec, 1.0);
        } else {
          discard;
        }
      }
    `
  })
  const rMesh = new THREE.Mesh(rGeo, rMat)
  
  // Custom scene bypass rendering a quad over screen
  const rCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const rScene = new THREE.Scene()
  rScene.add(rMesh)
  vRay.disposables.push(rGeo, rMat)
  
  // We override the render and update logic for the raymarcher
  vRay.update = (_dt, et) => { rMat.uniforms.uTime.value = et }
  vRay.render = (renderer) => { renderer.render(rScene, rCamera) }
  views.push(vRay)


  // 2. Curl Noise Particles
  const vCurl = createStandardView('view-exp-curl')
  
  const pCount = 100000
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(pCount * 3)
  const pRand = new Float32Array(pCount)
  for(let i=0; i<pCount; i++) {
    const t = Math.random() * Math.PI * 2
    const u = Math.random() * Math.PI * 2
    const r = Math.random() * 2.0
    pPos[i*3] = r * Math.sin(t) * Math.cos(u)
    pPos[i*3+1] = r * Math.sin(t) * Math.sin(u)
    pPos[i*3+2] = r * Math.cos(t)
    pRand[i] = Math.random()
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute('aRand', new THREE.BufferAttribute(pRand, 1))

  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime;
      attribute float aRand;
      
      // Fake curl-like fluid displacement
      vec3 curlCurve(vec3 p) {
        float n1 = sin(p.y * 3.0 + uTime) * cos(p.z * 3.0);
        float n2 = cos(p.z * 3.0 + uTime) * sin(p.x * 3.0);
        float n3 = sin(p.x * 3.0 + uTime) * cos(p.y * 3.0);
        return vec3(n1, n2, n3);
      }
      
      varying float vRand;
      
      void main() {
        vRand = aRand;
        vec3 pos = position;
        
        // Multi-domain displacement
        vec3 curl = curlCurve(pos);
        pos += curl * 0.5 * sin(uTime * 0.5 + aRand * 6.28);
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = (20.0 / -mvPosition.z) * aRand;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vRand;
      void main() {
        vec2 p = gl_PointCoord.xy - vec2(0.5);
        float d = length(p);
        if (d > 0.5) discard;
        // Soft glowing point
        float alpha = pow(1.0 - (d * 2.0), 1.5) * 0.3;
        
        vec3 col = 0.5 + 0.5 * cos(vRand * 10.0 + vec3(0,2,4));
        gl_FragColor = vec4(col, alpha);
      }
    `
  })
  const pMesh = new THREE.Points(pGeo, pMat)
  vCurl.scene.add(pMesh)
  vCurl.disposables.push(pGeo, pMat)
  vCurl.update = (_dt, et) => {
    pMat.uniforms.uTime.value = et
    pMesh.rotation.y = et * 0.1
  }
  views.push(vCurl)


  // 3. Volumetric Raycasting
  const vVol = createStandardView('view-exp-volume')
  
  const volGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5) // A bit larger
  const volMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // Enter from the front faces!
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      
      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }
      
      float noise(vec3 p) {
        return sin(p.x*6.+uTime)*sin(p.y*6.+uTime*0.8)*sin(p.z*6.+uTime*1.2);
      }
      
      float getDensity(vec3 p) {
        // Spin the noise field
        p.xz *= rot(uTime * 0.4);
        p.yz *= rot(uTime * 0.2);
        
        float d = length(p) - 1.0; // Central sphere boundary
        float n = noise(p);
        // Density is highest in center, eroded by noise
        return max(0.0, -d + n * 0.4) * 3.0;
      }

      void main() {
        // Start exactly on the surface of the geometry
        vec3 ro = vWorldPos;
        vec3 rd = normalize(vWorldPos - cameraPosition);
        
        float density = 0.0;
        float t = 0.0;
        
        // Raymarch through the bounds
        for(int i=0; i<50; i++) {
          vec3 p = ro + rd * t;
          
          // If we exit the bounding box (radius 1.25), stop marching
          if(max(abs(p.x), max(abs(p.y), abs(p.z))) > 1.25) break;
          
          float d = getDensity(p);
          density += d * 0.04; // accumulate
          t += 0.04;           // step forward
        }
        
        density = clamp(density, 0.0, 1.0);
        // Mix a hot fiery core to a dark smoky edge
        vec3 col = mix(vec3(0.1, 0.0, 0.05), vec3(1.0, 0.6, 0.1), density);
        col = mix(col, vec3(1.0, 1.0, 0.8), pow(density, 3.0)); // super bright core
        
        gl_FragColor = vec4(col, density);
      }
    `
  })
  const volMesh = new THREE.Mesh(volGeo, volMat)
  vVol.scene.add(volMesh)
  vVol.disposables.push(volGeo, volMat)
  vVol.update = (_dt, et) => {
    volMat.uniforms.uTime.value = et
    // The shader handles rotation internally!
  }
  views.push(vVol)


  // 4. Post-processing Chain
  const vPost = createStandardView('view-exp-post')
  vPost.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const ppDir = new THREE.DirectionalLight(0xffffff, 2)
  ppDir.position.set(5, 5, 5)
  ppDir.castShadow = true
  vPost.scene.add(ppDir)
  vPost.camera.position.set(4, 3, 6)
  
  // Dense intersecting geometry for SSAO
  const group = new THREE.Group()
  const boxG = new THREE.BoxGeometry(0.5, 0.5, 0.5)
  const spGeo = new THREE.SphereGeometry(0.3)
  const boxM = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8 })
  const glowM = new THREE.MeshStandardMaterial({ color: '#ff2222', emissive: '#ff0000', emissiveIntensity: 3 })
  vPost.disposables.push(boxG, spGeo, boxM, glowM)

  for(let i=0; i<150; i++) {
    const isGlow = i % 15 === 0
    const mesh = new THREE.Mesh(isGlow ? spGeo : boxG, isGlow ? glowM : boxM)
    mesh.position.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6
    )
    mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  vPost.scene.add(group)

  let composer: EffectComposer | null = null
  let ssaoPass: SSAOPass
  let bokehPass: BokehPass

  vPost.render = (renderer) => {
    const el = vPost.element
    if (!el) return
    const rect = el.getBoundingClientRect()
    const w = rect.right - rect.left
    const h = rect.bottom - rect.top
    
    if (!composer) {
      composer = new EffectComposer(renderer)
      composer.renderToScreen = false // We handle output manually to avoid overriding scissor!
      // Actually EffectComposer forces setScissorTest(false) inside, ruining our layout!
      // To fix composer in multi-view:
      composer.addPass(new RenderPass(vPost.scene, vPost.camera))
      
      ssaoPass = new SSAOPass(vPost.scene, vPost.camera, w, h)
      ssaoPass.kernelRadius = 16
      composer.addPass(ssaoPass)

      bokehPass = new BokehPass(vPost.scene, vPost.camera, {
        focus: 6.0,
        aperture: 0.005,
        maxblur: 0.01
      })
      composer.addPass(bokehPass)

      const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 1.5, 0.4, 0.85)
      composer.addPass(bloomPass)
    }

    // EffectComposer breaks scissor. We must save/restore.
    const origScissor = renderer.getScissor(new THREE.Vector4())
    const origViewport = renderer.getViewport(new THREE.Vector4())
    const origScissorTest = renderer.getScissorTest()

    composer.setSize(w, h)
    composer.render()

    renderer.setScissorTest(origScissorTest)
    renderer.setScissor(origScissor)
    renderer.setViewport(origViewport)
    
    // Copy composer result to screen
    // Since composer.renderToScreen is false, result is in composer.readBuffer.texture
    // But copying it is annoying without a dedicated pass.
    // Instead, we hack renderToScreen = true but temporarily fix viewport in the last pass
    // Wait, EffectComposer's final pass automatically copies to screen.
  }

  // EffectComposer + Scissor MultiView is notoriously hard.
  // I will write a manual FullScreenQuad copy shader to ensure it draws into the correct scissor!
  const copyQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`
    })
  )
  const copyScene = new THREE.Scene()
  copyScene.add(copyQuad)
  const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // Re-define render safely
  vPost.render = (renderer) => {
    const el = vPost.element
    if (!el) return
    const rect = el.getBoundingClientRect()
    const w = rect.right - rect.left
    const h = rect.bottom - rect.top
    
    if (!composer) {
      composer = new EffectComposer(renderer)
      composer.renderToScreen = false 
      
      composer.addPass(new RenderPass(vPost.scene, vPost.camera))
      
      ssaoPass = new SSAOPass(vPost.scene, vPost.camera, w, h)
      ssaoPass.kernelRadius = 16
      ssaoPass.minDistance = 0.005
      ssaoPass.maxDistance = 0.1
      composer.addPass(ssaoPass)

      bokehPass = new BokehPass(vPost.scene, vPost.camera, {
        focus: 6.0,
        aperture: 0.005,
        maxblur: 0.02
      })
      composer.addPass(bokehPass)

      const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 2.0, 0.4, 0.85)
      composer.addPass(bloomPass)
    }

    // Run composer
    composer.setSize(w, h)
    composer.render()

    // Now render composer's output manually INSIDE the current scissor!
    copyQuad.material.uniforms.tDiffuse.value = composer.readBuffer.texture
    renderer.render(copyScene, copyCam)
  }

  vPost.update = (dt) => {
    group.rotation.y += dt * 0.2
    group.rotation.x += dt * 0.1
  }

  views.push(vPost)

  return views
}
