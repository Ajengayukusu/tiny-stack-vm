// Tiny stack VM: a faithful interpreter of make.fun's tiny stack ISA v1
// (program/generator/subject/ISA.md in the kit). One run answers all 40
// instances in /input, writing /output/<id>/stdout.bin and exit.txt for
// each. Every trap, limit and edge rule of the ISA is honoured: wrapping
// 32-bit arithmetic with exact low-32 MUL, unsigned DIVU/MODU/LTU, the
// low-5-bit shift counts, PUSH8 sign extension, EXIT's low byte, and
// traps 2-11 with their own exit codes. Deterministic: no clock, no
// environment reads, no allocation that depends on timing.
//
// SPDX-License-Identifier: MIT
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Run one program on its input bytes; returns [stdout bytes, exit code].
function run(p: Uint8Array, u: Uint8Array): [Uint8Array, number] {
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const o = new Uint8Array(65536);
  let s = 0, c = 0, ol = 0, ip = 0, pc = 0, n = 0;
  const end = (e: number): [Uint8Array, number] => [o.slice(0, ol), e];
  for (;;) {
    if (n === 1e6) return end(10);
    if (pc < 0 || pc >= p.length) return end(9);
    const b = p[pc];
    let im = 0, po = 0, pu = 0;
    if (b < 8) { im = b === 1 ? 1 : b === 2 ? 4 : 0; po = [0, 0, 0, 1, 1, 2, 2, 3][b]; pu = [0, 1, 1, 0, 2, 2, 3, 3][b]; }
    else if (b >= 16 && b <= 34) { po = b === 23 || b === 27 ? 1 : 2; pu = 1; }
    else if (b >= 48 && b <= 52) { im = b === 52 ? 0 : 2; po = b === 49 || b === 50 ? 1 : 0; pu = 0; }
    else if (b === 64) { po = 1; pu = 1; }
    else if (b === 65) { po = 2; }
    else if (b >= 80 && b <= 83) { po = b === 82 ? 0 : 1; pu = b === 82 ? 1 : 0; }
    else return end(5);
    if (pc + im >= p.length) return end(9);
    n++;
    if (s < po) return end(2);
    if (s - po + pu > 256) return end(3);
    const nx = pc + 1 + im;
    pc = nx;
    switch (b) {
      case 0: return end(0);
      case 1: D[s++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[s++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: s--; break;
      case 4: D[s] = D[s - 1]; s++; break;
      case 5: { const t = D[s - 1]; D[s - 1] = D[s - 2]; D[s - 2] = t; break; }
      case 6: D[s] = D[s - 2]; s++; break;
      case 7: { const a = D[s - 3]; D[s - 3] = D[s - 2]; D[s - 2] = D[s - 1]; D[s - 1] = a; break; }
      case 23: D[s - 1] = -D[s - 1] | 0; break;
      case 27: D[s - 1] = ~D[s - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = b === 48;
        if (b !== 48) { const v = D[--s]; take = b === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51: {
        if (c === 64) return end(7);
        C[c++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      }
      case 52:
        if (c === 0) return end(8);
        pc = C[--c];
        break;
      case 64: {
        const a = D[s - 1];
        if (a < 0 || a >= 256) return end(6);
        D[s - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[s - 1], v = D[s - 2];
        if (a < 0 || a >= 256) return end(6);
        s -= 2; M[a] = v;
        break;
      }
      case 80: {
        const bs = Buffer.from(String(D[s - 1]));
        if (ol + bs.length > 65536) return end(11);
        s--; o.set(bs, ol); ol += bs.length;
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        o[ol++] = D[--s] & 255;
        break;
      case 82: D[s++] = ip < u.length ? u[ip++] : -1; break;
      case 83: return end(D[--s] & 255);
      default: {
        const y = D[s - 1], x = D[s - 2];
        let r: number;
        if (b === 16) r = (x + y) | 0;
        else if (b === 17) r = (x - y) | 0;
        else if (b === 18) r = Math.imul(x, y);
        else if (b === 19) { if (y === 0) return end(4); r = (x / y) | 0; }
        else if (b === 20) { if (y === 0) return end(4); r = y === -1 ? 0 : (x % y) | 0; }
        else if (b === 21) { if (y === 0) return end(4); r = Math.floor((x >>> 0) / (y >>> 0)) | 0; }
        else if (b === 22) { if (y === 0) return end(4); r = ((x >>> 0) % (y >>> 0)) | 0; }
        else if (b === 24) r = x & y;
        else if (b === 25) r = x | y;
        else if (b === 26) r = x ^ y;
        else if (b === 28) r = x << (y & 31);
        else if (b === 29) r = x >> (y & 31);
        else if (b === 30) r = (x >>> (y & 31)) | 0;
        else if (b === 32) r = x === y ? 1 : 0;
        else if (b === 33) r = x < y ? 1 : 0;
        else r = (x >>> 0) < (y >>> 0) ? 1 : 0;
        s -= 2; D[s++] = r;
        break;
      }
    }
  }
}

for (const id of readdirSync(IN).sort()) {
  const [out, code] = run(new Uint8Array(readFileSync(join(IN, id, 'program.bin'))), new Uint8Array(readFileSync(join(IN, id, 'input.bin'))));
  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, 'stdout.bin'), out);
  writeFileSync(join(OUT, id, 'exit.txt'), `${code}\n`);
}
