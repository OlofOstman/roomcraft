/**
 * Equirectangular 360° capture from a three.js scene.
 *
 * The photoreal tour needs a full sphere of the room, not a perspective frame:
 * an image model can only make a panorama photoreal if it is handed a
 * panorama. Three renders cube faces natively (CubeCamera), so this captures a
 * cube map and reprojects it to the 2:1 equirectangular layout every 360 viewer
 * — and Gemini's panorama mode — expects.
 *
 * Same approach as spite/THREE.CubemapToEquirectangular (MIT), rewritten
 * against the modern three API.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * uv -> spherical direction -> cube sample. u spans longitude (-pi..pi) and v
 * latitude (-pi/2..pi/2), which is the definition of the equirectangular
 * projection. The x flip matches three's cube-map handedness, so the panorama
 * reads the same way round as the scene does.
 *
 * Tone mapping and sRGB encoding happen here rather than being left to the
 * renderer, because three only tone-maps when it draws to the canvas — a
 * render-target pass is forced to NoToneMapping internally. Capturing without
 * this produced raw linear values crushed into 8 bits: every lit white wall
 * clipped to featureless paper, and `toneMappingExposure` had no effect at all.
 * The curve below is three's own ACES fit, so the panorama matches what the
 * viewport shows.
 */
const FRAG = /* glsl */ `
  precision highp float;
  uniform samplerCube cubeMap;
  uniform float exposure;
  varying vec2 vUv;
  #define PI 3.141592653589793

  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 acesFilmic(vec3 color) {
    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 ACESOutputMat = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    color *= exposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }

  vec3 linearToSRGB(vec3 c) {
    return mix(
      pow(c, vec3(0.41666)) * 1.055 - 0.055,
      c * 12.92,
      vec3(lessThanEqual(c, vec3(0.0031308)))
    );
  }

  void main() {
    float lon = (vUv.x - 0.5) * 2.0 * PI;
    float lat = (vUv.y - 0.5) * PI;
    vec3 dir = vec3(
      -cos(lat) * sin(lon),
       sin(lat),
      -cos(lat) * cos(lon)
    );
    vec3 hdr = textureCube(cubeMap, dir).rgb;
    gl_FragColor = vec4(linearToSRGB(acesFilmic(hdr)), 1.0);
  }
`;

export interface PanoramaOptions {
  /** Output width in px; height is always width / 2. Default 4096. */
  width?: number;
  /** Near plane for the cube camera, in scene units (cm). Default 1. */
  near?: number;
  /** Far plane. Default 100000. */
  far?: number;
  /** Tone-mapping exposure; defaults to the renderer's own. */
  exposure?: number;
}

/**
 * Render the scene from `position` as an equirectangular panorama.
 *
 * Returns a canvas of `width` x `width/2`. The caller is responsible for
 * hiding editor-only scenery (sprites, camera helpers) beforehand — this
 * captures whatever is currently visible.
 */
export function captureEquirectangular(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  position: THREE.Vector3,
  options: PanoramaOptions = {},
): HTMLCanvasElement {
  const width = options.width ?? 4096;
  const height = width / 2;
  // A cube face only needs a quarter of the panorama width to keep detail:
  // 4096-wide equirect spans 360°, so 90° per face lands at ~1024.
  const faceSize = Math.max(256, Math.round(width / 4));

  const cubeTarget = new THREE.WebGLCubeRenderTarget(faceSize, {
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    // Half float keeps the scene's full dynamic range intact until the
    // reprojection pass tone-maps it. An 8-bit target would clip the highlights
    // before there was any curve to roll them off with.
    type: THREE.HalfFloatType,
  });
  cubeTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const cubeCamera = new THREE.CubeCamera(options.near ?? 1, options.far ?? 100000, cubeTarget);
  cubeCamera.position.copy(position);
  cubeCamera.updateMatrixWorld(true);

  const equirectTarget = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMaterial = new THREE.ShaderMaterial({
    uniforms: {
      cubeMap: { value: cubeTarget.texture },
      exposure: { value: options.exposure ?? renderer.toneMappingExposure },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMaterial);
  quadScene.add(quad);

  const previousTarget = renderer.getRenderTarget();

  try {
    cubeCamera.update(renderer, scene);

    renderer.setRenderTarget(equirectTarget);
    renderer.clear();
    renderer.render(quadScene, quadCamera);

    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(equirectTarget, 0, 0, width, height, pixels);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    // WebGL reads bottom-up; canvas ImageData is top-down.
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * rowBytes;
      imageData.data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    renderer.setRenderTarget(previousTarget);
    quad.geometry.dispose();
    quadMaterial.dispose();
    equirectTarget.dispose();
    cubeTarget.dispose();
  }
}

/**
 * Resize a canvas into a new one. Used to trade between the 2:1 panorama
 * layout and the 21:9 frame the image model actually emits.
 */
export function resizeCanvas(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return out;
}

/** Decode a data URL / object URL into a canvas at its natural size. */
export function loadImageToCanvas(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('could not decode image'));
    img.src = src;
  });
}

/**
 * A panorama wraps around, so its left and right edges are the same seam. The
 * image model does not know that and routinely leaves a visible discontinuity
 * there; cross-fade a narrow band so the seam disappears in the viewer.
 */
export function blendPanoramaSeam(canvas: HTMLCanvasElement, bandFraction = 0.02): HTMLCanvasElement {
  const { width, height } = canvas;
  const band = Math.max(2, Math.round(width * bandFraction));
  const ctx = canvas.getContext('2d')!;
  const left = ctx.getImageData(0, 0, band, height);
  const right = ctx.getImageData(width - band, 0, band, height);
  const blended = ctx.createImageData(band, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < band; x++) {
      // At the seam itself the two edges contribute equally; the weight ramps
      // back to the original pixels over the width of the band.
      const t = 0.5 * (1 - x / band);
      const i = (y * band + x) * 4;
      for (let c = 0; c < 4; c++) {
        blended.data[i + c] = left.data[i + c] * (1 - t) + right.data[i + c] * t;
      }
    }
  }
  ctx.putImageData(blended, 0, 0);
  return canvas;
}
