function parseComputedColor(computed) {
	// rgb(r, g, b) or rgba(r, g, b, a)
	let match = computed.match(/rgba?\(\s*([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/);
	if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];

	// color(srgb r g b) — values are 0–1
	match = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
	if (match) return [Math.round(match[1] * 255), Math.round(match[2] * 255), Math.round(match[3] * 255)];

	// Fallback: canvas normalizes any valid CSS color to #rrggbb
	const ctx = document.createElement('canvas').getContext('2d');
	ctx.fillStyle = computed;
	const hex = ctx.fillStyle;
	if (hex.startsWith('#')) {
		return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	}

	return null;
}

const formatColor = {
	rgb: (r, g, b) => `rgb(${r}, ${g}, ${b})`,

	hex: (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''),

	hsl: (r, g, b) => {
		const [rn, gn, bn] = [r / 255, g / 255, b / 255];
		const max = Math.max(rn, gn, bn);
		const min = Math.min(rn, gn, bn);
		const d = max - min;
		const l = (max + min) / 2;
		if (d === 0) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		let h;
		if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
		else if (max === gn) h = ((bn - rn) / d + 2) * 60;
		else h = ((rn - gn) / d + 4) * 60;
		return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
	},

	lab: (r, g, b) => {
		const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
		let x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
		let y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
		let z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;
		x /= 0.95047; y /= 1.0; z /= 1.08883;
		const f = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
		const [fx, fy, fz] = [f(x), f(y), f(z)];
		const L = 116 * fy - 16;
		const A = 500 * (fx - fy);
		const B = 200 * (fy - fz);
		return `lab(${L.toFixed(1)}% ${A.toFixed(1)} ${B.toFixed(1)})`;
	},

	oklch: (r, g, b) => {
		const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
		let l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
		let m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
		let s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
		l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
		const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
		const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
		const bk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
		const C = Math.sqrt(a * a + bk * bk);
		let H = Math.atan2(bk, a) * 180 / Math.PI;
		if (H < 0) H += 360;
		return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(4)} ${H.toFixed(1)})`;
	},
	cmyk: (r, g, b) => {
		const [rn, gn, bn] = [r / 255, g / 255, b / 255];
		const k = 1 - Math.max(rn, gn, bn);
		if (k === 1) return `cmyk(0%, 0%, 0%, 100%)`;
		const c = (1 - rn - k) / (1 - k);
		const m = (1 - gn - k) / (1 - k);
		const y = (1 - bn - k) / (1 - k);
		return `cmyk(${Math.round(c * 100)}%, ${Math.round(m * 100)}%, ${Math.round(y * 100)}%, ${Math.round(k * 100)}%)`;
	}
};

function initCalculatedColors() {
	document.querySelectorAll('[data-color-format]').forEach(el => {

		const className = el.getAttribute('data-color-source') || 'swatch';
		const property = el.getAttribute('data-color-property') || 'background-color';
		const format = el.getAttribute('data-color-format');

		let container = el.parentElement;
		let target;
		while (container && !(target = container.querySelector('.' + className))) {
			container = container.parentElement;
		}
		if (!target) return;

		const computed = getComputedStyle(target)[property];
		const rgb = parseComputedColor(computed);
		if (!rgb) return;

		const [r, g, b] = rgb;
		el.textContent = formatColor[format]?.(r, g, b) ?? computed;
	});

	// Log all color groups to console
	document.querySelectorAll('[data-color-format]').forEach(el => {
		const container = el.closest('.color');
		if (!container || container.dataset.logged) return;
		container.dataset.logged = true;

		const lines = [];
		let inlineParts = [];

		const flush = () => {
			if (inlineParts.length) {
				lines.push(inlineParts.join('\t'));
				inlineParts = [];
			}
		};

		container.querySelectorAll('*').forEach(child => {
			if (!child.children.length && child.textContent.trim()) {
				const display = getComputedStyle(child).display;
				const parentDisplay = getComputedStyle(child.parentElement).display;
				const isBlock = display.startsWith('block') || parentDisplay.startsWith('block');
				if (isBlock) {
					flush();
					lines.push(child.textContent.trim());
				} else {
					inlineParts.push(child.textContent.trim());
				}
			}
		});
		flush();

		console.log(lines.join('\n'));
	});
}

document.addEventListener('DOMContentLoaded', initCalculatedColors);
