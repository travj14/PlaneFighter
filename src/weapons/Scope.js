import * as THREE from 'three';

// Renders a genuine "see-through" scope. When aiming, the world is re-rendered
// from the player's eye with a narrow FOV into a render target; that texture is
// shown inside a circular lens via a full-screen overlay, with the area outside
// the eyepiece blacked out (like real eye relief) and a crosshair in the centre.
// Magnification is independent of the main view FOV.

const SCOPE_FOV = 22; // degrees -> roughly 3.5x vs the 78° world FOV
const RT_SIZE = 1024;

export class Scope {
  constructor(mainCamera) {
    this.rt = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });

    this.camera = new THREE.PerspectiveCamera(
      SCOPE_FOV,
      1, // square render target
      mainCamera.near,
      mainCamera.far
    );

    // Full-screen overlay quad in NDC.
    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        scopeTex: { value: this.rt.texture },
        uAds: { value: 0 },
        uAspect: { value: window.innerWidth / window.innerHeight },
        uRadius: { value: 0.4 },
        uCharge: { value: 0 }, // laser charge 0..1
        uIsLaser: { value: 0 }, // 1 when the laser is equipped
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D scopeTex;
        uniform float uAds;
        uniform float uAspect;
        uniform float uRadius;
        uniform float uCharge;
        uniform float uIsLaser;

        const float PI = 3.1415926;

        // The render target stores LINEAR color (render-to-texture skips the
        // renderer's sRGB output conversion that the on-screen pass gets), so
        // we must encode it ourselves or the view looks dark.
        vec3 linearToSRGB(vec3 c) {
          c = max(c, vec3(0.0));
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                     step(0.0031308, c));
        }

        void main() {
          vec2 c = vUv - 0.5;                 // screen-centred (-0.5..0.5)
          vec2 cr = vec2(c.x * uAspect, c.y); // isotropic (round) space
          float dist = length(cr);

          float radius = uRadius;
          float inLens = smoothstep(radius, radius - 0.006, dist);

          // Sample the magnified world: lens disc -> square render target.
          vec2 sd = cr / radius;              // -1..1 within the lens
          vec2 texUV = sd * 0.5 + 0.5;
          // Sample the linear render target and encode to sRGB for display.
          vec3 view = linearToSRGB(texture2D(scopeTex, texUV).rgb);

          // Gentle vignette confined to the rim so the image stays clear.
          float vig = smoothstep(radius, radius * 0.85, dist);
          view *= mix(0.88, 1.0, vig);

          vec3 lensCol = view;
          vec3 red = vec3(1.0, 0.18, 0.13);

          if (uIsLaser > 0.5) {
            // --- Laser charge reticle ---
            // A centre ring (no lines through the middle); thin radial lines
            // whose red fill grows inward toward the ring as the charge builds.
            float R0 = 0.05;              // centre ring radius
            float Router = radius * 0.85; // lines reach ~85% to the scope edge

            // 8 radial lines of constant width (perpendicular distance test).
            float ang = atan(cr.y, cr.x);
            float stepA = PI / 4.0;
            float nearest = floor(ang / stepA + 0.5) * stepA;
            float angDiff = abs(ang - nearest);
            float perp = dist * sin(angDiff); // distance from the spoke ray
            float onLine = step(perp, 0.0018);
            float radialRange = step(R0, dist) * step(dist, Router);
            float spoke = onLine * radialRange;

            // Red fill advances from the outer end down to the ring.
            float redInner = mix(Router, R0, clamp(uCharge, 0.0, 1.0));
            float redSpoke = spoke * step(redInner, dist);

            // Centre ring (outline only) — turns red at full charge.
            float ring = smoothstep(0.0045, 0.0, abs(dist - R0));
            float full = step(0.999, uCharge);

            lensCol = mix(lensCol, vec3(0.85), spoke * 0.3); // dim guide lines
            lensCol = mix(lensCol, red, redSpoke);           // charged part
            vec3 ringCol = mix(vec3(0.95), red, full);
            lensCol = mix(lensCol, ringCol, ring);           // centre ring
          } else {
            // --- Default crosshair: thin dark cross + red centre dot. ---
            float lineW = 0.0016;
            float armLen = radius * 0.85;
            float crossH = step(abs(c.y), lineW) * step(dist, armLen);
            float crossV = step(abs(c.x), lineW) * step(dist, armLen);
            float cross = clamp(crossH + crossV, 0.0, 1.0);
            float dot = smoothstep(0.004, 0.0, dist);
            lensCol = mix(lensCol, vec3(0.02), cross * 0.85);
            lensCol = mix(lensCol, vec3(1.0, 0.22, 0.16), dot);
          }

          // Outside the eyepiece is black.
          vec3 col = mix(vec3(0.0), lensCol, inLens);

          gl_FragColor = vec4(col, uAds);
        }
      `,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.overlayScene.add(quad);

    this.ads = 0;
  }

  get active() {
    return this.ads > 0.002;
  }

  // Sync the scope camera to the player's eye and update overlay uniforms.
  update(ads, mainCamera, charge = 0, isLaser = false) {
    this.ads = ads;
    mainCamera.getWorldPosition(this.camera.position);
    mainCamera.getWorldQuaternion(this.camera.quaternion);
    this.material.uniforms.uAds.value = ads;
    this.material.uniforms.uCharge.value = charge;
    this.material.uniforms.uIsLaser.value = isLaser ? 1 : 0;
  }

  // Render the world from the scope camera into the render target.
  renderRT(renderer, worldScene) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(worldScene, this.camera);
    renderer.setRenderTarget(prev);
  }

  setSize(w, h) {
    this.material.uniforms.uAspect.value = w / h;
  }
}
