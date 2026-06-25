/**
 * ============================================================
 *  three-scene.js  —  Premium 3D Background for Church Website
 *  ============================================================
 *  INTEGRATION POINT: loaded via <script> before </body> in index.html
 *  CANVAS    : #three-canvas  (inside .main-image hero section)
 *  THEME     : gold #d4a017 · dark-navy #013346 · warm-cream #efdfbf
 *
 *  FEATURES
 *  ─────────
 *  ✓ Floating sacred-geometry particles + cross shapes
 *  ✓ Mouse parallax (desktop)
 *  ✓ Touch gentle response (mobile)
 *  ✓ Scroll-driven camera drift
 *  ✓ Tab-visibility pause (saves GPU when hidden)
 *  ✓ prefers-reduced-motion respect
 *  ✓ Window resize handler
 *  ✓ Low-power / mobile GPU fallback
 *  ✓ requestAnimationFrame with pixel-ratio cap
 *  ✓ Full object disposal on unload
 * ============================================================
 */
(function () {
    'use strict';

    /* ──────────────────────────────────────
       0. GUARD CLAUSES
    ────────────────────────────────────── */

    // Respect user's accessibility preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Low-power device detection (mobile with < 4 logical cores)
    const isLowPower = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency < 4
        && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    /* ──────────────────────────────────────
       1. LOAD THREE.JS FROM CDN
          (dynamic import keeps existing JS untouched)
    ────────────────────────────────────── */
    const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.min.js';

    import(THREE_CDN).then(THREE => {
        initScene(THREE);
    }).catch(err => {
        // Silently fail — the site works perfectly without 3D
        console.warn('[three-scene] Three.js could not be loaded:', err.message);
    });

    /* ──────────────────────────────────────
       2. SCENE INITIALISATION
    ────────────────────────────────────── */
    function initScene(THREE) {

        /* ── 2a. Canvas & container ── */
        const canvas = document.getElementById('three-canvas');
        if (!canvas) return;                          // safety bail-out

        const container = canvas.parentElement;       // .main-image

        /* ── 2b. Renderer ── */
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: !isLowPower,
            alpha: true,                              // transparent background
            powerPreference: 'high-performance',
        });

        // Cap pixel-ratio to 2 to protect mobile GPUs
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setClearColor(0x000000, 0);          // fully transparent

        /* ── 2c. Scene & Camera ── */
        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(
            60,                                       // fov
            container.clientWidth / container.clientHeight,
            0.1,
            100
        );
        camera.position.set(0, 0, 8);

        /* ── 2d. Lighting ── */
        // Ambient — warm cream fill
        const ambientLight = new THREE.AmbientLight(0xefdfbf, 0.6);
        scene.add(ambientLight);

        // Primary directional — golden
        const dirLight = new THREE.DirectionalLight(0xd4a017, 1.2);
        dirLight.position.set(5, 8, 5);
        scene.add(dirLight);

        // Accent point — cool navy rim
        const pointLight = new THREE.PointLight(0x013346, 1.0, 20);
        pointLight.position.set(-6, -3, 4);
        scene.add(pointLight);

        /* ────────────────────────────────
           3. OBJECTS — FLOATING PARTICLES
        ──────────────────────────────── */
        const PARTICLE_COUNT = isLowPower ? 40 : 80;

        // Shared material pool (one per type to minimise draw calls)
        const matGold = new THREE.MeshStandardMaterial({
            color: 0xd4a017,
            metalness: 0.8,
            roughness: 0.2,
            transparent: true,
            opacity: 0.75,
        });
        const matNavy = new THREE.MeshStandardMaterial({
            color: 0x013346,
            metalness: 0.5,
            roughness: 0.4,
            transparent: true,
            opacity: 0.55,
        });
        const matGlass = new THREE.MeshStandardMaterial({
            color: 0xefdfbf,
            metalness: 0.1,
            roughness: 0.05,
            transparent: true,
            opacity: 0.3,
            wireframe: false,
        });

        // Geometry pool
        const geoOctahedron = new THREE.OctahedronGeometry(0.22, 0);
        const geoTetrahedron = new THREE.TetrahedronGeometry(0.18, 0);
        const geoDodecahedron = new THREE.DodecahedronGeometry(0.16, 0);
        const geoTorus = new THREE.TorusGeometry(0.14, 0.04, 8, 24);

        const geometries = [geoOctahedron, geoTetrahedron, geoDodecahedron, geoTorus];
        const materials = [matGold, matNavy, matGlass, matGold, matNavy];

        const particles = [];

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const geo = geometries[i % geometries.length];
            const mat = materials[i % materials.length];
            const mesh = new THREE.Mesh(geo, mat);

            // Random spread across the hero field of view
            mesh.position.set(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 6 - 1
            );

            mesh.rotation.set(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );

            // Per-particle animation metadata (avoids allocations in RAF)
            mesh.userData = {
                rotSpeedX: (Math.random() - 0.5) * 0.008,
                rotSpeedY: (Math.random() - 0.5) * 0.010,
                rotSpeedZ: (Math.random() - 0.5) * 0.006,
                floatSpeed: 0.0004 + Math.random() * 0.0006,
                floatAmp: 0.25 + Math.random() * 0.45,
                floatOffset: Math.random() * Math.PI * 2,
                originY: mesh.position.y,
            };

            scene.add(mesh);
            particles.push(mesh);
        }

        /* ────────────────────────────────
           4. SUBTLE CROSS / STAR ACCENTS
              (tiny wireframe crosses)
        ──────────────────────────────── */
        const CROSS_COUNT = isLowPower ? 5 : 12;
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0xd4a017,
            wireframe: true,
            transparent: true,
            opacity: 0.18,
        });

        const crosses = [];
        for (let i = 0; i < CROSS_COUNT; i++) {
            // Build a plus-cross from two thin boxes
            const h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.04), wireMat);
            const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.04), wireMat);
            const group = new THREE.Group();
            group.add(h, v);

            group.position.set(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 4 - 2
            );
            group.rotation.z = Math.random() * Math.PI;

            group.userData = {
                rotSpeedZ: (Math.random() - 0.5) * 0.004,
                floatSpeed: 0.0003 + Math.random() * 0.0004,
                floatAmp: 0.15 + Math.random() * 0.3,
                floatOffset: Math.random() * Math.PI * 2,
                originY: group.position.y,
            };

            scene.add(group);
            crosses.push(group);
        }

        /* ────────────────────────────────
           5. INTERACTION STATE
        ──────────────────────────────── */
        // Target values for smooth lerp
        const mouse = { x: 0, y: 0 };           // -1 … +1 normalised
        const target = { x: 0, y: 0 };           // current lerped value
        const scroll = { progress: 0 };           // 0 … 1 of document height

        /* ── Mouse tracking (desktop) ── */
        function onMouseMove(e) {
            mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
            mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
        }

        /* ── Touch tracking (mobile, gentle) ── */
        function onTouchMove(e) {
            if (e.touches.length < 1) return;
            const t = e.touches[0];
            mouse.x = (t.clientX / window.innerWidth - 0.5) * 1.0;
            mouse.y = (t.clientY / window.innerHeight - 0.5) * 1.0;
        }

        /* ── Scroll progress ── */
        function onScroll() {
            const docH = document.documentElement.scrollHeight - window.innerHeight;
            scroll.progress = docH > 0 ? window.scrollY / docH : 0;
        }

        document.addEventListener('mousemove', onMouseMove, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('scroll', onScroll, { passive: true });

        /* ── IntersectionObserver — pause when hero not visible ── */
        let heroVisible = true;
        const heroObserver = new IntersectionObserver(entries => {
            heroVisible = entries[0].isIntersecting;
        }, { threshold: 0 });
        heroObserver.observe(canvas);

        /* ── Page visibility — pause when tab hidden ── */
        let pageVisible = !document.hidden;
        document.addEventListener('visibilitychange', () => {
            pageVisible = !document.hidden;
        });

        /* ────────────────────────────────
           6. ANIMATION LOOP
        ──────────────────────────────── */
        let clock = 0;
        let rafId = null;

        function animate() {
            rafId = requestAnimationFrame(animate);

            // Skip rendering when not needed
            if (!pageVisible || !heroVisible) return;

            clock += prefersReducedMotion ? 0 : 1;

            /* ── Smooth lerp of mouse to target ── */
            const lerpFactor = 0.04;
            target.x += (mouse.x - target.x) * lerpFactor;
            target.y += (mouse.y - target.y) * lerpFactor;

            /* ── Camera parallax ── */
            camera.position.x = target.x * 1.2;
            camera.position.y = -target.y * 0.8;

            /* ── Scroll-driven camera Z drift ── */
            camera.position.z = 8 - scroll.progress * 2.5;
            camera.lookAt(scene.position);

            /* ── Animate particles ── */
            const t = clock * 0.001;
            particles.forEach(p => {
                const d = p.userData;
                p.rotation.x += d.rotSpeedX;
                p.rotation.y += d.rotSpeedY;
                p.rotation.z += d.rotSpeedZ;
                p.position.y = d.originY + Math.sin(t * d.floatSpeed * 1000 + d.floatOffset) * d.floatAmp;
            });

            /* ── Animate crosses ── */
            crosses.forEach(c => {
                const d = c.userData;
                c.rotation.z += d.rotSpeedZ;
                c.position.y = d.originY + Math.sin(t * d.floatSpeed * 1000 + d.floatOffset) * d.floatAmp;
            });

            renderer.render(scene, camera);
        }

        if (!prefersReducedMotion) {
            animate();
        } else {
            // Render a single static frame for reduced-motion users
            renderer.render(scene, camera);
        }

        /* ────────────────────────────────
           7. RESIZE HANDLER
        ──────────────────────────────── */
        let resizeTimer;
        function onResize() {
            // Debounce resize events
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const w = container.clientWidth;
                const h = container.clientHeight;
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }, 150);
        }
        window.addEventListener('resize', onResize, { passive: true });

        /* ────────────────────────────────
           8. CLEAN UP ON UNLOAD
        ──────────────────────────────── */
        window.addEventListener('beforeunload', () => {
            cancelAnimationFrame(rafId);
            heroObserver.disconnect();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);

            // Dispose all geometries & materials
            [...geometries].forEach(g => g.dispose());
            [matGold, matNavy, matGlass, wireMat].forEach(m => m.dispose());
            renderer.dispose();
        });

    } // end initScene

})(); // IIFE
