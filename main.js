import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.innerWidth < 700;

/* ------------------------------------------------------------------ 3D scene
   An "agent network": a glowing core (the model), nodes on shells around it
   (agents and tools), edges between neighbours, and pulses of light running
   along the edges (requests and retrieved context). */
function initScene() {
  const canvas = document.getElementById("scene");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    canvas.style.display = "none"; // no WebGL: the page still works without the scene
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, 0.045);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 11);

  const world = new THREE.Group();
  scene.add(world);
  // keep the network to the right of the hero text on wide screens
  const baseX = isMobile ? 0 : 3.2;
  world.position.x = baseX;

  const CYAN = new THREE.Color(0xffffff);
  const VIOLET = new THREE.Color(0x9a9a9a);
  const PINK = new THREE.Color(0xd4d4d4);

  // core
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.25, 1),
    new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.9 })
  );
  world.add(core);
  const coreInner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75, 3),
    new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.55 })
  );
  world.add(coreInner);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.012, 8, 160),
    new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = Math.PI / 2.4;
  world.add(ring);
  const ring2 = ring.clone();
  ring2.scale.setScalar(1.35);
  ring2.rotation.set(Math.PI / 3, Math.PI / 5, 0);
  ring2.material = ring.material.clone();
  ring2.material.color = CYAN.clone();
  ring2.material.opacity = 0.35;
  world.add(ring2);

  // nodes on a fibonacci sphere shell, with radius jitter
  const N = isMobile ? 70 : 120;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = Math.PI * (3 - Math.sqrt(5)) * i;
    const R = 3.2 + Math.random() * 1.8;
    nodes.push(new THREE.Vector3(Math.cos(th) * r * R, y * R, Math.sin(th) * r * R));
  }
  const nodeGeo = new THREE.BufferGeometry().setFromPoints(nodes);
  const nodeColors = [];
  nodes.forEach((_, i) => {
    const c = [CYAN, VIOLET, PINK][i % 3];
    nodeColors.push(c.r, c.g, c.b);
  });
  nodeGeo.setAttribute("color", new THREE.Float32BufferAttribute(nodeColors, 3));
  const dotTex = makeDotTexture();
  const nodePoints = new THREE.Points(
    nodeGeo,
    new THREE.PointsMaterial({ size: 0.22, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  world.add(nodePoints);

  // edges: connect each node to its 3 nearest neighbours, plus a few spokes to the core
  const edges = [];
  const seen = new Set();
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: a.distanceTo(b) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 3);
    near.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) { seen.add(key); edges.push([a, nodes[j]]); }
    });
    if (i % 9 === 0) edges.push([a, new THREE.Vector3(0, 0, 0)]);
  });
  const edgePos = [];
  edges.forEach(([a, b]) => edgePos.push(a.x, a.y, a.z, b.x, b.y, b.z));
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePos, 3));
  const edgeLines = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: 0x6b6b6b, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending })
  );
  world.add(edgeLines);

  // pulses travelling along edges
  const P = isMobile ? 40 : 90;
  const pulses = [];
  const pulsePos = new Float32Array(P * 3);
  const pulseCol = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    const c = [CYAN, PINK, VIOLET][i % 3];
    pulseCol.set([c.r, c.g, c.b], i * 3);
    pulses.push({ e: (Math.random() * edges.length) | 0, t: Math.random(), s: 0.25 + Math.random() * 0.6 });
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
  pulseGeo.setAttribute("color", new THREE.BufferAttribute(pulseCol, 3));
  const pulsePoints = new THREE.Points(
    pulseGeo,
    new THREE.PointsMaterial({ size: 0.18, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  world.add(pulsePoints);

  // starfield
  const S = isMobile ? 900 : 2200;
  const starPos = new Float32Array(S * 3);
  for (let i = 0; i < S; i++) {
    const r = 25 + Math.random() * 60;
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    starPos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.12, map: dotTex, color: 0xbfbfbf, transparent: true, opacity: 0.8, depthWrite: false })
  );
  scene.add(stars);

  // post-processing glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // interaction: mouse parallax + scroll-driven camera
  const mouse = new THREE.Vector2();
  window.addEventListener("pointermove", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  });
  let scrollP = 0;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? window.scrollY / max : 0;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const speed = reduceMotion ? 0.15 : 1;

    world.rotation.y += dt * 0.12 * speed;
    world.rotation.x = THREE.MathUtils.lerp(world.rotation.x, mouse.y * 0.25 + scrollP * 0.8, 0.05);
    core.rotation.x += dt * 0.4 * speed;
    core.rotation.y -= dt * 0.3 * speed;
    coreInner.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
    ring.rotation.z += dt * 0.5 * speed;
    ring2.rotation.z -= dt * 0.3 * speed;
    stars.rotation.y += dt * 0.01 * speed;

    // camera: drift toward the mouse, pull back and slide as the page scrolls
    const targetX = mouse.x * 0.8;
    const targetY = -mouse.y * 0.5 - scrollP * 2;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, 11 + scrollP * 6, 0.05);
    world.position.x = THREE.MathUtils.lerp(world.position.x, isMobile ? 0 : baseX * (1 - Math.min(1, scrollP * 4)), 0.05);
    camera.lookAt(0, -scrollP * 2, 0);

    for (let i = 0; i < P; i++) {
      const p = pulses[i];
      p.t += dt * p.s * speed;
      if (p.t >= 1) { p.t = 0; p.e = (Math.random() * edges.length) | 0; }
      const [a, b] = edges[p.e];
      tmp.lerpVectors(a, b, p.t);
      pulsePos.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    pulseGeo.attributes.position.needsUpdate = true;

    composer.render();
    requestAnimationFrame(frame);
  }
  frame();
}

function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.8)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ UI */
function typeLoop() {
  const el = document.getElementById("typed");
  const words = ["LLM agents", "RAG pipelines", "LLM evals", "recommender systems", "reliable backends"];
  if (reduceMotion) return;
  let w = 0, i = words[0].length, deleting = true;
  setTimeout(function tick() {
    const word = words[w];
    if (deleting) {
      i--;
      if (i === 0) { deleting = false; w = (w + 1) % words.length; }
    } else {
      i++;
      if (i === words[w].length) { deleting = true; el.textContent = words[w]; return setTimeout(tick, 1600); }
    }
    el.textContent = (deleting ? word : words[w]).slice(0, i);
    setTimeout(tick, deleting ? 45 : 85);
  }, 1800);
}

function reveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("visible");
      io.unobserve(e.target);
      e.target.querySelectorAll?.("[data-count]").forEach(countUp);
      if (e.target.dataset.count) countUp(e.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

function countUp(el) {
  const big = el.classList.contains("big") ? el : el.querySelector(".big");
  if (!big || big.dataset.done) return;
  big.dataset.done = "1";
  const end = +big.dataset.count, suffix = big.dataset.suffix || "";
  const fmt = (n) => n.toLocaleString("en-IN") + suffix;
  if (reduceMotion) { big.textContent = fmt(end); return; }
  const t0 = performance.now(), dur = 1400;
  (function step(now) {
    const k = Math.min(1, (now - t0) / dur);
    big.textContent = fmt(Math.round(end * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

function tilt() {
  if (reduceMotion || matchMedia("(hover: none)").matches) return;
  document.querySelectorAll(".tilt").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

document.getElementById("year").textContent = new Date().getFullYear();
// stats are observed individually so each counts up when it appears
document.querySelectorAll(".stat").forEach((s) => s.querySelector(".big") && (s.dataset.count = "1"));
initScene();
typeLoop();
reveals();
tilt();
