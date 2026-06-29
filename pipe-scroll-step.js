/* ============================================================================
   Testerloop — pipe-scroll STEP takeover  (desktop only)
   Converts the free-scroll features section into a guided, one-gesture-per-feature
   step experience, driven by GSAP Observer.

   Reuses the existing markup + CSS untouched:
     - is-active on .feature-scroll-text-item  (your opacity/grayscale treatment)
     - is-active on .feature-scroll-visual-list .feature-scroll-image (image crossfade,
       which feature-illustrations.js already watches)
     - the same "Features pipe scroll" Lottie (taken over so we own the frame)

   What it replaces at runtime (reversible — remove this script and the originals return):
     - the per-item ScrollTriggers that toggled is-active on free scroll
     - the Webflow IX2 free-scrub of the pipe Lottie

   Deps already on the page: GSAP 3.12.5, ScrollTrigger, Observer, lottie-web 5.12.2,
   Lenis (exposed as window.lenis), jQuery.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- tunables ------------------------------------------------------------ */
  var MIN_WIDTH   = 992;     // desktop breakpoint (where the sticky pipe/visual exist)
  var SPEED       = 0.85;    // seconds per transition
  var TOLERANCE   = 14;      // Observer gesture threshold (px)
  var PIPE_STOPS  = [0, 0.5, 1];   // fraction of total Lottie frames per feature (tune to taste)
  var EXIT_DUR    = 0.6;     // seconds for the release scroll

  var DESKTOP = window.matchMedia("(min-width:" + MIN_WIDTH + "px) and (pointer:fine)");
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var observerRequested = false;
  function whenReady() {
    // Observer ships separately from GSAP core — load it if the page doesn't already have it
    if (window.gsap && !window.Observer && !observerRequested) {
      observerRequested = true;
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/Observer.min.js";
      document.head.appendChild(s);
    }
    if (window.gsap && window.ScrollTrigger && window.Observer && window.lottie &&
        document.querySelector(".section.features .feature-scroll-text-item")) {
      gsap.registerPlugin(ScrollTrigger, Observer);
      build();
    } else {
      setTimeout(whenReady, 60);
    }
  }

  var st = null, observer = null, pipeAnim = null, pipeFrames = 0;
  var section, contentEl, texts, visuals, N;
  var index = 0, active = false, animating = false, built = false, unlockTimer = null;
  var targets = [];   // per-feature translateY for the text column

  function build() {
    if (built) return;
    section = document.querySelector(".section.features");
    if (!section) return;
    contentEl = section.querySelector(".feature-scroll-content");
    texts     = [].slice.call(section.querySelectorAll(".feature-scroll-text-item"));
    visuals   = [].slice.call(section.querySelectorAll(".feature-scroll-visual-list .feature-scroll-image"));
    N = texts.length;
    if (!N || !contentEl) return;
    built = true;

    if (!DESKTOP.matches) return;   // mobile/tablet: leave native scroll + existing controller alone

    killNativeFeatureScroll();
    takeOverPipe();

    // detector: engage when the section fills the viewport, disengage when it leaves
    st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      onEnter:     function () { engage(0); },        // entered from the top
      onEnterBack: function () { engage(N - 1); },     // entered from below
      onLeave:     function () { disengage(); },
      onLeaveBack: function () { disengage(); }
    });
    ScrollTrigger.refresh();
  }

  /* ---- neutralise the existing drivers ------------------------------------- */
  function killNativeFeatureScroll() {
    // the restored "Feature scroll showcase" script makes one ScrollTrigger per text item
    var kill = function () {
      ScrollTrigger.getAll().forEach(function (s) {
        var t = s.trigger;
        if (t && t !== section && t.classList && t.classList.contains("feature-scroll-text-item")) s.kill();
      });
    };
    kill();
    // its $(function(){...}) may run after us — sweep again a couple of times
    setTimeout(kill, 200);
    setTimeout(kill, 800);
  }

  function takeOverPipe() {
    var el = section.querySelector(".lottie-animation");
    if (!el) return;
    var src = el.getAttribute("data-src");
    el.removeAttribute("data-w-id");
    el.removeAttribute("data-animation-type");
    el.removeAttribute("data-is-ix2-target");
    el.innerHTML = "";   // drop the IX2-driven instance; we own a fresh one
    pipeAnim = lottie.loadAnimation({
      container: el, renderer: "svg", loop: false, autoplay: false, path: src,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" }
    });
    pipeAnim.addEventListener("DOMLoaded", function () {
      pipeFrames = Math.max(1, Math.round(pipeAnim.totalFrames) - 1);
      var svg = el.querySelector("svg");
      if (svg) { svg.style.width = "100%"; svg.style.height = "100%"; svg.style.display = "block"; }
      pipeAnim.goToAndStop(0, true);
    });
  }

  /* ---- feature state (reuses the original makeItemActive logic) ------------ */
  function makeItemActive(i) {
    for (var n = 0; n < N; n++) {
      texts[n].classList.toggle("is-active", n === i);
      if (visuals[n]) visuals[n].classList.toggle("is-active", n === i);
    }
  }
  function pipeTo(i, instant) {
    if (!pipeAnim) return;
    var to = PIPE_STOPS[i] * pipeFrames;
    gsap.to(pipeAnim, {
      currentFrame: to, duration: (instant || REDUCED) ? 0 : SPEED, ease: "power2.inOut",
      onUpdate: function () { pipeAnim.goToAndStop(pipeAnim.currentFrame, true); }
    });
  }
  function measure() {
    // viewport-centre target for each item, measured with the column at y:0
    gsap.set(contentEl, { y: 0 });
    var mid = window.innerHeight / 2;
    targets = texts.map(function (el) {
      var r = el.getBoundingClientRect();
      return Math.round(mid - (r.top + r.height / 2));
    });
  }

  /* ---- stepping ------------------------------------------------------------ */
  function go(target, dir) {
    if (target < 0)  return exit(-1);
    if (target >= N) return exit(1);
    if (target === index) return;
    index = target;
    animating = true;
    makeItemActive(index);
    pipeTo(index, false);
    gsap.to(contentEl, { y: targets[index], duration: REDUCED ? 0 : SPEED, ease: "power2.inOut" });
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(function () { animating = false; }, (REDUCED ? 20 : SPEED * 1000 + 120));
  }
  function onKey(e) {
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); if (!animating) go(index + 1, 1); }
    if (e.key === "ArrowUp"   || e.key === "PageUp")                    { e.preventDefault(); if (!animating) go(index - 1, -1); }
  }

  /* ---- engage / disengage / exit ------------------------------------------- */
  function engage(startIndex) {
    if (active) return;
    active = true; animating = false;
    if (window.lenis) { window.lenis.scrollTo(st.start, { immediate: true }); window.lenis.stop(); }
    measure();
    index = startIndex;
    makeItemActive(index);
    gsap.set(contentEl, { y: targets[index] });
    pipeTo(index, true);
    observer = Observer.create({
      target: window, type: "wheel,touch,pointer", wheelSpeed: -1,
      tolerance: TOLERANCE, preventDefault: true,
      onUp:   function () { if (!animating) go(index + 1, 1); },   // scroll down -> next
      onDown: function () { if (!animating) go(index - 1, -1); }   // scroll up   -> prev
    });
    document.addEventListener("keydown", onKey);
  }

  function disengage() {
    if (!active) return;
    active = false;
    if (observer) { observer.kill(); observer = null; }
    document.removeEventListener("keydown", onKey);
    gsap.set(contentEl, { y: 0 });   // hand the column back to natural flow
    if (window.lenis) window.lenis.start();
  }

  function exit(dir) {
    // release Lenis and scroll just past the section boundary; the detector's
    // onLeave / onLeaveBack then fires disengage().
    animating = true;
    if (window.lenis) {
      window.lenis.start();
      var to = dir > 0 ? st.end + 4 : st.start - 4;
      window.lenis.scrollTo(to, { duration: EXIT_DUR, onComplete: function () { animating = false; } });
    } else {
      window.scrollTo({ top: dir > 0 ? st.end + 4 : st.start - 4, behavior: "smooth" });
      setTimeout(function () { animating = false; }, EXIT_DUR * 1000 + 80);
    }
  }

  /* ---- lifecycle ----------------------------------------------------------- */
  DESKTOP.addEventListener("change", function () {
    // tear down on shrink to mobile; rebuild on grow to desktop (simplest: reload-safe re-init)
    disengage();
    if (st) { st.kill(); st = null; }
    built = false;
    build();
  });

  if (document.readyState !== "loading") whenReady();
  else document.addEventListener("DOMContentLoaded", whenReady);
})();
