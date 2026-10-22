/* Kana Dojo — dependency-free, locally rendered 3D taekwondo arena.
 * User-provided R:/ATA resources informed the rig and motion:
 * packages/shared/src/forms/poses.ts (KICK_POSES front/side/round chamber,
 * extension and re-chamber; knees flex positive and elbows negative),
 * packages/shared/src/forms/skeleton.ts and packages/web/src/forms/Figure3D.tsx
 * (Y-up/+Z-forward, ZXY limb rotations, sampled sole grounding with asymmetric
 * +0.5/-0.12 limits, layered dobok and bare striking surfaces).
 * Adapted for this original character rig and arcade sparring animation;
 * no logos, branding, React, Three.js, or external runtime assets are included.
 */
(function () {
    'use strict';

    const PI = Math.PI;
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const mix = (a, b, t) => a + (b - a) * t;
    const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const pulse = (t, a, b) => Math.sin(clamp((t - a) / (b - a), 0, 1) * PI);
    const namedColors = {
        white: '#f6f1df', yellow: '#f5c940', orange: '#f28b39', green: '#38a879',
        blue: '#4c81d8', purple: '#925ed2', brown: '#976b45', red: '#e25154',
        black: '#252d40', pink: '#f28da7', teal: '#39b6b0', navy: '#293d5b'
    };
    function rgb(value, fallback) {
        if (Array.isArray(value)) return value.slice(0, 3).map(n => n > 1 ? n / 255 : n);
        let s = namedColors[String(value || '').toLowerCase()] || value || fallback || '#ffffff';
        if (typeof s !== 'string' || !/^#[\da-f]{3,8}$/i.test(s)) s = fallback || '#ffffff';
        s = s.slice(1);
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
    }
    function hash(value) {
        let n = 0;
        for (const c of String(value || '')) n = ((n << 5) - n + c.charCodeAt(0)) | 0;
        return Math.abs(n);
    }

    // Column-major matrices; all meshes are genuinely three dimensional.
    const M = {
        identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
        multiply(a, b) {
            const out = new Float32Array(16);
            for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
                out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
            return out;
        },
        translate(x, y, z) { const a = M.identity(); a[12] = x; a[13] = y; a[14] = z; return a; },
        scale(x, y, z) { const a = M.identity(); a[0] = x; a[5] = y; a[10] = z; return a; },
        rx(t) { const a = M.identity(), c = Math.cos(t), s = Math.sin(t); a[5] = c; a[6] = s; a[9] = -s; a[10] = c; return a; },
        ry(t) { const a = M.identity(), c = Math.cos(t), s = Math.sin(t); a[0] = c; a[2] = -s; a[8] = s; a[10] = c; return a; },
        rz(t) { const a = M.identity(), c = Math.cos(t), s = Math.sin(t); a[0] = c; a[1] = s; a[4] = -s; a[5] = c; return a; },
        perspective(fov, aspect, near, far) {
            const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
            return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
        },
        lookAt(eye, at) {
            const normalize = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
            const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const z = normalize(eye.map((v, i) => v - at[i])), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
            return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
                -x.reduce((n, v, i) => n + v * eye[i], 0), -y.reduce((n, v, i) => n + v * eye[i], 0), -z.reduce((n, v, i) => n + v * eye[i], 0), 1]);
        },
        point(a, p) {
            return [a[0] * p[0] + a[4] * p[1] + a[8] * p[2] + a[12], a[1] * p[0] + a[5] * p[1] + a[9] * p[2] + a[13], a[2] * p[0] + a[6] * p[1] + a[10] * p[2] + a[14]];
        }
    };
    const append = (a, ...b) => b.reduce((n, v) => M.multiply(n, v), a);
    const place = (a, x, y, z) => M.multiply(a, M.translate(x, y, z));
    const shape = (a, x, y, z, sx, sy, sz) => append(a, M.translate(x, y, z), M.scale(sx, sy, sz));
    const limbRotation = a => append(M.identity(), M.rz(a[2]), M.rx(a[0]), M.ry(a[1]));
    const DEG = PI / 180;

    function cube() {
        const p = [], n = [], indices = [];
        const faces = [
            [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
            [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
            [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
            [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
            [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
            [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]
        ];
        for (const [normal, vertices] of faces) {
            const i = p.length / 3;
            vertices.forEach(v => { p.push(...v.map(c => c / 2)); n.push(...normal); });
            indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        return { p, n, indices };
    }
    function sphere(lat = 12, lon = 18) {
        const p = [], n = [], indices = [];
        for (let y = 0; y <= lat; y++) for (let x = 0; x <= lon; x++) {
            const a = y / lat * PI, b = x / lon * PI * 2;
            const v = [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
            p.push(...v); n.push(...v);
        }
        for (let y = 0; y < lat; y++) for (let x = 0; x < lon; x++) {
            const i = y * (lon + 1) + x;
            indices.push(i, i + 1, i + lon + 1, i + 1, i + lon + 2, i + lon + 1);
        }
        return { p, n, indices };
    }
    function cylinder(top = 1, bottom = 1, sides = 20) {
        const p = [], n = [], indices = [];
        for (let i = 0; i <= sides; i++) {
            const a = i / sides * PI * 2, x = Math.cos(a), z = Math.sin(a), slope = bottom - top;
            const len = Math.hypot(1, slope);
            p.push(x * bottom, -.5, z * bottom, x * top, .5, z * top);
            n.push(x / len, slope / len, z / len, x / len, slope / len, z / len);
            if (i < sides) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
        }
        for (let end = 0; end < 2; end++) {
            const c = p.length / 3, radius = end ? top : bottom;
            p.push(0, end ? .5 : -.5, 0); n.push(0, end ? 1 : -1, 0);
            for (let i = 0; i <= sides; i++) {
                const a = i / sides * PI * 2;
                p.push(Math.cos(a) * radius, end ? .5 : -.5, Math.sin(a) * radius); n.push(0, end ? 1 : -1, 0);
                if (i < sides) indices.push(c, c + i + 1 + (end ? 1 : 0), c + i + 1 + (end ? 0 : 1));
            }
        }
        return { p, n, indices };
    }
    function torus() {
        const p = [], n = [], indices = [], count = 48, tube = 6;
        for (let i = 0; i <= count; i++) for (let j = 0; j <= tube; j++) {
            const a = i / count * PI * 2, b = j / tube * PI * 2, r = 1 + .035 * Math.cos(b);
            p.push(Math.cos(a) * r, Math.sin(a) * r, .035 * Math.sin(b));
            n.push(Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b));
        }
        for (let i = 0; i < count; i++) for (let j = 0; j < tube; j++) {
            const a = i * (tube + 1) + j, b = a + tube + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
        return { p, n, indices };
    }

    const VERTEX = `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        uniform mat4 uModel;
        uniform mat4 uViewProjection;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
            vec4 world = uModel * vec4(aPosition, 1.0);
            // Compensate for nonuniform scale before rotating normals.
            vec3 sx = uModel[0].xyz, sy = uModel[1].xyz, sz = uModel[2].xyz;
            vNormal = normalize(sx * aNormal.x / max(dot(sx,sx),0.00001) + sy * aNormal.y / max(dot(sy,sy),0.00001) + sz * aNormal.z / max(dot(sz,sz),0.00001));
            vPosition = world.xyz;
            gl_Position = uViewProjection * world;
        }
    `;
    const FRAGMENT = `
        precision mediump float;
        uniform vec4 uColor;
        uniform float uEmissive;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
            vec3 n = normalize(vNormal);
            float key = max(dot(n, normalize(vec3(-0.45, 0.9, 0.6))), 0.0);
            float fill = max(dot(n, normalize(vec3(0.8, 0.35, -0.6))), 0.0);
            float hemi = n.y * 0.5 + 0.5;
            vec3 light = mix(vec3(0.29, 0.28, 0.36), vec3(0.55, 0.61, 0.66), hemi) + key * vec3(0.57, 0.49, 0.38) + fill * vec3(0.15, 0.20, 0.28);
            vec3 color = mix(uColor.rgb * light, uColor.rgb, uEmissive);
            float fog = smoothstep(7.0, 17.0, length(vPosition - vec3(0.0, 1.0, 5.5))) * 0.20;
            gl_FragColor = vec4(mix(color, vec3(0.14, 0.20, 0.27), fog), uColor.a);
        }
    `;

    const BASIC_MOVES = ['punch', 'front-kick', 'roundhouse', 'side-kick', 'axe-kick', 'turning-kick', 'back-kick'];
    const MOVE_NAMES = BASIC_MOVES.concat(['double-kick', 'jump-front-kick', 'jump-side-kick', 'spinning-hook-kick', 'tornado-kick', 'flying-double-kick', 'jump-roundhouse', 'spinning-back-kick', 'whirlwind-combo', 'dragon-finisher']);
    const DURATION = {
        punch: 1000, 'front-kick': 1100, roundhouse: 1250, 'side-kick': 1250,
        'axe-kick': 1400, 'turning-kick': 1450, 'back-kick': 1400,
        'double-kick': 1850, 'jump-front-kick': 1550, 'jump-side-kick': 1700,
        'spinning-hook-kick': 1850, 'tornado-kick': 1900, 'flying-double-kick': 2400,
        'jump-roundhouse': 1850, 'spinning-back-kick': 2000,
        'whirlwind-combo': 3400, 'dragon-finisher': 4450,
        hit: 750, bow: 1450, celebrate: 2200, guard: 600, block: 950
    };
    // Specials that already contain several techniques retain their own timing.
    // A normal streak adds a different basic technique without rushing either one.
    const SEQUENCES = {
        'whirlwind-combo': [{ move: 'turning-kick', end: .45 }, { move: 'spinning-hook-kick', end: 1 }],
        'dragon-finisher': [{ move: 'punch', end: .23 }, { move: 'jump-side-kick', end: .60 }, { move: 'tornado-kick', end: 1 }]
    };
    const APPROACH = {
        punch: 1.32, 'front-kick': 1.52, roundhouse: 1.46, 'side-kick': 1.27,
        'axe-kick': 1.67, 'turning-kick': 1.52, 'back-kick': 1.25,
        'double-kick': 1.48, 'jump-front-kick': 1.52, 'jump-side-kick': 1.27,
        'spinning-hook-kick': 1.48, 'tornado-kick': 1.50, 'flying-double-kick': 1.48,
        'jump-roundhouse': 1.46, 'spinning-back-kick': 1.25
    };
    const ALIASES = { 'straight-punch': 'punch', 'straight punch': 'punch', front: 'front-kick', 'front kick': 'front-kick', 'roundhouse-kick': 'roundhouse', 'roundhouse kick': 'roundhouse', side: 'side-kick', 'side kick': 'side-kick', axe: 'axe-kick', 'axe kick': 'axe-kick', turning: 'turning-kick', 'turning kick': 'turning-kick', double: 'double-kick', 'double kick': 'double-kick', back: 'back-kick', 'back kick': 'back-kick', tornado: 'tornado-kick', 'tornado kick': 'tornado-kick', spin: 'turning-kick', attack: 'front-kick', victory: 'celebrate' };

    function attackPhase(action, progress) {
        let move = action.move, u = progress, sequence = false, spinOffset = 0;
        if (action.chain) {
            // Use the choreography's original proportions when speed bonuses
            // shorten the whole action, so both strikes still finish cleanly.
            const split = DURATION[move] / (DURATION[move] + DURATION[action.followup]);
            if (progress >= split) { move = action.followup; u = (progress - split) / (1 - split); }
            else u = progress / split;
            sequence = true;
        } else if (SEQUENCES[move]) {
            let begin = 0;
            for (const part of SEQUENCES[move]) {
                if (progress <= part.end) { move = part.move; u = (progress - begin) / (part.end - begin); break; }
                if (part.move === 'turning-kick' || part.move === 'spinning-hook-kick' || part.move === 'tornado-kick') spinOffset += PI * 2;
                begin = part.end;
            }
            sequence = true;
        }
        return { move, u: clamp(u, 0, 1), sequence, spinOffset };
    }

    function strikePulse(move, u) {
        if (move === 'double-kick' || move === 'flying-double-kick') return Math.max(pulse(u, .25, .46), pulse(u, .57, .78));
        if (move === 'spinning-hook-kick') return pulse(u, .53, .75);
        return pulse(u, .48, .72);
    }

    // Contacts belong to the choreography, rather than the UI's answer timer.
    // This lets a rapid answer queue the next technique without cancelling the
    // second kick, its impact, or the rival's recovery from the previous one.
    function contactBeats(action) {
        const beats = [];
        const add = (move, from, to) => {
            const fractions = move === 'double-kick' || move === 'flying-double-kick' ? [.355, .675]
                : move === 'spinning-hook-kick' ? [.64] : [.6];
            fractions.forEach(fraction => beats.push({ at: mix(from, to, fraction), move, done: false, index: beats.length }));
        };
        if (action.chain) {
            const split = DURATION[action.move] / (DURATION[action.move] + DURATION[action.followup]);
            add(action.move, 0, split); add(action.followup, split, 1);
        } else if (SEQUENCES[action.move]) {
            let from = 0;
            for (const part of SEQUENCES[action.move]) { add(part.move, from, part.end); from = part.end; }
        } else if (MOVE_NAMES.includes(action.move)) add(action.move, 0, 1);
        return beats;
    }

    function ribbonMatrix(from, to, width) {
        const delta = to.map((v, i) => v - from[i]), length = Math.hypot(...delta);
        if (length < .0001) return null;
        const y = delta.map(v => v / length), helper = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
        let x = [y[1] * helper[2] - y[2] * helper[1], y[2] * helper[0] - y[0] * helper[2], y[0] * helper[1] - y[1] * helper[0]];
        const normalLength = Math.hypot(...x); x = x.map(v => v / normalLength);
        const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
        return new Float32Array([x[0] * width, x[1] * width, x[2] * width, 0,
            y[0] * length, y[1] * length, y[2] * length, 0, z[0] * width, z[1] * width, z[2] * width, 0,
            (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2, 1]);
    }

    class DojoScene {
        constructor(canvas, options = {}) {
            this.canvas = canvas;
            this.reducedMotion = !!options.reducedMotion;
            this.onError = options.onError || null;
            this.available = false;
            this.destroyed = false;
            this.action = null;
            this.actionQueue = [];
            this.pendingCelebration = false;
            this.reactions = { player: [], opponent: [] };
            // A flurry fall outlives the individual impact history, so a sixth
            // quick answer cannot erase the fifth answer's knockdown.
            this.knockdowns = { player: null, opponent: null };
            this.impacts = [];
            this.clockOffset = 0;
            this.frame = 0;
            this.lastFrame = 0;
            this.trails = [];
            this.playerBelt = rgb('white');
            this.opponent = this._opponent({ name: 'Hana', belt: 'yellow', hair: '#382b31', skin: '#d6a07d' });
            this._tick = this._tick.bind(this);
            this._onResize = this.resize.bind(this);
            this._onVisibility = () => {
                if (document.hidden) {
                    this.hiddenAt = performance.now();
                    cancelAnimationFrame(this.frame);
                    this.frame = 0;
                } else if (!this.destroyed && this.available) {
                    if (this.hiddenAt) {
                        const duration = performance.now() - this.hiddenAt;
                        this.clockOffset += duration;
                        if (this.action) this.action.start += duration;
                        this.trails.forEach(p => p.time += duration);
                        this.hiddenAt = 0;
                    }
                    this.lastFrame = 0;
                    this._schedule();
                }
            };
            this._onContextLost = event => {
                event.preventDefault();
                this.available = false;
                cancelAnimationFrame(this.frame);
                this.frame = 0;
            };
            this._onContextRestored = () => {
                if (this.destroyed) return;
                try { this._initGL(); this.resize(); this._schedule(); } catch (e) { this._fail(e); }
            };
            canvas.addEventListener('webglcontextlost', this._onContextLost);
            canvas.addEventListener('webglcontextrestored', this._onContextRestored);
            document.addEventListener('visibilitychange', this._onVisibility);
            window.addEventListener('resize', this._onResize);
            try {
                this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
                if (!this.gl) throw new Error('This browser does not provide WebGL.');
                this._initGL();
                if (window.ResizeObserver) {
                    this.observer = new ResizeObserver(this._onResize);
                    this.observer.observe(canvas);
                }
                this.resize();
                this._schedule();
            } catch (error) { this._fail(error); }
        }

        _fail(error) {
            this.available = false;
            this.error = error;
            if (typeof this.onError === 'function') this.onError(error);
        }

        _initGL() {
            const gl = this.gl;
            const compile = (source, type) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error);
                }
                return shader;
            };
            const vertex = compile(VERTEX, gl.VERTEX_SHADER), fragment = compile(FRAGMENT, gl.FRAGMENT_SHADER);
            this.program = gl.createProgram();
            gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
            gl.deleteShader(vertex); gl.deleteShader(fragment);
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
            gl.useProgram(this.program);
            this.locations = {};
            ['uModel', 'uViewProjection', 'uColor', 'uEmissive'].forEach(name => this.locations[name] = gl.getUniformLocation(this.program, name));
            ['aPosition', 'aNormal'].forEach(name => this.locations[name] = gl.getAttribLocation(this.program, name));
            this.meshes = {};
            const data = { cube: cube(), sphere: sphere(), cylinder: cylinder(), taper: cylinder(.78, 1), cone: cylinder(.04, 1), torus: torus() };
            for (const [key, mesh] of Object.entries(data)) {
                const entry = { count: mesh.indices.length };
                for (const name of ['p', 'n', 'indices']) {
                    entry[name] = gl.createBuffer();
                    const target = name === 'indices' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
                    gl.bindBuffer(target, entry[name]);
                    gl.bufferData(target, name === 'indices' ? new Uint16Array(mesh[name]) : new Float32Array(mesh[name]), gl.STATIC_DRAW);
                }
                this.meshes[key] = entry;
            }
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(.115, .177, .229, 1);
            this.available = true;
        }

        _opponent(o) {
            const seed = hash(o.name), skins = ['#c58b65', '#875333', '#e3af87', '#af7756', '#f1c5a2'];
            return {
                name: o.name || 'Hana', belt: rgb(o.belt || o.color || 'yellow'),
                skin: rgb(o.skin, skins[seed % skins.length]), hair: rgb(o.hair, ['#332831', '#3c2920', '#202e3a', '#79553c'][seed % 4]),
                scale: clamp(Number(o.scale) || (0.94 + seed % 5 * .035), .8, 1.16),
                build: .94 + seed % 4 * .055,
                hairstyle: o.hairstyle || ['bun', 'crop', 'curls', 'sweep'][seed % 4],
                accent: rgb(o.accent, ['#597c95', '#9e685f', '#697e69', '#9b7c56'][seed % 4])
            };
        }

        setFighters(config = {}) {
            if (config.playerBelt !== undefined) this.playerBelt = rgb(config.playerBelt);
            if (config.opponent) this.opponent = this._opponent(config.opponent);
            this.action = null;
            this.actionQueue.length = 0;
            this.pendingCelebration = false;
            this.reactions.player.length = 0;
            this.reactions.opponent.length = 0;
            this.knockdowns.player = this.knockdowns.opponent = null;
            this.impacts.length = 0;
            this.trails.length = 0;
        }

        play(options = {}) {
            // Speech callbacks can arrive between animation frames. Complete
            // any contacts whose time already passed before accepting a move.
            this._advanceActions(performance.now());
            let move = String(options.move || 'front-kick').toLowerCase().replace(/_/g, '-');
            move = ALIASES[move] || move;
            if (!DURATION[move]) move = 'front-kick';
            const chain = BASIC_MOVES.includes(move) && Number(options.combo) >= 3;
            const followup = move === 'punch' || move === 'front-kick' ? 'roundhouse' : 'punch';
            const attack = MOVE_NAMES.includes(move) && options.actor !== 'opponent' && options.hit !== false;
            const speedTier = attack && (options.speedTier === 'lightning' || Number(options.speedBonus) >= 6) ? 'lightning'
                : attack && (options.speedTier === 'quick' || Number(options.speedBonus) >= 3) ? 'quick' : '';
            const speed = speedTier === 'lightning' ? 2 : speedTier === 'quick' ? 1 : 0;
            const duration = Math.round((DURATION[move] + (chain ? DURATION[followup] : 0)) * (speed === 2 ? .57 : speed ? .72 : 1));
            const next = { actor: options.actor === 'opponent' ? 'opponent' : 'player', move, hit: options.hit !== false,
                combo: clamp(Number(options.combo) || 1, 1, 12), chain, followup, speedTier, speed,
                damage: Math.max(0, Number(options.damage) || 0), victory: !!options.victory,
                knockdown: attack && !!options.knockdown,
                finisher: !!options.finisher || move === 'dragon-finisher' || move === 'whirlwind-combo', start: performance.now(), duration };
            next.contacts = contactBeats(next);
            const a = this.action, now = next.start;
            const rapid = attack && a && a.actor === 'player' && a.hit && MOVE_NAMES.includes(a.move)
                && (speed || chain || a.speed || a.chain) && now - a.start < a.duration;
            const pendingKnockdown = a && [a, ...this.actionQueue].some(item => item.knockdown && item.contacts.some(contact => !contact.done));
            this.pendingCelebration = false;
            if (rapid || pendingKnockdown) {
                // Two buffered techniques keep the arena responsive even if a
                // speech provider delivers several transcripts in one burst.
                // Retain the first complete follow-up; the newest final move
                // replaces only an unstarted third animation, never a contact.
                if (this.actionQueue.length < 2) this.actionQueue.push(next);
                else {
                    // A five-answer knockdown is a promised visual reward.
                    // Keep it (and a winning strike) when newer speech arrives;
                    // only ordinary, unstarted animations may be replaced.
                    const replace = this.actionQueue.findLastIndex(item => !item.knockdown && !item.victory);
                    if (replace >= 0) {
                        this.actionQueue.splice(replace, 1);
                        this.actionQueue.push(next);
                    } else if (next.knockdown || next.victory) {
                        if (this.actionQueue.length < 4) this.actionQueue.push(next);
                        else {
                            // A provider can deliver an extreme transcript
                            // burst. Keep all four promised falls and attach
                            // the final result to the last pending contact.
                            const final = this.actionQueue[this.actionQueue.length - 1];
                            final.knockdown = final.knockdown || next.knockdown;
                            final.victory = final.victory || next.victory;
                        }
                    }
                }
                return Math.max(0, a.duration - (now - a.start)) + this.actionQueue.reduce((sum, item) => sum + item.duration, 0);
            }
            this.actionQueue.length = 0;
            this.action = next;
            this.lastTrail = 0;
            if (!attack) this.trails.length = 0;
            return duration;
        }

        celebrate() {
            if (this.action && this.action.hit && MOVE_NAMES.includes(this.action.move)) {
                this.pendingCelebration = true;
                return Math.max(0, this.action.duration - (performance.now() - this.action.start))
                    + this.actionQueue.reduce((sum, item) => sum + item.duration, 0) + 220 + DURATION.celebrate;
            }
            return this.play({ actor: 'player', move: 'celebrate', hit: false, combo: 1 });
        }

        _advanceActions(now) {
            let a = this.action;
            while (a) {
                const elapsed = now - a.start;
                if (a.hit && MOVE_NAMES.includes(a.move)) for (const contact of a.contacts) {
                    if (!contact.done && elapsed >= contact.at * a.duration) {
                        contact.done = true;
                        const victim = a.actor === 'player' ? 'opponent' : 'player', side = victim === 'opponent' ? 1 : -1;
                        const time = a.start + contact.at * a.duration - this.clockOffset;
                        const previous = this._reaction(victim, time + this.clockOffset);
                        const last = contact.index === a.contacts.length - 1;
                        const hit = { time, power: Math.min(1.7, .66 + a.speed * .24 + Math.min(a.combo, 6) * .065 + (a.finisher && last ? .2 : 0)),
                            speed: a.speed, combo: a.combo, index: contact.index + this.reactions[victim].length,
                            knockout: a.victory && last, knockdown: a.knockdown && last, finisher: a.finisher && last };
                        if (hit.knockdown) {
                            const previousFall = this.knockdowns[victim];
                            const age = previousFall ? (time - previousFall.time) / 1000 : -1;
                            this.knockdowns[victim] = { time: age >= 0 && age < 1.9 ? time - Math.min(age, .65) * 1000 : time,
                                knockout: hit.knockout || !!(age >= 0 && age < 1.9 && previousFall.knockout) };
                        }
                        else if (hit.knockout && this.knockdowns[victim]) {
                            const fall = this.knockdowns[victim], age = (time - fall.time) / 1000;
                            if (age >= 0 && age < 1.9) {
                                // Winning while the rival is down keeps the
                                // flat pose through Fiona's celebration.
                                fall.time = time - Math.min(age, .65) * 1000;
                                fall.knockout = true;
                            }
                        }
                        this.reactions[victim].push(hit);
                        this.reactions[victim] = this.reactions[victim].filter(item => time - item.time < 2800).slice(-8);
                        this.impacts.push({ ...hit, actor: a.actor, victim, point: [side * (1.04 + previous.push),
                            contact.move === 'axe-kick' ? 1.88 : contact.move === 'back-kick' ? 1.3 : 1.57, .48] });
                    }
                }
                if (elapsed < a.duration) break;
                const end = a.start + a.duration;
                if (this.actionQueue.length) {
                    a = this.actionQueue.shift(); a.start = end; this.lastTrail = 0;
                    this.action = a;
                } else if (this.pendingCelebration && elapsed >= a.duration + 220) {
                    this.pendingCelebration = false;
                    a = { actor: 'player', move: 'celebrate', hit: false, combo: 1, chain: false, speed: 0,
                        start: end + 220, duration: DURATION.celebrate, contacts: [] };
                    this.action = a;
                } else {
                    if (!this.pendingCelebration) this.action = null;
                    break;
                }
            }
            const time = now - this.clockOffset;
            this.impacts = this.impacts.filter(item => time - item.time < 680);
        }

        _reaction(actor, now) {
            const time = now - this.clockOffset, history = this.reactions[actor] || [];
            let amount = 0, push = 0, twist = 0, fold = 0, down = 0, pressure = 0, speed = 0;
            for (const hit of history) {
                const age = (time - hit.time) / 1000;
                if (age < 0 || age > 3) continue;
                const recoil = ease(age / .035) * Math.exp(-age * 5.3) * hit.power;
                const stagger = (1 - ease((age - .14) / (hit.speed || hit.combo >= 3 ? 1.08 : .65))) * hit.power;
                amount += recoil;
                push += stagger * (.13 + hit.speed * .065 + Math.min(hit.combo, 6) * .012);
                twist += recoil * (hit.index % 2 ? -.36 : .27);
                fold += stagger * (hit.index % 3 === 1 ? .5 : .1);
                pressure += stagger;
                speed = Math.max(speed, hit.speed);
                if (hit.knockout) down = Math.max(down, ease(age / .44) * (1 - ease((age - 2.1) / .6)));
                else if (hit.finisher) down = Math.max(down, ease(age / .18) * (1 - ease((age - .42) / .7)) * .5);
            }
            const fall = this.knockdowns[actor], fallAge = fall ? (time - fall.time) / 1000 : -1;
            const fallIn = this.reducedMotion ? .52 : .34;
            const riseAt = fall && fall.knockout ? 2.15 : 1.05;
            const knockdown = fallAge < 0 ? 0 : ease(fallAge / fallIn) * (1 - ease((fallAge - riseAt) / .85));
            return { amount: clamp(amount, 0, 1.55), push: clamp(push, 0, .68), twist: clamp(twist, -.55, .55),
                fold: clamp(fold, 0, .8), down, pressure: clamp(pressure, 0, 1.6), speed, knockdown, fallAge };
        }

        setReducedMotion(value) { this.reducedMotion = !!value; this.trails.length = 0; }

        resize() {
            if (!this.available || this.destroyed) return;
            const rect = this.canvas.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 1.8);
            const width = Math.max(1, Math.round((rect.width || this.canvas.clientWidth || 800) * ratio));
            const height = Math.max(1, Math.round((rect.height || this.canvas.clientHeight || 500) * ratio));
            if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
            this.gl.viewport(0, 0, width, height);
            this.aspect = width / height;
        }

        _schedule() { if (!this.frame && !this.destroyed && this.available && !document.hidden) this.frame = requestAnimationFrame(this._tick); }

        _draw(meshName, matrix, color, alpha = 1, emissive = 0) {
            const gl = this.gl, mesh = this.meshes[meshName], l = this.locations;
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p); gl.enableVertexAttribArray(l.aPosition); gl.vertexAttribPointer(l.aPosition, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n); gl.enableVertexAttribArray(l.aNormal); gl.vertexAttribPointer(l.aNormal, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
            gl.uniformMatrix4fv(l.uModel, false, matrix);
            gl.uniform4f(l.uColor, color[0], color[1], color[2], alpha);
            gl.uniform1f(l.uEmissive, emissive);
            gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }

        _arena(time) {
            const I = M.identity(), wood = rgb('#8b5741'), darkWood = rgb('#523c38'), trim = rgb('#d8a469');
            const draw = (mesh, x, y, z, sx, sy, sz, color, alpha, glow) => this._draw(mesh, shape(I, x, y, z, sx, sy, sz), color, alpha, glow);
            draw('cube', 0, -.16, 0, 17, .22, 14, darkWood);
            // Exposed honey-colored perimeter, teal interlocking practice floor.
            for (let i = -7; i <= 7; i++) draw('cube', i * .7, -.035, .2, .685, .07, 9, i % 2 ? wood : rgb('#986248'));
            draw('cube', 0, -.004, .25, 7.35, .12, 5.5, rgb('#243f50'));
            for (let x = 0; x < 10; x++) for (let z = 0; z < 7; z++) {
                const edge = x === 0 || x === 9 || z === 0 || z === 6;
                const color = edge ? ((x + z) % 2 ? rgb('#bc6f62') : rgb('#c57c69')) : ((x + z) % 2 ? rgb('#73b8b6') : rgb('#80c2bc'));
                draw('cube', (x - 4.5) * .7, .065, (z - 3) * .7 + .25, .696, .08, .696, color);
            }
            // Thin ivory ring and center marks sit on top of the mat.
            this._draw('torus', append(I, M.translate(0, .109, .25), M.rx(PI / 2), M.scale(2.15, 2.15, .6)), rgb('#f4e6c9'), .8, .3);
            for (const x of [-1.25, 1.25]) draw('cube', x, .108, .25, .48, .006, .06, rgb('#f1e4cb'), .9);
            // Back wall: plaster, wooden beams, and illuminated shoji panels.
            draw('cube', 0, 2.65, -4.55, 15, 5.6, .18, rgb('#e0c6a1'));
            draw('cube', 0, .45, -4.4, 15, .82, .16, wood);
            for (const x of [-6.3, -3.9, 0, 3.9, 6.3]) draw('cube', x, 2.7, -4.28, .16, 5.4, .28, darkWood);
            for (const y of [.92, 4.9]) draw('cube', 0, y, -4.25, 15, .15, .29, darkWood);
            for (const x of [-5.05, 5.05]) {
                draw('cube', x, 2.9, -4.36, 2.17, 3.75, .08, rgb('#f2dfb8'), 1, .25);
                for (let col = -2; col <= 2; col++) draw('cube', x + col * .41, 2.9, -4.22, .035, 3.7, .06, trim);
                for (let row = 0; row < 7; row++) draw('cube', x, 1.15 + row * .55, -4.2, 2.17, .035, .06, trim);
            }
            // Central hanging scroll and a small three-dimensional Taegeuk emblem.
            draw('cube', 0, 2.98, -4.15, 2.35, 3.45, .065, rgb('#f7ecd5'));
            for (const y of [1.24, 4.72]) this._draw('cylinder', append(I, M.translate(0, y, -4.08), M.rz(PI / 2), M.scale(.05, 2.55, .05)), darkWood);
            this._draw('cylinder', append(I, M.translate(0, 3.29, -4.07), M.rx(PI / 2), M.scale(.67, .045, .67)), rgb('#d47465'));
            this._draw('sphere', shape(I, -.24, 3.28, -4.005, .35, .35, .027), rgb('#335b78'));
            this._draw('sphere', shape(I, .24, 3.28, -3.997, .35, .35, .025), rgb('#d47465'));
            for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
                this._draw('cube', append(I, M.translate(side * .81, 3.63 - row * .11, -4.025), M.rz(side * -.32), M.scale(.31, .034, .034)), darkWood);
                this._draw('cube', append(I, M.translate(side * .81, 2.79 - row * .11, -4.025), M.rz(side * .32), M.scale(.31, .034, .034)), darkWood);
            }
            draw('cube', 0, 2.0, -4.045, 1.3, .045, .03, trim);
            draw('cube', 0, 1.85, -4.045, .85, .045, .03, trim);
            // Ceiling rafters and low lanterns give the open dojo depth.
            for (const x of [-5.4, 5.4]) {
                draw('cube', x, 2.45, -1.7, .22, 5.1, .22, darkWood);
                draw('cube', x, 4.9, -1.4, .24, .22, 7.6, darkWood);
            }
            for (const z of [-3.6, -.2, 3.4]) draw('cube', 0, 5.03, z, 11.1, .22, .22, wood);
            for (const x of [-3.25, 3.25]) {
                draw('cylinder', x, 4.35, -2.85, .025, 1.0, .025, darkWood);
                draw('sphere', x, 3.91, -2.85, .32, .43, .32, rgb('#f3c882'), 1, .65);
                for (const y of [3.53, 4.29]) draw('cylinder', x, y, -2.85, .21, .07, .21, darkWood);
                for (let i = 0; i < 6; i++) {
                    const a = i / 6 * PI * 2;
                    draw('cube', x + Math.cos(a) * .275, 3.91, -2.85 + Math.sin(a) * .275, .018, .63, .018, trim);
                }
            }
            // Equipment at each end: kick pads, racks, and a welcoming bonsai.
            for (const side of [-1, 1]) {
                const x = side * 4.25;
                draw('cube', x, .27, -2.85, 1.12, .15, .52, darkWood);
                for (const dx of [-.44, .44]) draw('cube', x + dx, .62, -2.85, .07, .8, .08, wood);
                draw('cube', x, .96, -2.85, 1.15, .08, .08, wood);
                for (let j = 0; j < 3; j++) {
                    const pad = append(I, M.translate(x + (j - 1) * .31, .78, -2.72), M.rz(side * -.18));
                    this._draw('sphere', append(pad, M.scale(.105, .24, .075)), rgb(j % 2 ? '#d97a64' : '#394d65'));
                    this._draw('cube', shape(pad, 0, -.24, 0, .035, .15, .035), darkWood);
                }
            }
            draw('taper', -3.25, .26, -3.3, .28, .4, .28, rgb('#a8604f'));
            draw('cylinder', -3.25, .62, -3.3, .065, .55, .065, wood);
            for (let i = 0; i < 5; i++) draw('sphere', -3.25 + Math.sin(i * 2.3) * .25, .98 + Math.sin(i) * .12, -3.3 + Math.cos(i * 2.3) * .17, .28, .2, .24, rgb(i % 2 ? '#547660' : '#6f8f64'));
            // Front edge is intentionally kept clear for complete views of both feet.
        }

        _reactPose(p, actor, now) {
            const reaction = this._reaction(actor, now), calm = this.reducedMotion ? .28 : 1;
            const h = reaction.amount * calm, stagger = reaction.pressure * calm, down = reaction.down * (this.reducedMotion ? .45 : 1);
            const side = actor === 'player' ? -1 : 1;
            p.hit = h;
            p.x += side * reaction.push * calm;
            p.z += reaction.twist * .22 * calm;
            p.yaw += reaction.twist * calm;
            // Alternate a snapped-back guard, a folded body reaction, and a
            // deep stumble. The knees and planted foot keep all of these poses
            // supported on the mat, including the final two-knee defeat pose.
            p.lean = -.43 * h + reaction.fold * .72 * calm + .65 * down;
            p.tilt = reaction.twist * .35 * calm;
            p.head -= .38 * h + .15 * down;
            p.headY += reaction.twist * .7 * calm;
            p.kneeL += .28 * stagger + .88 * down;
            p.kneeR += .38 * stagger + 1.18 * down;
            p.hipL[0] -= .09 * stagger + .38 * down;
            p.hipR[0] -= .16 * stagger + .62 * down;
            p.bob -= .095 * stagger + .22 * down;
            p.armL[0] += .64 * h - .35 * reaction.fold * calm;
            p.armR[0] += .8 * h - .2 * reaction.fold * calm;
            p.armL[2] -= .58 * h; p.armR[2] += .66 * h;
            p.elbowL += .83 * h + .2 * down; p.elbowR += 1.07 * h + .2 * down;
            p.beltSwing += .25 * h;
            p.dazed = h > .22 || down > .3;
            if (reaction.knockdown > 0) {
                const fall = reaction.knockdown;
                // Rotate the whole rig onto its back, rather than merely
                // bending its knees. The opponent stays visibly on the mat,
                // then rolls the bent legs underneath to regain the guard.
                p.bodyPitch = -1.5 * fall;
                p.bodyRoll = .11 * fall;
                const scale = actor === 'player' ? 1.02 : this.opponent.scale;
                // Keep the pelvis near its fighting position while the body
                // rotates. A foot-origin rotation alone throws the head well
                // beyond the side of a narrow screen.
                p.x = mix(p.x, side * 1.42, fall) - side * 1.1 * scale * Math.sin(1.5 * fall);
                p.z = mix(p.z, .47, fall);
                p.yaw = mix(p.yaw, side * -PI / 2, fall);
                p.bob = mix(p.bob, 0, fall);
                p.lean = mix(p.lean, .055, fall);
                p.tilt = mix(p.tilt, 0, fall);
                p.head = mix(p.head, .12, fall);
                p.headY = mix(p.headY, -.16, fall);
                p.pelvisX = mix(p.pelvisX, -.08, fall);
                p.hipL = p.hipL.map((v, i) => mix(v, [-.30, -.05, -.14][i], fall));
                p.hipR = p.hipR.map((v, i) => mix(v, [-.19, .12, .17][i], fall));
                p.kneeL = mix(p.kneeL, .82, fall); p.kneeR = mix(p.kneeR, 1.08, fall);
                p.armL = p.armL.map((v, i) => mix(v, [-.65, -.1, -.6][i], fall));
                p.armR = p.armR.map((v, i) => mix(v, [-.45, .1, .7][i], fall));
                p.elbowL = mix(p.elbowL, -.5, fall); p.elbowR = mix(p.elbowR, -.7, fall);
                p.dazed = true;
                p.knockdown = fall;
            }
            return p;
        }

        _pose(actor, now) {
            const t = (now - this.clockOffset) / 1000, isPlayer = actor === 'player';
            const phase = t * 2.8 + (isPlayer ? 0 : 1.5), motion = this.reducedMotion ? 0 : 1;
            const p = {
                x: isPlayer ? -1.23 : 1.23, y: 0, z: .33, yaw: isPlayer ? PI / 2 : -PI / 2,
                lean: 0, tilt: 0, headY: isPlayer ? -.19 : .1, pelvisX: 0, pelvisZ: 0, bob: Math.sin(phase) * .022 * motion,
                hipL: [-.08, -.08, -.08], hipR: [.15, .12, .07], kneeL: .1, kneeR: .22,
                armL: [-.47, -.18, .16], armR: [-.36, .12, -.15], elbowL: -2.13, elbowR: -2.23,
                head: -.08, smile: false, footL: 0, footR: 0, striking: false, strikeHand: false, strikeSide: 'right',
                beltSwing: Math.sin(phase) * .06 * motion, hit: 0, bodyPitch: 0, bodyRoll: 0, knockdown: 0
            };
            p.armL[0] += Math.sin(phase) * .025 * motion;
            p.armR[0] -= Math.sin(phase) * .025 * motion;
            const a = this.action;
            if (!a) return this._reactPose(p, actor, now);
            const progress = clamp((now - a.start) / a.duration, 0, 1);
            if (progress >= 1) return this._reactPose(p, actor, now);
            const part = attackPhase(a, progress), u = part.u, move = part.move;
            if (a.actor !== actor) {
                return this._reactPose(p, actor, now);
            }
            // A newly queued guard/counter must not pop a fallen opponent
            // upright. The persistent fall owns this rig until recovery;
            // answer scoring and the microphone continue independently.
            if (this._reaction(actor, now).knockdown > 0) return this._reactPose(p, actor, now);
            if (a.move === 'bow') {
                const b = pulse(u, .08, .94);
                p.lean = .68 * b; p.head = .22 * b;
                p.armL = [-.06, 0, -.08]; p.armR = [-.06, 0, .08];
                p.elbowL = -.05; p.elbowR = -.05;
                return p;
            }
            if (a.move === 'hit') {
                const h = pulse(u, 0, 1); p.hit = h; p.lean = -.3 * h; p.head = -.22 * h;
                p.x += (isPlayer ? -1 : 1) * h * .3;
                return p;
            }
            if (a.move === 'guard') {
                const h = pulse(u, 0, 1); p.armL[0] -= .45 * h; p.armR[0] -= .55 * h;
                p.elbowL += .4 * h; p.elbowR += .3 * h;
                return p;
            }
            if (a.move === 'block') {
                // Both forearms close across the face and chest while the
                // fighter settles into a braced stance. No hit flash or shake.
                const h = ease(u / .16) * (1 - ease((u - .7) / .3));
                const left = [-1.26, -.62, -.2], right = [-1.26, .62, .2];
                p.armL = p.armL.map((v, i) => mix(v, left[i], h));
                p.armR = p.armR.map((v, i) => mix(v, right[i], h));
                p.elbowL = mix(p.elbowL, -1.36, h); p.elbowR = mix(p.elbowR, -1.36, h);
                p.lean = -.14 * h; p.head = -.14 * h;
                p.kneeL += .13 * h; p.kneeR += .13 * h;
                p.x += (isPlayer ? -1 : 1) * .08 * h;
                p.beltSwing = .1 * h;
                return p;
            }
            if (a.move === 'celebrate') {
                const h = ease(u / .23) * (1 - ease((u - .77) / .23));
                p.y = this.reducedMotion ? 0 : Math.max(0, Math.sin(u * PI * 4)) * .12 * h;
                p.armL = [-2.8 * h - .1, 0, -.45 * h]; p.armR = [-2.8 * h - .1, 0, .45 * h];
                p.elbowL = -.15; p.elbowR = -.15; p.smile = true; p.head = -.1;
                p.yaw += Math.sin(u * PI * 3) * .15 * h;
                return p;
            }
            const rest = Object.fromEntries(Object.entries(p).map(([key, value]) => [key, Array.isArray(value) ? value.slice() : value]));
            const multi = part.sequence || move === 'double-kick' || move === 'flying-double-kick';
            const advance = multi ? ease(progress / .15) * (1 - ease((progress - .85) / .15)) : pulse(u, .04, .96);
            const chamber = pulse(u, .08, .91);
            const reach = part.sequence ? mix(1.3, APPROACH[move] || 1.4, chamber) : APPROACH[move] || 1.4;
            const targetReaction = this._reaction(isPlayer ? 'opponent' : 'player', now);
            p.x += (isPlayer ? 1 : -1) * advance * (reach + targetReaction.push * (this.reducedMotion ? .2 : .78));
            p.bob = 0; p.striking = u > .22 && u < .79;
            p.yaw += part.spinOffset;
            p.beltSwing = Math.sin(u * PI * 3) * .35;
            p.lean = -.16 * chamber;
            const lift = ease((u - .1) / .2) * (1 - ease((u - .73) / .17));
            const extend = ease((u - .3) / .2) * (1 - ease((u - .59) / .16));
            // R:/ATA front kick: a 98-degree high chamber, 134-degree knee
            // fold, 92/8-degree extension, then re-chamber before landing.
            p.hipR = [-mix(98, 92, extend) * DEG * lift, 0, -6 * DEG * lift];
            p.kneeR = mix(134, 8, extend) * DEG * lift + .08 * (1 - lift);
            p.footR = 18 * DEG * lift;
            p.pelvisX = -mix(8, 12, extend) * DEG * lift;
            p.hipL = [mix(6, 10, extend) * DEG * lift + .08 * (1 - lift), -.06, -.08];
            p.kneeL = mix(14, 12, extend) * DEG;
            p.armL = [-.7 - chamber * .3, -.1, -.35 * chamber];
            p.armR = [-.6 + chamber * .7, .1, .28 * chamber];
            p.elbowR = -1.05 + chamber * .7;
            switch (move) {
                case 'punch': {
                    // The shoulder reaches first, the elbow straightens, then
                    // the same joint chain retracts back to the cheek guard.
                    p.hipL = [-.08, -.08, -.08]; p.hipR = [.15, .12, .07];
                    p.kneeL = .16 + .12 * extend; p.kneeR = .22 + .1 * extend;
                    p.footR = 0; p.pelvisX = 0;
                    p.yaw += .13 * extend;
                    p.x += (isPlayer ? 1 : -1) * .46 * extend;
                    p.lean = .1 * extend;
                    p.armR = [mix(-.36, -1.50, extend), .03, -.04];
                    p.elbowR = mix(-2.23, -.06, extend);
                    p.armL = [-.6, -.18, .16]; p.elbowL = -2.13;
                    p.strikeHand = true; p.striking = extend > .14;
                    break;
                }
                case 'jump-front-kick': {
                    const jump = pulse(u, .08, .91);
                    p.y = jump * (this.reducedMotion ? .13 : .62);
                    p.hipL = [-.57 * jump, -.08, -.14];
                    p.kneeL = .2 + 1.2 * jump;
                    p.armL = [-1.1, -.1, -.5 * jump]; p.armR = [-.8, .1, .5 * jump];
                    p.elbowL = -1.1; p.elbowR = -1.15;
                    break;
                }
                case 'roundhouse':
                case 'jump-roundhouse': {
                    // Mirrored round_kick: halfway body blade, rolled hip,
                    // tucked heel and an instep-led whip across the target.
                    p.yaw += mix(26, 40, extend) * DEG * lift;
                    p.hipR = [-mix(56, 34, extend) * DEG * lift, mix(12, 16, extend) * DEG * lift, -mix(36, 58, extend) * DEG * lift];
                    p.kneeR = mix(120, 30, extend) * DEG * lift + .08 * (1 - lift);
                    p.pelvisX = 0; p.pelvisZ = -mix(12, 24, extend) * DEG * lift;
                    p.z += (isPlayer ? -1 : 1) * .2 * extend * lift;
                    p.headY = -44 * DEG * lift;
                    p.lean = -.18 * chamber; p.footR = 26 * DEG * lift;
                    if (move === 'jump-roundhouse') {
                        // Tuck the supporting leg during the leap while the
                        // striking instep whips across at shoulder height.
                        const jump = pulse(u, .08, .91);
                        p.y = jump * (this.reducedMotion ? .12 : .54);
                        p.hipL = [-.48 * jump, -.08, -.16 * jump];
                        p.kneeL = .16 + 1.22 * jump;
                        p.armL = [-1.05, -.1, -.6 * jump]; p.armR = [-.85, .1, .58 * jump];
                        p.elbowL = -.85; p.elbowR = -.95;
                    }
                    break;
                }
                case 'side-kick':
                case 'jump-side-kick': {
                    // Mirrored side_kick: a full body blade and lateral hip
                    // abduction distinguish the heel thrust from a front kick.
                    p.yaw += mix(68, 90, extend) * DEG * lift;
                    p.hipR = [-mix(16, 4, extend) * DEG * lift, 60 * DEG * extend * lift, -mix(52, 55, extend) * DEG * lift];
                    p.kneeR = mix(126, 8, extend) * DEG * lift + .08 * (1 - lift);
                    p.hipL = [-2 * DEG, 56 * DEG * lift, 34 * DEG * lift];
                    p.kneeL = mix(15, 6, extend) * DEG;
                    p.pelvisX = 0; p.pelvisZ = -mix(2, 22, extend) * DEG * lift;
                    p.lean = -.12 * chamber; p.tilt = 24 * DEG * lift;
                    p.headY = -57 * DEG * lift;
                    p.armR[0] = -.6 * chamber; p.footR = 55 * DEG * lift;
                    if (move === 'jump-side-kick') {
                        const jump = pulse(u, .08, .91);
                        p.y = jump * (this.reducedMotion ? .15 : .73);
                        p.hipL = [-.35 * jump, .25, .24 * jump]; p.kneeL = .12 + 1.25 * jump;
                        p.armL = [-1.1, -.1, -.62 * jump]; p.armR = [-.9, .1, .6 * jump];
                    }
                    break;
                }
                case 'axe-kick': {
                    // R:/ATA axe_kick borrows height from the pelvis rather
                    // than forcing the hip past its 118-degree high chamber.
                    const drop = ease((u - .46) / .18), recover = ease((u - .66) / .13);
                    p.hipR = [-mix(mix(118, 100, drop), 92, recover) * DEG * lift, 0, -6 * DEG * lift];
                    p.kneeR = mix(6, 120, recover) * DEG * lift + .08 * (1 - lift);
                    p.pelvisX = mix(-18, 2, drop) * DEG * lift;
                    p.hipL = [mix(16, -20, drop) * DEG * lift, 0, .07];
                    p.kneeL = mix(10, 30, drop) * DEG;
                    p.lean = mix(-18, 18, drop) * DEG * lift;
                    p.footR = -mix(mix(14, 22, drop), 8, recover) * DEG * lift;
                    break;
                }
                case 'turning-kick': {
                    // Complete the pivot before extension, so the kick lands
                    // on the rival instead of facing the camera at impact.
                    const spin = ease((u - .08) / .4);
                    p.yaw += spin * PI * 2;
                    p.hipR = [-1.55 * lift, -.25 * chamber, -.3 * chamber];
                    p.kneeR = (1 - extend) * 1.7 * lift + .06;
                    p.armL[2] = -.6 * chamber; p.armR[2] = .6 * chamber;
                    break;
                }
                case 'double-kick': {
                    const first = pulse(u, .12, .58), second = pulse(u, .44, .91);
                    p.hipR = [-1.56 * first, -.1, -.15 * first];
                    p.kneeR = (1 - first) * 1.9 * Math.min(1, first * 4) + .05;
                    p.hipL = [-1.5 * second, .1, .16 * second];
                    p.kneeL = (1 - second) * 1.9 * Math.min(1, second * 4) + .05;
                    p.y = .14 * Math.sin(u * PI) * motion;
                    p.lean = -.25 * chamber;
                    p.strikeSide = u < .49 ? 'right' : 'left';
                    break;
                }
                case 'flying-double-kick': {
                    // A sustained jump holds both soles clear while the rear
                    // and lead leg extend in two separate, readable beats.
                    const jump = pulse(u, .06, .95), first = pulse(u, .13, .57), second = pulse(u, .46, .90);
                    p.y = jump * (this.reducedMotion ? .18 : .92);
                    p.hipR = [-mix(.48, 1.53, first) * jump, -.08, -.13 * jump];
                    p.hipL = [-mix(.48, 1.53, second) * jump, .08, .13 * jump];
                    p.kneeR = mix(1.7, .06, first) * jump + .08 * (1 - jump);
                    p.kneeL = mix(1.7, .06, second) * jump + .08 * (1 - jump);
                    p.pelvisX = -.12 * jump; p.lean = -.22 * jump;
                    p.armL = [-1.1, -.1, -.7 * jump]; p.armR = [-1.1, .1, .7 * jump];
                    p.elbowL = -.65; p.elbowR = -.65;
                    p.strikeSide = u < .5 ? 'right' : 'left';
                    break;
                }
                case 'spinning-hook-kick': {
                    // The heel sweeps across an open arc after the pivot;
                    // a folding knee hooks it back rather than thrusting it.
                    const spin = ease((u - .06) / .48), sweep = ease((u - .44) / .25);
                    const hook = ease((u - .62) / .16);
                    p.yaw += PI * 2 * spin + (PI / 2 + (sweep - .5) * .4) * lift;
                    p.hipR = [mix(-.55, .35, sweep) * lift, mix(-.4, .75, sweep) * lift, -1.15 * lift];
                    p.kneeR = mix(1.6, .05, extend) * lift + hook * .95 * lift + .08 * (1 - lift);
                    p.hipL = [-.03, .55 * lift, .22 * lift]; p.kneeL = .17;
                    p.pelvisX = 0; p.pelvisZ = -.24 * lift; p.tilt = .28 * lift;
                    p.lean = -.2 * chamber; p.headY = -.8 * lift; p.footR = .85 * lift;
                    p.armL = [-1, 0, -.65 * chamber]; p.armR = [-1, 0, .65 * chamber];
                    p.elbowL = -.7; p.elbowR = -.7;
                    break;
                }
                case 'back-kick':
                case 'spinning-back-kick': {
                    // The special keeps the rear-facing thrust through impact,
                    // then completes the full turn as the heel re-chambers.
                    const turn = move === 'spinning-back-kick'
                        ? ease((u - .05) / .27) + ease((u - .66) / .25)
                        : ease((u - .07) / .25) * (1 - ease((u - .73) / .24));
                    p.yaw += PI * turn;
                    p.x += (isPlayer ? 1 : -1) * advance * .25;
                    // The supplied back_kick drives with a 42-degree hip
                    // extension and a forward pelvis fold, eyes over shoulder.
                    p.hipR = [mix(-86, 50, extend) * DEG * lift, .1, -.1 * chamber];
                    p.kneeR = mix(124, 6, extend) * DEG * lift + .08 * (1 - lift);
                    p.pelvisX = 42 * DEG * extend * lift;
                    p.hipL = [-60 * DEG * extend * lift, .1, .08];
                    p.kneeL = 12 * DEG;
                    p.lean = .6 * chamber; p.head = -.22; p.headY = 1.35 * lift;
                    p.armL = [-1.25, 0, -.28]; p.armR = [-1.25, 0, .28];
                    break;
                }
                case 'tornado-kick': {
                    const spin = ease((u - .08) / .42);
                    p.yaw += spin * PI * 2;
                    p.y = Math.sin(u * PI) * (this.reducedMotion ? .1 : .55);
                    p.hipR = [-1.5 * lift, -.35 * chamber, -.32 * chamber];
                    p.kneeR = (1 - extend) * 1.9 * lift + .08;
                    p.hipL = [-.55 * chamber, .2, .3 * chamber]; p.kneeL = .8 * chamber;
                    p.armL = [-1.2, 0, -.7 * chamber]; p.armR = [-1.2, 0, .7 * chamber];
                    p.elbowL = -.45; p.elbowR = -.45;
                    break;
                }
            }
            // Recover to the same guard between techniques. Keep the approach
            // across a sequence, and use the nearest full turn when settling
            // yaw so a completed spin never suddenly unwinds backwards.
            const settle = 1 - ease(u / .1) * (1 - ease((u - .84) / .16));
            if (settle > 0) for (const key of Object.keys(rest)) {
                if (key === 'x') continue;
                if (Array.isArray(p[key])) p[key] = p[key].map((value, i) => mix(value, rest[key][i], settle));
                else if (typeof p[key] === 'number') {
                    const target = key === 'yaw' ? rest.yaw + Math.round((p.yaw - rest.yaw) / (PI * 2)) * PI * 2 : rest[key];
                    p[key] = mix(p[key], target, settle);
                }
            }
            return p;
        }

        _legRoot(pose, side) {
            const a = side > 0 ? pose.hipL : pose.hipR;
            return append(M.identity(), M.translate(0, 1.1, 0), M.rx(pose.pelvisX), M.rz(pose.pelvisZ), M.translate(side * .147, 0, 0), limbRotation(a));
        }

        _groundLift(pose, scale) {
            // Figure3D/skeleton.ts's asymmetric sole-contact correction,
            // adapted to this rig's .50/.48 leg lengths. Jump offset stays
            // outside the solver so tornado kicks retain their airtime.
            let lowest = Infinity;
            const body = append(M.identity(), M.rx(pose.bodyPitch || 0), M.rz(pose.bodyRoll || 0));
            for (const side of [-1, 1]) {
                const left = side > 0;
                const ankle = append(body, this._legRoot(pose, side), M.translate(0, -.5, 0), M.rx(Math.max(0, left ? pose.kneeL : pose.kneeR)), M.translate(0, -.48, .005), M.rx(left ? pose.footL : pose.footR));
                for (const foot of [[0, -.088, .2], [0, -.088, -.06], [.065, -.088, .08], [-.065, -.088, .08]]) {
                    lowest = Math.min(lowest, M.point(ankle, foot)[1]);
                }
            }
            if (pose.knockdown > 0) {
                // During a fall the back, hands or head may touch first.
                // Sample their actual rig frames instead of forcing both
                // soles to remain planted underneath a horizontal body.
                const torso = append(body, M.translate(0, 1.1, 0), M.rx(pose.lean), M.rz(pose.tilt));
                const sample = (matrix, center, radius) => {
                    const point = M.point(matrix, center);
                    const extent = Math.hypot(matrix[1] * radius[0], matrix[5] * radius[1], matrix[9] * radius[2]);
                    lowest = Math.min(lowest, point[1] - extent);
                };
                sample(torso, [0, .32, 0], [.27, .4, .19]);
                const head = append(torso, M.translate(0, .92, .01), M.ry(pose.headY), M.rx(pose.head));
                sample(head, [0, 0, 0], [.22, .26, .2]);
                sample(head, [0, .119, -.041], [.22, .17, .2]);
                for (const side of [-1, 1]) {
                    const left = side > 0, arm = left ? pose.armL : pose.armR;
                    const hand = append(torso, M.translate(side * .28, .55, 0), limbRotation(arm), M.translate(0, -.32, 0), M.rx(left ? pose.elbowL : pose.elbowR));
                    sample(hand, [0, -.335, .018], [.1, .1, .09]);
                }
            }
            return clamp(.105 - (.11 + pose.bob + lowest * scale), -.12, .5);
        }

        _fighter(actor, pose, now) {
            const heroine = actor === 'player', o = this.opponent;
            const skin = heroine ? rgb('#efb48e') : o.skin, hair = heroine ? rgb('#ee963d') : o.hair;
            const belt = heroine ? this.playerBelt : o.belt, uniform = heroine ? rgb('#f9f2df') : rgb('#e6e9e0');
            const shade = heroine ? rgb('#d5d5c8') : rgb('#c4cfd0'), accent = heroine ? rgb('#bc5549') : o.accent;
            const build = heroine ? .94 : o.build, scale = heroine ? 1.02 : o.scale;
            const eye = rgb('#273b42'), root = append(M.identity(), M.translate(pose.x, .11 + pose.y + pose.bob + this._groundLift(pose, scale), pose.z), M.ry(pose.yaw), M.rx(pose.bodyPitch || 0), M.rz(pose.bodyRoll || 0), M.scale(scale, scale, scale));
            const draw = (name, matrix, color, alpha, emissive) => this._draw(name, matrix, color, alpha, emissive);
            const torso = append(root, M.translate(0, 1.1, 0), M.rx(pose.lean), M.rz(pose.tilt));
            // A fitted, layered dobok with modeled lapels, seam, belt knot, and tails.
            draw('taper', shape(torso, 0, .32, 0, .25 * build, .63, .165), uniform);
            draw('sphere', shape(torso, 0, .58, 0, .28 * build, .17, .17), uniform);
            draw('taper', append(torso, M.translate(0, -.005, 0), M.rx(PI), M.scale(.265 * build, .27, .18)), uniform);
            draw('cube', shape(torso, 0, .015, .178, .014, .2, .009), shade);
            draw('sphere', shape(torso, 0, .7, 0, .1, .135, .095), skin);
            for (const side of [-1, 1]) {
                const lapel = append(torso, M.translate(side * .071, .49, .156), M.rz(side * -.46));
                draw('cube', append(lapel, M.scale(.077, .36, .028)), shade);
                draw('cube', shape(lapel, 0, 0, .013, .043, .35, .016), uniform);
            }
            draw('cube', shape(torso, -.12, .38, .171, .055, .07, .009), accent);
            draw('cube', shape(torso, -.12, .38, .178, .027, .042, .009), uniform);
            draw('cylinder', shape(torso, 0, .105, 0, .268 * build, .092, .187), belt);
            draw('sphere', shape(torso, 0, .105, .194, .064, .057, .04), belt);
            for (const side of [-1, 1]) {
                const tail = append(torso, M.translate(side * .035, .087, .205), M.rz(side * .18), M.rx(pose.beltSwing));
                draw('cube', shape(tail, 0, -.13, .015, .052, .28 + side * .025, .025), belt);
                draw('cube', shape(tail, 0, -.235 - side * .012, .032, .046, .012, .006), rgb('#eacb82'));
            }
            // Face remains three dimensional as fighters turn and spin.
            const head = append(torso, M.translate(0, .92, .01), M.ry(pose.headY), M.rx(pose.head));
            draw('sphere', shape(head, 0, 0, 0, .207, .25, .192), skin);
            for (const side of [-1, 1]) {
                draw('sphere', shape(head, side * .2, -.018, -.002, .035, .06, .035), skin);
                if (pose.dazed) {
                    draw('cube', append(head, M.translate(side * .078, .024, .183), M.rz(side * -.25), M.scale(.068, .012, .015)), eye);
                } else {
                    draw('sphere', shape(head, side * .077, .023, .176, .048, .031, .017), rgb('#fbf3dd'));
                    draw('sphere', shape(head, side * .078, .024, .191, .021, .027, .008), eye);
                    draw('sphere', shape(head, side * .083 - .006, .033, .198, .006, .008, .003), rgb('#ffffff'), 1, .6);
                }
                draw('cube', append(head, M.translate(side * .079, .081, .177), M.rz(side * -.1), M.scale(.083, .014, .013)), hair);
                if (heroine) draw('sphere', shape(head, side * .123, -.057, .158, .037, .018, .009), rgb('#d88d7f'));
            }
            draw('sphere', shape(head, 0, -.026, .193, .026, .036, .027), skin);
            if (pose.dazed) draw('sphere', shape(head, 0, -.102, .174, .027, .035, .012), rgb('#985b53'));
            else draw('cube', shape(head, 0, -.104, .174, pose.smile ? .079 : .052, .012, .011), rgb('#985b53'));
            if (pose.smile) draw('cube', shape(head, 0, -.098, .183, .051, .01, .007), rgb('#fff8e6'));
            // Fiona has orange shoulder-length hair with a clear forehead fringe.
            draw('sphere', shape(head, 0, .119, -.041, .216, .168, .19), hair);
            if (heroine) {
                // Rounded side and back panels end at the dobok shoulders.
                draw('sphere', shape(head, 0, -.105, -.13, .217, .285, .112), hair);
                for (const side of [-1, 1]) {
                    draw('sphere', append(head, M.translate(side * .167, -.11, -.038), M.rz(side * .045), M.scale(.093, .28, .143)), hair);
                    draw('sphere', shape(head, side * .179, -.29, -.037, .076, .103, .122), hair);
                    draw('sphere', shape(head, side * .202, -.075, -.006, .014, .185, .085), rgb('#f3b05e'));
                }
                // Rounded locks form bangs across the forehead, above the eyes.
                for (let i = -2; i <= 2; i++) {
                    const fringe = append(head, M.translate(i * .06, .143 + (i === 0 ? -.012 : 0), .171), M.rz(i * -.09), M.scale(.052, .082, .039));
                    draw('sphere', fringe, hair);
                }
            } else {
                draw('sphere', append(head, M.translate(-.115, .123, .093), M.rz(-.35), M.scale(.13, .12, .09)), hair);
                draw('sphere', shape(head, .13, .079, -.033, .084, .15, .141), hair);
            }
            if (!heroine && o.hairstyle === 'bun') {
                const swing = this.reducedMotion ? 0 : Math.sin((now - this.clockOffset) / 180 + pose.yaw) * .06 + pose.beltSwing * .4;
                const pony = append(head, M.translate(0, .13, -.19), M.rx(-.38 + swing));
                draw('sphere', shape(pony, 0, -.03, -.065, .13, .13, .11), hair);
                draw('cylinder', append(pony, M.translate(0, -.03, -.03), M.rx(PI / 2), M.scale(.09, .025, .09)), belt);
            } else if (!heroine && o.hairstyle === 'curls') {
                for (let i = 0; i < 8; i++) {
                    const a = i / 8 * PI * 2;
                    draw('sphere', shape(head, Math.cos(a) * .17, .16 + (i % 2) * .03, Math.sin(a) * .14 - .03, .105, .1, .1), hair);
                }
            } else if (!heroine && o.hairstyle === 'sweep') {
                draw('sphere', append(head, M.translate(-.04, .23, -.02), M.rz(-.35), M.scale(.19, .1, .15)), hair);
            }
            let strikePoint = null;
            for (const side of [-1, 1]) {
                const left = side > 0, a = left ? pose.armL : pose.armR;
                const shoulder = append(torso, M.translate(side * .265 * build, .55, 0), limbRotation(a));
                draw('sphere', shape(shoulder, 0, -.02, 0, .125, .13, .125), uniform);
                draw('taper', shape(shoulder, 0, -.17, 0, .106, .34, .105), uniform);
                draw('cylinder', shape(shoulder, 0, -.29, 0, .105, .035, .105), shade);
                const elbow = append(shoulder, M.translate(0, -.32, 0), M.rx(left ? pose.elbowL : pose.elbowR));
                draw('sphere', shape(elbow, 0, 0, 0, .089, .095, .089), uniform);
                draw('taper', shape(elbow, 0, -.145, 0, .083, .29, .083), uniform);
                draw('cylinder', shape(elbow, 0, -.27, 0, .08, .025, .08), shade);
                draw('sphere', shape(elbow, 0, -.335, .018, .077, .089, .074), skin);
                draw('sphere', shape(elbow, -side * .055, -.325, .047, .026, .047, .032), skin);
                if (pose.striking && pose.strikeHand && !left) strikePoint = M.point(elbow, [0, -.39, .018]);
            }
            for (const side of [-1, 1]) {
                const left = side > 0;
                const hip = M.multiply(root, this._legRoot(pose, side));
                draw('sphere', shape(hip, 0, -.04, 0, .143, .16, .14), uniform);
                draw('taper', shape(hip, 0, -.26, 0, .135, .5, .13), uniform);
                const knee = append(hip, M.translate(0, -.5, 0), M.rx(left ? pose.kneeL : pose.kneeR));
                draw('sphere', shape(knee, 0, -.018, .005, .115, .12, .113), uniform);
                draw('taper', shape(knee, 0, -.235, -.008, .105, .46, .1), uniform);
                draw('cylinder', shape(knee, 0, -.439, -.008, .103, .027, .098), shade);
                const ankle = append(knee, M.translate(0, -.48, .005), M.rx(left ? pose.footL : pose.footR));
                draw('sphere', shape(ankle, 0, .005, .005, .074, .1, .075), skin);
                draw('sphere', shape(ankle, 0, -.022, .084, .088, .066, .17), skin);
                draw('cube', shape(ankle, 0, -.02, .202, .13, .044, .04), skin);
                if (pose.striking && !pose.strikeHand && left === (pose.strikeSide === 'left')) strikePoint = M.point(ankle, [0, -.02, .18]);
            }
            return strikePoint;
        }

        _shadows(poses) {
            this.gl.depthMask(false);
            for (const p of poses) for (let i = 0; i < 3; i++) {
                const spread = .77 + i * .15 + p.y * .15;
                const groundedX = p.x + Math.sin(-(p.bodyPitch || 0)) * (p.x < 0 ? -1 : 1) * .75;
                this._draw('cylinder', shape(M.identity(), groundedX, .113 + i * .0007, p.z, spread, .002, spread * .42), rgb('#283e49'), (.15 - i * .025) * (1 - p.y * .28), 1);
            }
            this.gl.depthMask(true);
        }

        _effects(now, foot) {
            const a = this.action;
            if (this.reducedMotion) return;
            const progress = a ? clamp((now - a.start) / a.duration, 0, 1) : 1;
            const part = a ? attackPhase(a, progress) : { move: '', u: 1 }, t = part.u;
            const speed = a && a.speed || 0;
            const color = a && a.actor === 'opponent' ? rgb('#dd9e91') : rgb(speed === 2 ? '#8df9ef' : speed ? '#ffd46d' : '#ffe5a1');
            if (foot && (!this.lastTrail || now - this.lastTrail > (speed ? 16 : 24))) {
                this.trails.push({ point: foot, time: now, speed, color }); this.lastTrail = now;
            }
            this.trails = this.trails.filter(p => now - p.time < (p.speed ? 350 : 240));
            this.gl.depthMask(false);
            let previous = null;
            for (const p of this.trails) {
                const age = (now - p.time) / (p.speed ? 350 : 240), size = (1 - age) * (p.speed ? .1 : .085);
                if (previous && Math.hypot(...p.point.map((v, i) => v - previous.point[i])) < .85) {
                    const outer = ribbonMatrix(previous.point, p.point, size * 1.8), inner = ribbonMatrix(previous.point, p.point, size * .45);
                    if (outer) this._draw('cube', outer, p.color || color, (1 - age) * .2, 1);
                    if (inner) this._draw('cube', inner, p.color || color, (1 - age) * .76, 1);
                }
                this._draw('sphere', shape(M.identity(), ...p.point, size * .6, size * .6, size * .6), p.color || color, (1 - age) * .32, 1);
                previous = p;
            }
            if (a && speed && MOVE_NAMES.includes(a.move)) {
                // A few low-opacity streaks follow Fiona's approach instead of
                // obscuring the characters with a full-screen flash.
                const rush = pulse(t, .14, .9), sweep = ease(clamp((t - .14) / .66, 0, 1));
                for (let i = 0; i < 5 + speed * 3; i++) {
                    const x = -2.45 + sweep * 3.05 + (i % 3) * .29;
                    const y = .46 + (i % 4) * .48, z = -.18 + (i % 2) * .35;
                    this._draw('cube', shape(M.identity(), x, y, z, .36 + speed * .12, .011, .011), color, rush * .34, 1);
                }
            }
            for (const hit of this.impacts) {
                const age = (now - this.clockOffset - hit.time) / 1000;
                if (age < 0 || age > .58) continue;
                const side = hit.actor === 'player' ? 1 : -1, [x, y, z] = hit.point;
                const impact = 1 - ease(age / .42), expansion = ease(age / .5), sparks = 9 + hit.speed * 4;
                const hue = rgb(hit.speed === 2 ? '#a8fff0' : hit.speed ? '#ffda78' : '#ffe5a1');
                for (let i = 0; i < sparks; i++) {
                    const angle = i / sparks * PI * 2 + hit.index * .31, distance = .1 + expansion * (.55 + hit.speed * .16);
                    const matrix = append(M.identity(), M.translate(x + side * expansion * .15 + Math.cos(angle) * distance * .7,
                        y + Math.sin(angle) * distance, z + .02), M.rz(angle - PI / 2), M.scale(.024 + impact * .025, (.14 + hit.speed * .045) * impact, .024));
                    this._draw('cube', matrix, hue, impact * .95, 1);
                }
                this._draw('torus', append(M.identity(), M.translate(x, y, z + .04), M.scale(.12 + expansion * .7, .12 + expansion * .7, .6)), hue, impact * .68, 1);
                if (hit.speed || hit.combo >= 3) {
                    // A narrow directional shock streak makes the direction of
                    // the knockback visible without hiding either fighter.
                    const matrix = ribbonMatrix([x - side * .26, y, z + .04], [x + side * (.2 + expansion * .85), y + expansion * .13, z + .04], .035 * impact);
                    if (matrix) this._draw('cube', matrix, rgb('#fff7d8'), impact * .84, 1);
                    this._draw('torus', append(M.identity(), M.translate(x + side * expansion * .17, y, z + .055), M.scale(.07 + expansion * .45, .07 + expansion * .45, .6)), rgb('#fff7d8'), impact * .42, 1);
                }
            }
            for (const actor of ['player', 'opponent']) {
                const r = this._reaction(actor, now), side = actor === 'player' ? -1 : 1;
                if (r.knockdown > .05) {
                    const landing = clamp((r.fallAge - .18) / .55, 0, 1), dust = Math.sin(landing * PI);
                    const x = side * 1.83;
                    this._draw('torus', append(M.identity(), M.translate(x, .125, .42), M.rx(PI / 2), M.scale(.3 + landing * 1.05, .16 + landing * .55, .8)), rgb('#c3fff2'), dust * .7, 1);
                    for (let i = 0; i < 6; i++) {
                        const angle = i * PI / 3, drift = .2 + landing * .75;
                        this._draw('sphere', shape(M.identity(), x + Math.cos(angle) * drift, .15 + dust * .08, .42 + Math.sin(angle) * drift * .45,
                            .16 + landing * .13, .05 + dust * .05, .11), rgb('#e8d7a7'), dust * .24, 1);
                    }
                    for (let i = 0; i < 3; i++) {
                        const angle = now / 350 + i * PI * 2 / 3;
                        const star = append(M.identity(), M.translate(side * 2.43 + Math.cos(angle) * .23, .66 + Math.sin(angle * 2) * .04, .4 + Math.sin(angle) * .19), M.rz(angle));
                        this._draw('cube', append(star, M.scale(.085, .025, .025)), rgb('#ffe183'), r.knockdown * .85, 1);
                        this._draw('cube', append(star, M.scale(.025, .085, .025)), rgb('#ffe183'), r.knockdown * .85, 1);
                    }
                }
                if (r.pressure < .2) continue;
                const x = side * (1.23 + r.push), skid = Math.min(1, r.pressure);
                for (let i = 0; i < 3; i++) this._draw('sphere', shape(M.identity(), x + side * (i * .1 + .11), .14 + i * .025, .21 + i * .1,
                    .14 + i * .025, .024 + i * .012, .08 + i * .015), rgb('#e8d7a7'), skid * (.19 - i * .035), 1);
                if (r.down > .45 && r.knockdown < .05) for (let i = 0; i < 3; i++) {
                    const angle = now / 240 + i * PI * 2 / 3;
                    const star = append(M.identity(), M.translate(x + Math.cos(angle) * .31, 2.05 - r.down * .34 + Math.sin(angle * 2) * .04, .3 + Math.sin(angle) * .21), M.rz(angle));
                    this._draw('cube', append(star, M.scale(.085, .025, .025)), rgb('#ffe183'), r.down * .9, 1);
                    this._draw('cube', append(star, M.scale(.025, .085, .025)), rgb('#ffe183'), r.down * .9, 1);
                }
            }
            if (a && a.move === 'celebrate') {
                for (let i = 0; i < 24; i++) {
                    const seed = i * 2.399, spread = (t * 1.4 + .1), y = 2.2 + Math.sin(seed) * spread - t * 1.8;
                    if (y < .15) continue;
                    const x = -1.23 + Math.cos(seed) * spread, z = .25 + Math.sin(i * 3.1) * spread;
                    this._draw('cube', append(M.identity(), M.translate(x, y, z), M.rz(t * 6 + seed), M.rx(t * 5), M.scale(.045, .075, .015)), rgb(['#f3cc75', '#e59983', '#98d9c7'][i % 3]), 1 - t * .4, .4);
                }
            }
            this.gl.depthMask(true);
        }

        _tick(now) {
            this.frame = 0;
            if (this.destroyed || !this.available || document.hidden) return;
            // Capping at 40 fps keeps mobile practice sessions cool while motion stays fluid.
            if (this.lastFrame && now - this.lastFrame < 24) { this._schedule(); return; }
            this.lastFrame = now;
            this._advanceActions(now);
            const gl = this.gl;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(this.program);
            let shake = 0, speedPush = 0;
            if (this.action && this.action.hit && !this.reducedMotion && MOVE_NAMES.includes(this.action.move)) {
                const progress = clamp((now - this.action.start) / this.action.duration, 0, 1);
                const part = attackPhase(this.action, progress);
                shake = Math.sin(now * .12) * strikePulse(part.move, part.u) * .018;
                speedPush = (this.action.speed || 0) * .13 * pulse(part.u, .15, .9);
            }
            if (!this.reducedMotion && this.impacts.length) {
                const hit = this.impacts[this.impacts.length - 1], age = (now - this.clockOffset - hit.time) / 1000;
                if (age >= 0 && age < .12) shake += Math.sin(age * 68) * (1 - age / .12) * (.018 + hit.speed * .012);
            }
            const narrow = this.aspect < 1.15, distance = narrow ? 8.2 + (1.15 - this.aspect) * 4 : 7.2;
            const view = M.lookAt([shake, 3.05 + shake, distance - speedPush], [0, 1.27, -.3]);
            const projection = M.perspective((narrow ? 38 : 36) * PI / 180, this.aspect || 1.6, .1, 40);
            gl.uniformMatrix4fv(this.locations.uViewProjection, false, M.multiply(projection, view));
            this._arena(now);
            const player = this._pose('player', now), opponent = this._pose('opponent', now);
            this._shadows([player, opponent]);
            const playerFoot = this._fighter('player', player, now), opponentFoot = this._fighter('opponent', opponent, now);
            this._effects(now, this.action && this.action.actor === 'opponent' ? opponentFoot : playerFoot);
            this._schedule();
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.actionQueue.length = 0;
            this.impacts.length = 0;
            this.reactions.player.length = 0;
            this.reactions.opponent.length = 0;
            this.knockdowns.player = this.knockdowns.opponent = null;
            this.pendingCelebration = false;
            cancelAnimationFrame(this.frame);
            if (this.observer) this.observer.disconnect();
            document.removeEventListener('visibilitychange', this._onVisibility);
            window.removeEventListener('resize', this._onResize);
            this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
            this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
            if (this.gl && this.meshes) for (const mesh of Object.values(this.meshes)) for (const key of ['p', 'n', 'indices']) this.gl.deleteBuffer(mesh[key]);
            if (this.gl && this.program) this.gl.deleteProgram(this.program);
            this.available = false;
        }
    }

    DojoScene.moves = MOVE_NAMES.slice();
    window.DojoScene = DojoScene;
})();
