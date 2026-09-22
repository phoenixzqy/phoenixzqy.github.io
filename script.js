const root = document.documentElement;
root.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionButton = document.querySelector(".motion-toggle");
const motionLabel = document.querySelector("[data-motion-label]");
let manuallyPaused = false;
let updateScene = () => {};

function syncMotion() {
  const paused = reducedMotion.matches || manuallyPaused;
  root.dataset.motion = paused ? "off" : "on";
  motionButton.setAttribute("aria-pressed", String(paused));
  motionButton.disabled = reducedMotion.matches;
  motionLabel.textContent = reducedMotion.matches ? "Reduced motion" : paused ? "Motion off" : "Motion on";
  motionButton.title = reducedMotion.matches
    ? "Motion is disabled by your system accessibility preference"
    : "Toggle decorative animation";
  updateScene();
}

motionButton.addEventListener("click", () => {
  manuallyPaused = !manuallyPaused;
  syncMotion();
});
reducedMotion.addEventListener("change", syncMotion);
syncMotion();
document.querySelector("#year").textContent = String(new Date().getFullYear());

if ("IntersectionObserver" in window) {
  const reveals = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.remove("is-pending");
        reveals.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach((element) => {
    element.classList.add("is-pending");
    reveals.observe(element);
  });
}

const dialog = document.querySelector("#command-dialog");
const commandTrigger = document.querySelector(".command-trigger");
commandTrigger.addEventListener("click", () => dialog.showModal());
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (dialog.open) dialog.close();
    else dialog.showModal();
  }
});
dialog.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    dialog.close();
    const target = document.querySelector(link.hash);
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  });
});

let detailsBeforePrint = [];
window.addEventListener("beforeprint", () => {
  detailsBeforePrint = [...document.querySelectorAll("details")].map((element) => ({
    element, open: element.open,
  }));
  detailsBeforePrint.forEach(({ element }) => { element.open = true; });
});
window.addEventListener("afterprint", () => {
  detailsBeforePrint.forEach(({ element, open }) => { element.open = open; });
});
document.querySelectorAll("[data-print]").forEach((button) => {
  button.addEventListener("click", () => {
    if (dialog.open) dialog.close();
    window.print();
  });
});

const navLinks = [...document.querySelectorAll(".site-header nav a")];
if ("IntersectionObserver" in window) {
  const sections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        navLinks.forEach((link) => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
    }
  }, { rootMargin: "-15% 0px -65% 0px" });
  document.querySelectorAll("main > section").forEach((section) => sections.observe(section));
}

function initNeuralScene() {
  const canvas = document.querySelector("#neural-canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    console.warn("Canvas 2D is unavailable; displaying the static neural illustration.");
    return;
  }
  const scene = canvas.parentElement;
  const points = [];
  const edges = [];
  const count = 170;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    points.push({ x: Math.cos(goldenAngle * i) * radius, y, z: Math.sin(goldenAngle * i) * radius });
  }
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y, points[i].z - points[j].z);
      if (distance < 0.34) edges.push([i, j]);
    }
  }
  let size = 0;
  let angle = 0.45;
  let frame = null;
  let lastTime = 0;
  let inView = true;
  let pointerX = 0;
  let pointerY = 0;
  let tiltX = 0;
  let tiltY = 0;
  const canAnimate = () => root.dataset.motion !== "off" && !document.hidden && inView;

  function draw() {
    if (!size) return;
    context.clearRect(0, 0, size, size);
    const center = size / 2;
    const radius = size * 0.355;
    const glow = context.createRadialGradient(center, center, 0, center, center, size * 0.48);
    glow.addColorStop(0, "rgba(146, 213, 71, 0.10)");
    glow.addColorStop(0.65, "rgba(146, 213, 71, 0.025)");
    glow.addColorStop(1, "rgba(146, 213, 71, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    const rotation = angle + tiltX;
    const incline = -0.28 + tiltY;
    const projected = points.map((point) => {
      const x = point.x * Math.cos(rotation) - point.z * Math.sin(rotation);
      const z = point.x * Math.sin(rotation) + point.z * Math.cos(rotation);
      const y = point.y * Math.cos(incline) - z * Math.sin(incline);
      const depth = point.y * Math.sin(incline) + z * Math.cos(incline);
      const perspective = 3.7 / (3.7 - depth);
      return { x: center + x * radius * perspective, y: center + y * radius * perspective, depth };
    });
    context.lineWidth = 0.7;
    for (const [i, j] of edges) {
      const a = projected[i];
      const b = projected[j];
      const opacity = 0.08 + ((a.depth + b.depth + 2) / 4) * 0.28;
      context.strokeStyle = `rgba(176, 223, 114, ${opacity})`;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    projected.forEach((point, i) => {
      const front = (point.depth + 1) / 2;
      const isBeacon = i % 19 === 0;
      context.beginPath();
      context.fillStyle = `rgba(205, 252, 147, ${0.22 + front * 0.78})`;
      context.arc(point.x, point.y, (isBeacon ? 2.5 : 1.2) * (0.6 + front * 0.7), 0, Math.PI * 2);
      context.fill();
      if (isBeacon && front > 0.4) {
        context.beginPath();
        context.strokeStyle = `rgba(189, 245, 119, ${front * 0.23})`;
        context.arc(point.x, point.y, 6, 0, Math.PI * 2);
        context.stroke();
      }
    });
  }

  function tick(time) {
    frame = null;
    if (!canAnimate()) return;
    const delta = lastTime ? Math.min(time - lastTime, 50) : 16;
    lastTime = time;
    angle += delta * 0.00009;
    tiltX += (pointerX - tiltX) * 0.035;
    tiltY += (pointerY - tiltY) * 0.035;
    draw();
    frame = requestAnimationFrame(tick);
  }

  updateScene = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = 0;
    draw();
    if (canAnimate()) frame = requestAnimationFrame(tick);
  };
  function resize() {
    size = scene.getBoundingClientRect().width;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }
  scene.addEventListener("pointermove", (event) => {
    if (!canAnimate() || event.pointerType === "touch") return;
    const bounds = scene.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.65;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.45;
  });
  scene.addEventListener("pointerleave", () => { pointerX = 0; pointerY = 0; });
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(scene);
  else window.addEventListener("resize", resize);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updateScene();
    }).observe(scene);
  }
  document.addEventListener("visibilitychange", updateScene);
  resize();
  scene.classList.add("canvas-ready");
  updateScene();
}

initNeuralScene();
