/*
 * Dojo handwriting: recall-first practice using the site's local KanjiVG data.
 * Load kanjivg_data.js before this file. Stroke geometry remains attributed to
 * KanjiVG, (c) Ulrich Apel, CC BY-SA 3.0: https://kanjivg.tagaini.net/
 * https://creativecommons.org/licenses/by-sa/3.0/
 * Geometry is sampled from that existing source; no font-mask scoring fallback.
 */
(function (global) {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const geometryCache = new Map();
    const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function pathsFor(character) {
        const data = global.KVG_DATA;
        const paths = data && Object.prototype.hasOwnProperty.call(data, character) && data[character];
        return Array.isArray(paths) && paths.length && paths.every(path => typeof path === 'string' && path.length) ? paths : null;
    }

    function lengthOf(points) {
        let length = 0;
        for (let index = 1; index < points.length; index++) length += pointDistance(points[index - 1], points[index]);
        return length;
    }

    function resample(points, count) {
        if (!points.length) return [];
        const cumulative = [0];
        for (let index = 1; index < points.length; index++) cumulative.push(cumulative[index - 1] + pointDistance(points[index - 1], points[index]));
        const total = cumulative[cumulative.length - 1];
        if (total < 0.000001) return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
        const sampled = [];
        let segment = 0;
        for (let index = 0; index < count; index++) {
            const target = total * index / (count - 1);
            while (segment < points.length - 2 && cumulative[segment + 1] < target) segment++;
            const span = cumulative[segment + 1] - cumulative[segment];
            const fraction = span > 0 ? (target - cumulative[segment]) / span : 0;
            sampled.push({
                x: points[segment].x + (points[segment + 1].x - points[segment].x) * fraction,
                y: points[segment].y + (points[segment + 1].y - points[segment].y) * fraction
            });
        }
        return sampled;
    }

    function geometryFor(character) {
        const paths = pathsFor(character);
        if (!paths) return null;
        const cached = geometryCache.get(character);
        if (cached && cached.paths === paths) return cached.strokes;
        try {
            const strokes = paths.map(data => {
                const path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', data);
                const length = path.getTotalLength();
                if (!Number.isFinite(length) || length < 0.1) throw new Error('Missing stroke geometry');
                const count = clamp(Math.ceil(length * 1.2), 40, 240);
                const points = [];
                for (let index = 0; index < count; index++) {
                    const point = path.getPointAtLength(length * index / (count - 1));
                    // KanjiVG's 109 x 109 viewbox, with room for a finger near edges.
                    points.push({ x: 0.08 + point.x / 109 * 0.84, y: 0.08 + point.y / 109 * 0.84 });
                }
                return points;
            });
            geometryCache.set(character, { paths, strokes });
            return strokes;
        } catch (_) {
            return null;
        }
    }

    function nearestDistances(first, second) {
        return first.map(point => {
            let nearest = Infinity;
            for (const other of second) nearest = Math.min(nearest, pointDistance(point, other));
            return nearest;
        });
    }

    const average = numbers => numbers.reduce((sum, value) => sum + value, 0) / numbers.length;

    // As in writing.html: compare stray ink AND missed reference geometry, then
    // endpoints. Ordered samples and length limits also reject reversed strokes,
    // repeated loops, half-strokes, stationary dots, and back-and-forth scribbles.
    function compareStroke(drawn, reference) {
        const user = resample(drawn, 40);
        const guide = resample(reference, 40);
        const stray = nearestDistances(user, guide);
        const missed = nearestDistances(guide, user);
        const forward = pointDistance(user[0], guide[0]) + pointDistance(user[39], guide[39]);
        const reverse = pointDistance(user[0], guide[39]) + pointDistance(user[39], guide[0]);
        const ordered = average(user.map((point, index) => pointDistance(point, guide[index])));
        const reverseOrdered = average(user.map((point, index) => pointDistance(point, guide[39 - index])));
        const distance = Math.max(average(stray), average(missed), forward / 2, ordered * 0.75);
        const lengthRatio = lengthOf(drawn) / lengthOf(reference);
        const backwards = reverseOrdered + 0.025 < ordered && (reverse + 0.025 < forward || reverseOrdered < 0.06);
        const sizeOkay = lengthOf(drawn) >= 0.018 && lengthRatio >= 0.46 && lengthRatio <= 1.85;
        const fits = distance <= 0.105 && ordered <= 0.13 && Math.max(...stray, ...missed) <= 0.195;
        return {
            score: clamp(1 - Math.max(0, distance - 0.032) / 0.15, 0, 1),
            backwards,
            sizeOkay,
            correct: fits && sizeOkay && !backwards
        };
    }

    class DojoWriting {
        constructor(canvas, options) {
            if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('DojoWriting needs a canvas.');
            this.canvas = canvas;
            this.context = canvas.getContext('2d');
            if (!this.context) throw new Error('This browser cannot create a writing canvas.');
            this.onChange = options && typeof options.onChange === 'function' ? options.onChange : null;
            this.character = '';
            this.strokes = [];
            this.reference = null;
            this.assisted = false;
            this.guideVisible = false;
            this.activeStroke = null;
            this.pointerId = null;
            this.strokeBounds = null;
            this.destroyed = false;
            this.oldTouchAction = canvas.style.touchAction;
            this.oldLabel = canvas.getAttribute('aria-label');
            canvas.style.touchAction = 'none';
            canvas.setAttribute('aria-label', 'Handwriting pad. Draw the answer with a mouse, finger, or pen.');
            this.handlers = {
                pointerdown: event => this.startStroke(event),
                pointermove: event => this.moveStroke(event),
                pointerup: event => this.finishStroke(event),
                pointercancel: event => this.cancelStroke(event),
                lostpointercapture: event => this.cancelStroke(event)
            };
            for (const [name, handler] of Object.entries(this.handlers)) canvas.addEventListener(name, handler, { passive: false });
            this.resize = () => {
                // Rotation, fullscreen, or a panel reflow can move the pad under
                // a captured finger. Keep completed ink; discard that unfinished
                // stroke rather than splice coordinates from two different boxes.
                if (this.activeStroke && this.strokeBoundsChanged()) this.cancelStroke();
                else this.render();
            };
            if (typeof ResizeObserver !== 'undefined') {
                this.observer = new ResizeObserver(this.resize);
                this.observer.observe(canvas);
            }
            global.addEventListener('resize', this.resize);
            this.render();
        }

        static hasCharacter(character) { return Boolean(pathsFor(character)); }
        static expectedStrokes(character) { const paths = pathsFor(character); return paths ? paths.length : 0; }

        setCharacter(character, options) {
            this.releasePointer();
            this.character = String(character || '');
            this.reference = geometryFor(this.character);
            this.strokes = [];
            this.activeStroke = null;
            this.guideVisible = Boolean(options && options.showGuide);
            this.assisted = this.guideVisible;
            this.render();
            this.changed();
            return Boolean(this.reference);
        }

        getStrokeCount() { return this.strokes.length; }

        clear() {
            this.releasePointer();
            this.strokes = [];
            this.activeStroke = null;
            // Help remains recorded for this prompt even after clearing the ink.
            this.render();
            this.changed();
        }

        undo() {
            const wasDrawing = Boolean(this.activeStroke);
            this.releasePointer();
            this.activeStroke = null;
            if (!wasDrawing) this.strokes.pop();
            this.render();
            this.changed();
        }

        revealGuide() {
            this.guideVisible = true;
            this.assisted = true;
            this.render();
            this.changed();
        }

        hideGuide() {
            this.guideVisible = false;
            this.render();
            this.changed();
        }

        changed() {
            if (this.onChange && !this.destroyed) this.onChange({
                strokeCount: this.strokes.length,
                expectedStrokes: this.reference ? this.reference.length : 0,
                assisted: this.assisted,
                guideVisible: this.guideVisible,
                available: Boolean(this.reference)
            });
        }

        coordinates(event, bounds) {
            const rect = bounds || this.canvas.getBoundingClientRect();
            const side = Math.max(1, Math.min(rect.width, rect.height));
            return {
                x: clamp((event.clientX - rect.left - (rect.width - side) / 2) / side, -0.1, 1.1),
                y: clamp((event.clientY - rect.top - (rect.height - side) / 2) / side, -0.1, 1.1)
            };
        }

        strokeBoundsChanged() {
            if (!this.strokeBounds) return false;
            const rect = this.canvas.getBoundingClientRect();
            return ['left', 'top', 'width', 'height'].some(key => Math.abs(rect[key] - this.strokeBounds[key]) > 0.5);
        }

        startStroke(event) {
            if (this.destroyed || !this.reference || this.pointerId !== null || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
            event.preventDefault();
            this.pointerId = event.pointerId;
            const rect = this.canvas.getBoundingClientRect();
            this.strokeBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            this.activeStroke = [this.coordinates(event, rect)];
            try { this.canvas.setPointerCapture(event.pointerId); } catch (_) { /* Older browser: canvas events still work. */ }
            this.render();
        }

        moveStroke(event) {
            if (!this.activeStroke || event.pointerId !== this.pointerId) return;
            event.preventDefault();
            if (this.strokeBoundsChanged()) { this.cancelStroke(event); return; }
            const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
            for (const sample of events.length ? events : [event]) this.appendPoint(sample);
            this.render();
        }

        appendPoint(event) {
            const point = this.coordinates(event);
            const last = this.activeStroke[this.activeStroke.length - 1];
            if (pointDistance(point, last) < 0.0015) return;
            if (this.activeStroke.length < 2000) this.activeStroke.push(point);
            else this.activeStroke.overflow = true;
        }

        finishStroke(event) {
            if (!this.activeStroke || event.pointerId !== this.pointerId) return;
            event.preventDefault();
            if (this.strokeBoundsChanged()) { this.cancelStroke(event); return; }
            this.appendPoint(event);
            this.strokes.push(this.activeStroke);
            this.activeStroke = null;
            this.releasePointer();
            this.render();
            this.changed();
        }

        cancelStroke(event) {
            if (event && event.pointerId !== this.pointerId) return;
            this.activeStroke = null;
            this.releasePointer();
            this.render();
            this.changed();
        }

        releasePointer() {
            const pointerId = this.pointerId;
            this.pointerId = null;
            this.strokeBounds = null;
            try { if (pointerId !== null && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); } catch (_) { /* Capture may already be released. */ }
        }

        check() {
            const result = (correct, score, message) => ({ correct, score, message, assisted: this.assisted });
            if (!this.reference) return result(false, 0, 'Stroke data is unavailable for this character. Choose another practice item.');
            if (this.activeStroke) return result(false, 0, 'Lift your pen or finger before checking.');
            if (!this.strokes.length) return result(false, 0, 'Draw the character first.');
            if (this.strokes.length !== this.reference.length) return result(false, 0,
                'Use ' + this.reference.length + ' strokes; you drew ' + this.strokes.length + '. Undo a stroke or clear and try again.');
            if (this.strokes.some(stroke => stroke.overflow)) return result(false, 0, 'That stroke has too many extra marks. Clear the pad and use smooth strokes.');
            const matches = this.strokes.map((stroke, index) => compareStroke(stroke, this.reference[index]));
            const score = Math.round(average(matches.map(match => match.score)) * 100);
            const backwards = matches.findIndex(match => match.backwards);
            if (backwards !== -1) return result(false, score, 'Stroke ' + (backwards + 1) + ' goes backwards. Start at its numbered dot and follow the arrow.');
            const wrongSize = matches.findIndex(match => !match.sizeOkay);
            if (wrongSize !== -1) return result(false, score, 'Stroke ' + (wrongSize + 1) + ' is too short or has extra loops. Use one smooth stroke.');
            const wrongShape = matches.findIndex(match => !match.correct);
            if (wrongShape !== -1 || score < 72) {
                const wrongOrder = this.strokes.some((stroke, index) => this.reference.some((guide, other) => other !== index && compareStroke(stroke, guide).score > matches[index].score + 0.22));
                if (wrongOrder) return result(false, score, 'Check the stroke order. Use Help to study the numbered strokes, then try from memory.');
                const weakest = wrongShape !== -1 ? wrongShape : matches.reduce((best, match, index) => match.score < matches[best].score ? index : best, 0);
                return result(false, score, 'Keep the character centered and check stroke ' + (weakest + 1) + '. Help shows the stroke order.');
            }
            return result(true, score, this.assisted ? 'Good practice! Try the next one from memory to build your combo.' : 'Great writing! ' + score + '% accuracy.');
        }

        render() {
            if (this.destroyed) return;
            const canvas = this.canvas;
            const rect = canvas.getBoundingClientRect();
            // Hidden panels will be painted by ResizeObserver when opened.
            // Do not multiply intrinsic canvas dimensions while it has no box.
            if (rect.width <= 0 || rect.height <= 0) return;
            const width = rect.width;
            const height = rect.height;
            const ratio = clamp(global.devicePixelRatio || 1, 1, 3);
            const pixelWidth = Math.round(width * ratio);
            const pixelHeight = Math.round(height * ratio);
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }
            const context = this.context;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.clearRect(0, 0, width, height);
            context.fillStyle = '#fffdf4';
            context.fillRect(0, 0, width, height);
            const side = Math.min(width, height);
            context.save();
            context.translate((width - side) / 2, (height - side) / 2);
            context.scale(side, side);
            context.strokeStyle = '#b9cad2';
            context.lineWidth = 1 / side;
            context.strokeRect(0.045, 0.045, 0.91, 0.91);
            context.setLineDash([0.014, 0.014]);
            context.beginPath();
            context.moveTo(0.5, 0.045); context.lineTo(0.5, 0.955);
            context.moveTo(0.045, 0.5); context.lineTo(0.955, 0.5);
            context.stroke();
            context.setLineDash([]);
            context.lineCap = 'round';
            context.lineJoin = 'round';
            if (this.guideVisible && this.reference) {
                for (let index = 0; index < this.reference.length; index++) {
                    const stroke = this.reference[index];
                    this.paintStroke(stroke, '#9aaac2', 0.016);
                    const start = stroke[0];
                    context.fillStyle = '#3c4d6f';
                    context.beginPath(); context.arc(start.x, start.y, 0.025, 0, Math.PI * 2); context.fill();
                    context.fillStyle = '#ffffff';
                    context.font = 'bold 0.032px system-ui';
                    context.textAlign = 'center'; context.textBaseline = 'middle';
                    context.fillText(String(index + 1), start.x, start.y + 0.001);
                    const a = stroke[Math.floor(stroke.length * 0.28)];
                    const b = stroke[Math.floor(stroke.length * 0.38)];
                    const angle = Math.atan2(b.y - a.y, b.x - a.x);
                    context.fillStyle = '#5f7398';
                    context.beginPath();
                    context.moveTo(b.x + Math.cos(angle) * 0.016, b.y + Math.sin(angle) * 0.016);
                    context.lineTo(b.x + Math.cos(angle + 2.45) * 0.019, b.y + Math.sin(angle + 2.45) * 0.019);
                    context.lineTo(b.x + Math.cos(angle - 2.45) * 0.019, b.y + Math.sin(angle - 2.45) * 0.019);
                    context.closePath(); context.fill();
                }
            }
            for (const stroke of this.strokes) this.paintStroke(stroke, '#233b5f', 0.015);
            if (this.activeStroke) this.paintStroke(this.activeStroke, '#233b5f', 0.015);
            context.restore();
        }

        paintStroke(points, color, thickness) {
            if (!points.length) return;
            const context = this.context;
            context.strokeStyle = color;
            context.lineWidth = thickness;
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            if (points.length === 1) {
                context.fillStyle = color;
                context.arc(points[0].x, points[0].y, thickness / 2, 0, Math.PI * 2);
                context.fill();
            } else {
                for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
                context.stroke();
            }
        }

        destroy() {
            if (this.destroyed) return;
            this.releasePointer();
            this.destroyed = true;
            if (this.observer) this.observer.disconnect();
            global.removeEventListener('resize', this.resize);
            for (const [name, handler] of Object.entries(this.handlers)) this.canvas.removeEventListener(name, handler);
            this.canvas.style.touchAction = this.oldTouchAction;
            if (this.oldLabel === null) this.canvas.removeAttribute('aria-label');
            else this.canvas.setAttribute('aria-label', this.oldLabel);
            this.onChange = null;
        }
    }

    global.DojoWriting = DojoWriting;
})(window);
